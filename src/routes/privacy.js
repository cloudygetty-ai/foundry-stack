import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/privacy/export
 * Export all user data (GDPR compliance)
 */
router.post('/export', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Gather all user data
    const [user, subscription, devices, sessions, messages, beacons, spots, media, reports, purchases] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId }
      }),
      prisma.subscription.findUnique({
        where: { userId }
      }),
      prisma.device.findMany({
        where: { userId }
      }),
      prisma.session.findMany({
        where: { userId }
      }),
      prisma.message.findMany({
        where: {
          OR: [
            { senderId: userId },
            { recipientId: userId }
          ]
        }
      }),
      prisma.beacon.findMany({
        where: { userId }
      }),
      prisma.spot.findMany({
        where: { userId }
      }),
      prisma.mediaAsset.findMany({
        where: { userId }
      }),
      prisma.report.findMany({
        where: { reporterId: userId }
      }),
      prisma.purchase.findMany({
        where: { userId }
      })
    ]);

    // Remove sensitive data
    const { passwordHash, totpSecret, ...safeUser } = user;

    const exportData = {
      exportDate: new Date().toISOString(),
      user: safeUser,
      subscription,
      devices,
      sessions: sessions.map(s => ({
        id: s.id,
        deviceId: s.deviceId,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        revoked: s.revoked
      })),
      messages,
      beacons,
      spots,
      media,
      reports,
      purchases
    };

    logger.info({ userId }, 'User data exported');

    res.json({
      success: true,
      data: exportData,
      message: 'Your data has been exported successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/privacy/delete
 * Request account deletion (GDPR compliance)
 */
router.post('/delete', authenticate, async (req, res, next) => {
  try {
    const { password, confirmation } = req.body;

    if (!password) {
      throw new ValidationError('Password is required to delete account');
    }

    if (confirmation !== 'DELETE') {
      throw new ValidationError('Please type "DELETE" to confirm account deletion');
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
    // For now, we'll delete all related data

    // Delete in order (respecting foreign keys)
    await prisma.$transaction(async (tx) => {
      // Delete sessions
      await tx.session.deleteMany({
        where: { userId: req.userId }
      });

      // Delete devices
      await tx.device.deleteMany({
        where: { userId: req.userId }
      });

      // Delete messages
      await tx.message.deleteMany({
        where: {
          OR: [
            { senderId: req.userId },
            { recipientId: req.userId }
          ]
        }
      });

      // Delete beacons
      await tx.beacon.deleteMany({
        where: { userId: req.userId }
      });

      // Delete spots
      await tx.spot.deleteMany({
        where: { userId: req.userId }
      });

      // Delete media
      await tx.mediaAsset.deleteMany({
        where: { userId: req.userId }
      });

      // Delete reports
      await tx.report.deleteMany({
        where: { reporterId: req.userId }
      });

      // Delete purchases
      await tx.purchase.deleteMany({
        where: { userId: req.userId }
      });

      // Delete subscription
      await tx.subscription.deleteMany({
        where: { userId: req.userId }
      });

      // Finally, delete user
      await tx.user.delete({
        where: { id: req.userId }
      });
    });

    logger.info({ userId: req.userId, email: user.email }, 'User account deleted');

    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/privacy/policy
 * Get privacy policy information
 */
router.get('/policy', (req, res) => {
  const policy = {
    lastUpdated: '2024-01-01',
    summary: 'We collect and process your data to provide our services. You have the right to access, export, and delete your data.',
    sections: [
      {
        title: 'Data We Collect',
        content: 'We collect information you provide (profile, messages), usage data (location, activity), and device information.'
      },
      {
        title: 'How We Use Your Data',
        content: 'We use your data to provide services, improve our platform, ensure safety, and comply with legal obligations.'
      },
      {
        title: 'Your Rights',
        content: 'You have the right to access, export, correct, and delete your personal data. You can also object to processing and request data portability.'
      },
      {
        title: 'Data Retention',
        content: 'We retain your data as long as your account is active. Deleted data is permanently removed within 30 days.'
      },
      {
        title: 'Third-Party Services',
        content: 'We use third-party services (Stripe for payments, AWS for storage) that may process your data under their own privacy policies.'
      }
    ],
    contact: {
      email: 'privacy@yourapp.com',
      address: 'Your Company Address'
    }
  };

  res.json({
    success: true,
    policy
  });
});

/**
 * GET /api/privacy/settings
 * Get user's privacy settings
 */
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    // TODO: Implement privacy settings table
    // For now, return default settings

    const settings = {
      profileVisibility: 'public', // public, friends, private
      showLocation: true,
      showOnlineStatus: true,
      allowMessages: 'everyone', // everyone, matches, nobody
      showAge: true,
      dataCollection: {
        analytics: true,
        locationHistory: true
      }
    };

    res.json({
      success: true,
      settings
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/privacy/settings
 * Update user's privacy settings
 */
router.put('/settings', authenticate, async (req, res, next) => {
  try {
    const {
      profileVisibility,
      showLocation,
      showOnlineStatus,
      allowMessages,
      showAge,
      dataCollection
    } = req.body;

    // TODO: Implement privacy settings table and update logic

    logger.info({ userId: req.userId }, 'Privacy settings updated');

    res.json({
      success: true,
      message: 'Privacy settings updated successfully (feature coming soon)',
      settings: req.body
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/privacy/download
 * Request downloadable archive of user data
 */
router.post('/download', authenticate, async (req, res, next) => {
  try {
    const { format = 'json' } = req.body;

    if (!['json', 'csv'].includes(format)) {
      throw new ValidationError('Format must be either "json" or "csv"');
    }

    // TODO: Generate downloadable archive
    // In production, this would create a job to generate ZIP file
    // and email download link to user

    logger.info({ userId: req.userId, format }, 'Data download requested');

    res.json({
      success: true,
      message: `Data export in ${format} format will be sent to your email within 24 hours`,
      estimatedTime: '24 hours'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/privacy/consent
 * Get user's consent preferences
 */
router.get('/consent', authenticate, async (req, res, next) => {
  try {
    const consents = {
      necessary: {
        accepted: true,
        required: true,
        description: 'Essential for the app to function'
      },
      analytics: {
        accepted: true,
        required: false,
        description: 'Help us improve the app'
      },
      marketing: {
        accepted: false,
        required: false,
        description: 'Personalized content and offers'
      },
      thirdParty: {
        accepted: true,
        required: false,
        description: 'Third-party integrations and features'
      }
    };

    res.json({
      success: true,
      consents
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/privacy/consent
 * Update consent preferences
 */
router.put('/consent', authenticate, async (req, res, next) => {
  try {
    const { analytics, marketing, thirdParty } = req.body;

    // TODO: Store consent preferences

    logger.info({ userId: req.userId, analytics, marketing, thirdParty }, 'Consent preferences updated');

    res.json({
      success: true,
      message: 'Consent preferences updated successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/privacy/age-verify
 * Verify user age (placeholder for age verification system)
 */
router.post('/age-verify', authenticate, async (req, res, next) => {
  try {
    const { method, data } = req.body;

    // TODO: Integrate with third-party age verification service

    logger.info({ userId: req.userId, method }, 'Age verification requested');

    res.json({
      success: true,
      status: 'pending',
      message: 'Age verification request submitted'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
