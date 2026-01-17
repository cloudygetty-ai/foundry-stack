import express from 'express';
import { MessageService } from '../services/MessageService.js';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError } from '../middleware/errorHandler.js';

export const router = express.Router();
const messageService = new MessageService();

/**
 * POST /api/messages
 * Send a new message
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { recipientId, content, encrypted, viewOnce, mediaId } = req.body;

    const message = await messageService.create({
      senderId: req.userId,
      recipientId,
      content,
      encrypted: encrypted || false,
      viewOnce: viewOnce || false,
      mediaId: mediaId || null
    });

    res.status(201).json({
      success: true,
      message
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/conversations
 * Get all conversations for current user
 */
router.get('/conversations', authenticate, async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;

    const conversations = await messageService.getConversations(
      req.userId,
      parseInt(limit)
    );

    res.json({
      success: true,
      conversations
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/conversation/:userId
 * Get conversation with a specific user
 */
router.get('/conversation/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 50, before } = req.query;

    const messages = await messageService.getConversation(
      req.userId,
      userId,
      parseInt(limit),
      before
    );

    res.json({
      success: true,
      messages
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/unread-count
 * Get count of unread messages
 */
router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const count = await messageService.getUnreadCount(req.userId);

    res.json({
      success: true,
      count
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/messages/:messageId/read
 * Mark a message as read
 */
router.put('/:messageId/read', authenticate, async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const message = await messageService.markAsRead(messageId, req.userId);

    res.json({
      success: true,
      message
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/messages/:messageId
 * Delete a message
 */
router.delete('/:messageId', authenticate, async (req, res, next) => {
  try {
    const { messageId } = req.params;

    await messageService.deleteMessage(messageId, req.userId);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/search
 * Search messages
 */
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const { q, limit = 50 } = req.query;

    if (!q) {
      throw new ValidationError('Search query is required');
    }

    const messages = await messageService.searchMessages(
      req.userId,
      q,
      parseInt(limit)
    );

    res.json({
      success: true,
      messages,
      query: q
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/stats
 * Get message statistics for current user
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const stats = await messageService.getMessageStats(req.userId);

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/messages/block/:userId
 * Block user from messaging
 */
router.post('/block/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId) {
      throw new ValidationError('Cannot block yourself');
    }

    await messageService.blockUser(req.userId, userId);

    res.json({
      success: true,
      message: 'User blocked from messaging'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
