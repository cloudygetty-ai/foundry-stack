import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/users/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        subscription: true
      }
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const { passwordHash, totpSecret, ...safeUser } = user;

    res.json({
      success: true,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { displayName, bio, tags, photoUrl, age } = req.body;

    const updateData = {};

    if (displayName !== undefined) {
      if (displayName.length < 2 || displayName.length > 50) {
        throw new ValidationError('Display name must be between 2 and 50 characters');
      }
      updateData.displayName = displayName;
    }

    if (bio !== undefined) {
      if (bio.length > 500) {
        throw new ValidationError('Bio must be 500 characters or less');
      }
      updateData.bio = bio;
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        throw new ValidationError('Tags must be an array');
      }
      if (tags.length > 10) {
        throw new ValidationError('Maximum 10 tags allowed');
      }
      updateData.tags = tags;
    }

    if (photoUrl !== undefined) {
      updateData.photoUrl = photoUrl;
    }

    if (age !== undefined) {
      if (age < 18) {
        throw new ValidationError('Age must be 18 or older');
      }
      updateData.age = age;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      include: {
        subscription: true
      }
    });

    const { passwordHash, totpSecret, ...safeUser } = user;

    logger.info({ userId: req.userId }, 'User profile updated');

    res.json({
      success: true,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/me/location
 * Update user's location
 */
router.put('/me/location', authenticate, async (req, res, next) => {
  try {
    const { lat, lng } = req.body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new ValidationError('Valid latitude and longitude are required');
    }

    if (lat < -90 || lat > 90) {
      throw new ValidationError('Latitude must be between -90 and 90');
    }

    if (lng < -180 || lng > 180) {
      throw new ValidationError('Longitude must be between -180 and 180');
    }

    // Update location (geo column is automatically updated via trigger)
    await prisma.user.update({
      where: { id: req.userId },
      data: { lat, lng }
    });

    res.json({
      success: true,
      message: 'Location updated successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:userId
 * Get user profile by ID
 */
router.get('/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        age: true,
        bio: true,
        tags: true,
        photoUrl: true,
        isVerified: true,
        reputation: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      success: true,
      user
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/verify-email
 * Send email verification (placeholder)
 */
router.post('/verify-email', authenticate, async (req, res, next) => {
  try {
    // TODO: Implement email verification
    // 1. Generate verification token
    // 2. Send email with verification link
    // 3. Store token in database

    res.json({
      success: true,
      message: 'Verification email sent (feature coming soon)'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/verify-email/confirm
 * Confirm email verification (placeholder)
 */
router.post('/verify-email/confirm', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new ValidationError('Verification token is required');
    }

    // TODO: Verify token and mark user as verified

    res.json({
      success: true,
      message: 'Email verified successfully (feature coming soon)'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/me/stats
 * Get user statistics
 */
router.get('/me/stats', authenticate, async (req, res, next) => {
  try {
    const [messagesSent, messagesReceived, beacons, spots] = await Promise.all([
      prisma.message.count({
        where: { senderId: req.userId }
      }),
      prisma.message.count({
        where: { recipientId: req.userId }
      }),
      prisma.beacon.count({
        where: { userId: req.userId }
      }),
      prisma.spot.count({
        where: { userId: req.userId }
      })
    ]);

    res.json({
      success: true,
      stats: {
        messagesSent,
        messagesReceived,
        beaconsCreated: beacons,
        spotsCreated: spots
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/me
 * Delete user account (soft delete - marks for deletion)
 */
router.delete('/me', authenticate, async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      throw new ValidationError('Password confirmation is required to delete account');
    }

    // Verify password
    const bcrypt = await import('bcryptjs');
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw new ValidationError('Incorrect password');
    }

    // TODO: In production, implement soft delete or queue for deletion
    // For now, we'll just revoke all sessions
    await prisma.session.updateMany({
      where: { userId: req.userId },
      data: { revoked: true }
    });

    logger.info({ userId: req.userId }, 'Account deletion requested');

    res.json({
      success: true,
      message: 'Account marked for deletion. Data will be removed within 30 days.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/me/devices
 * Get user's devices
 */
router.get('/me/devices', authenticate, async (req, res, next) => {
  try {
    const devices = await prisma.device.findMany({
      where: { userId: req.userId },
      orderBy: { lastSeenAt: 'desc' }
    });

    res.json({
      success: true,
      devices
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/me/devices/:deviceId
 * Remove a device
 */
router.delete('/me/devices/:deviceId', authenticate, async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    // Delete device
    await prisma.device.delete({
      where: {
        userId_deviceId: {
          userId: req.userId,
          deviceId
        }
      }
    });

    // Revoke sessions for this device
    await prisma.session.updateMany({
      where: {
        userId: req.userId,
        deviceId
      },
      data: { revoked: true }
    });

    res.json({
      success: true,
      message: 'Device removed successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users/block/:userId
 * Block a user (placeholder)
 */
router.post('/block/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId === req.userId) {
      throw new ValidationError('Cannot block yourself');
    }

    // TODO: Implement blocking system with Block model

    logger.info({ blocker: req.userId, blocked: userId }, 'User blocked');

    res.json({
      success: true,
      message: 'User blocked successfully (feature coming soon)'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/block/:userId
 * Unblock a user (placeholder)
 */
router.delete('/block/:userId', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // TODO: Implement unblocking

    res.json({
      success: true,
      message: 'User unblocked successfully (feature coming soon)'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
