import { PrismaClient } from '@prisma/client';
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { messagesSent } from '../utils/metrics.js';

const prisma = new PrismaClient();

export class MessageService {
  /**
   * Create a new message
   */
  async create({ senderId, recipientId, content, encrypted = false, viewOnce = false, mediaId = null }) {
    // Validate
    if (!senderId || !recipientId) {
      throw new ValidationError('Sender and recipient IDs are required');
    }

    if (!content && !mediaId) {
      throw new ValidationError('Content or media is required');
    }

    if (senderId === recipientId) {
      throw new ValidationError('Cannot send message to yourself');
    }

    // Check if recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, displayName: true }
    });

    if (!recipient) {
      throw new NotFoundError('Recipient not found');
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        senderId,
        recipientId,
        content: content || '',
        encrypted,
        viewOnce,
        mediaId,
        expiresAt: viewOnce ? new Date(Date.now() + 60 * 1000) : null // 1 minute for view-once
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true
          }
        }
      }
    });

    messagesSent.inc();
    logger.info({ messageId: message.id, from: senderId, to: recipientId }, 'Message created');

    return message;
  }

  /**
   * Get conversation between two users
   */
  async getConversation(userId, otherUserId, limit = 50, before = null) {
    if (!userId || !otherUserId) {
      throw new ValidationError('User IDs are required');
    }

    const whereClause = {
      OR: [
        { senderId: userId, recipientId: otherUserId },
        { senderId: otherUserId, recipientId: userId }
      ]
    };

    // Add pagination
    if (before) {
      whereClause.createdAt = {
        lt: new Date(before)
      };
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true
          }
        }
      }
    });

    // Filter out expired view-once messages
    const validMessages = messages.filter(msg => {
      if (!msg.expiresAt) return true;
      if (msg.viewedAt && msg.senderId !== userId) return false; // Already viewed by recipient
      return new Date(msg.expiresAt) > new Date();
    });

    // Mark messages as read
    const unreadIds = validMessages
      .filter(msg => msg.recipientId === userId && !msg.read)
      .map(msg => msg.id);

    if (unreadIds.length > 0) {
      await prisma.message.updateMany({
        where: {
          id: { in: unreadIds }
        },
        data: {
          read: true
        }
      });
    }

    return validMessages.reverse(); // Return in chronological order
  }

  /**
   * Get all conversations for a user
   */
  async getConversations(userId, limit = 20) {
    // Get unique conversation partners with their last message
    const conversations = await prisma.$queryRaw`
      WITH ranked_messages AS (
        SELECT 
          m.*,
          u.id as partner_id,
          u."displayName" as partner_name,
          u."photoUrl" as partner_photo,
          ROW_NUMBER() OVER (
            PARTITION BY 
              CASE 
                WHEN m."senderId" = ${userId} THEN m."recipientId"
                ELSE m."senderId"
              END
            ORDER BY m."createdAt" DESC
          ) as rn
        FROM "Message" m
        JOIN "User" u ON (
          CASE 
            WHEN m."senderId" = ${userId} THEN u.id = m."recipientId"
            ELSE u.id = m."senderId"
          END
        )
        WHERE m."senderId" = ${userId} OR m."recipientId" = ${userId}
      )
      SELECT 
        partner_id as "partnerId",
        partner_name as "partnerName",
        partner_photo as "partnerPhoto",
        content as "lastMessage",
        "createdAt" as "lastMessageAt",
        "senderId" = ${userId} as "sentByMe",
        read as "isRead"
      FROM ranked_messages
      WHERE rn = 1
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;

    return conversations;
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId, userId) {
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Only recipient can mark as read
    if (message.recipientId !== userId) {
      throw new ForbiddenError('You can only mark your own messages as read');
    }

    // Check if view-once message is still valid
    if (message.viewOnce && message.expiresAt && new Date(message.expiresAt) < new Date()) {
      throw new ForbiddenError('View-once message has expired');
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        read: true,
        viewedAt: message.viewOnce ? new Date() : message.viewedAt
      }
    });

    return updated;
  }

  /**
   * Delete a message (soft delete - only hides for user)
   */
  async deleteMessage(messageId, userId) {
    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Only sender can delete
    if (message.senderId !== userId) {
      throw new ForbiddenError('You can only delete your own messages');
    }

    // For now, actually delete. In production, you might want soft delete
    await prisma.message.delete({
      where: { id: messageId }
    });

    logger.info({ messageId, userId }, 'Message deleted');

    return { success: true };
  }

  /**
   * Get unread message count
   */
  async getUnreadCount(userId) {
    const count = await prisma.message.count({
      where: {
        recipientId: userId,
        read: false
      }
    });

    return count;
  }

  /**
   * Search messages
   */
  async searchMessages(userId, query, limit = 50) {
    if (!query || query.length < 2) {
      throw new ValidationError('Search query must be at least 2 characters');
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { recipientId: userId }
        ],
        content: {
          contains: query,
          mode: 'insensitive'
        },
        encrypted: false // Can't search encrypted messages
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true
          }
        },
        recipient: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true
          }
        }
      }
    });

    return messages;
  }

  /**
   * Clean up expired view-once messages (run periodically)
   */
  async cleanupExpiredMessages() {
    const result = await prisma.message.deleteMany({
      where: {
        viewOnce: true,
        expiresAt: {
          lt: new Date()
        }
      }
    });

    logger.info({ count: result.count }, 'Expired view-once messages cleaned up');

    return result.count;
  }

  /**
   * Get message statistics for user
   */
  async getMessageStats(userId) {
    const [sent, received, unread] = await Promise.all([
      prisma.message.count({
        where: { senderId: userId }
      }),
      prisma.message.count({
        where: { recipientId: userId }
      }),
      prisma.message.count({
        where: {
          recipientId: userId,
          read: false
        }
      })
    ]);

    return {
      sent,
      received,
      unread,
      total: sent + received
    };
  }

  /**
   * Block user (prevent messages)
   * TODO: Implement proper blocking system with Block model
   */
  async blockUser(userId, blockUserId) {
    // Placeholder - would need Block model in schema
    logger.info({ userId, blockUserId }, 'User blocked');
    return { success: true, message: 'Block feature coming soon' };
  }
}

export default MessageService;
