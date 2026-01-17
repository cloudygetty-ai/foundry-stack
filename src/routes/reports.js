import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/reports
 * Submit a report
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { type, targetId, reason, details } = req.body;

    // Validate required fields
    if (!type || !targetId || !reason) {
      throw new ValidationError('Type, target ID, and reason are required');
    }

    // Validate report type
    const validTypes = ['user', 'message', 'photo', 'beacon', 'spot'];
    if (!validTypes.includes(type)) {
      throw new ValidationError(`Invalid report type. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate reason
    const validReasons = [
      'inappropriate',
      'spam',
      'harassment',
      'fake_profile',
      'underage',
      'violence',
      'hate_speech',
      'scam',
      'other'
    ];
    if (!validReasons.includes(reason)) {
      throw new ValidationError(`Invalid reason. Must be one of: ${validReasons.join(', ')}`);
    }

    // Verify target exists based on type
    let targetExists = false;
    switch (type) {
      case 'user':
        targetExists = await prisma.user.findUnique({ where: { id: targetId } });
        break;
      case 'message':
        targetExists = await prisma.message.findUnique({ where: { id: targetId } });
        break;
      case 'photo':
        targetExists = await prisma.mediaAsset.findUnique({ where: { id: targetId } });
        break;
      case 'beacon':
        targetExists = await prisma.beacon.findUnique({ where: { id: targetId } });
        break;
      case 'spot':
        targetExists = await prisma.spot.findUnique({ where: { id: targetId } });
        break;
    }

    if (!targetExists) {
      throw new NotFoundError(`${type} not found`);
    }

    // Check if user already reported this item
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId: req.userId,
        type,
        targetId
      }
    });

    if (existingReport) {
      throw new ValidationError('You have already reported this item');
    }

    // Create report
    const report = await prisma.report.create({
      data: {
        reporterId: req.userId,
        type,
        targetId,
        reason,
        details: details || null,
        status: 'pending'
      }
    });

    logger.warn({
      reportId: report.id,
      reporterId: req.userId,
      type,
      targetId,
      reason
    }, 'Report submitted');

    res.status(201).json({
      success: true,
      report: {
        id: report.id,
        status: report.status,
        createdAt: report.createdAt
      },
      message: 'Report submitted successfully. Our team will review it shortly.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/mine
 * Get current user's submitted reports
 */
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;

    const whereClause = {
      reporterId: req.userId
    };

    if (status) {
      whereClause.status = status;
    }

    const reports = await prisma.report.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: Math.min(parseInt(limit), 100)
    });

    res.json({
      success: true,
      reports
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/:reportId
 * Get report by ID
 */
router.get('/:reportId', authenticate, async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const report = await prisma.report.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      throw new NotFoundError('Report not found');
    }

    // Only reporter can view their own report
    if (report.reporterId !== req.userId) {
      throw new ValidationError('You can only view your own reports');
    }

    res.json({
      success: true,
      report
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/reports/:reportId
 * Cancel/delete a report
 */
router.delete('/:reportId', authenticate, async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const report = await prisma.report.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      throw new NotFoundError('Report not found');
    }

    // Only reporter can delete their own report
    if (report.reporterId !== req.userId) {
      throw new ValidationError('You can only delete your own reports');
    }

    // Only allow deletion if still pending
    if (report.status !== 'pending') {
      throw new ValidationError('Cannot delete a report that has been reviewed');
    }

    await prisma.report.delete({
      where: { id: reportId }
    });

    logger.info({ reportId, userId: req.userId }, 'Report deleted');

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/reasons
 * Get available report reasons
 */
router.get('/reasons', (req, res) => {
  const reasons = [
    {
      id: 'inappropriate',
      name: 'Inappropriate Content',
      description: 'Sexual, violent, or otherwise inappropriate content'
    },
    {
      id: 'spam',
      name: 'Spam',
      description: 'Repetitive, commercial, or promotional content'
    },
    {
      id: 'harassment',
      name: 'Harassment',
      description: 'Bullying, threatening, or harassing behavior'
    },
    {
      id: 'fake_profile',
      name: 'Fake Profile',
      description: 'Profile using fake information or impersonating someone'
    },
    {
      id: 'underage',
      name: 'Underage User',
      description: 'User appears to be under 18 years old'
    },
    {
      id: 'violence',
      name: 'Violence',
      description: 'Content depicting or encouraging violence'
    },
    {
      id: 'hate_speech',
      name: 'Hate Speech',
      description: 'Content promoting hatred based on identity'
    },
    {
      id: 'scam',
      name: 'Scam or Fraud',
      description: 'Attempting to scam or defraud users'
    },
    {
      id: 'other',
      name: 'Other',
      description: 'Other violation not listed above'
    }
  ];

  res.json({
    success: true,
    reasons
  });
});

/**
 * GET /api/reports/stats
 * Get report statistics for user
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const [total, pending, reviewed, actioned] = await Promise.all([
      prisma.report.count({
        where: { reporterId: req.userId }
      }),
      prisma.report.count({
        where: {
          reporterId: req.userId,
          status: 'pending'
        }
      }),
      prisma.report.count({
        where: {
          reporterId: req.userId,
          status: 'reviewed'
        }
      }),
      prisma.report.count({
        where: {
          reporterId: req.userId,
          status: 'actioned'
        }
      })
    ]);

    res.json({
      success: true,
      stats: {
        total,
        pending,
        reviewed,
        actioned
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin endpoints (placeholder - requires admin authentication)
 */

/**
 * GET /api/reports/admin/pending
 * Get all pending reports (admin only)
 */
router.get('/admin/pending', authenticate, async (req, res, next) => {
  try {
    // TODO: Check if user is admin

    const { limit = 50, type } = req.query;

    const whereClause = {
      status: 'pending'
    };

    if (type) {
      whereClause.type = type;
    }

    const reports = await prisma.report.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'asc'
      },
      take: Math.min(parseInt(limit), 100),
      include: {
        reporter: {
          select: {
            id: true,
            displayName: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      reports
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/reports/:reportId/review
 * Review a report (admin only)
 */
router.put('/:reportId/review', authenticate, async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const { status, action } = req.body;

    // TODO: Check if user is admin

    if (!['reviewed', 'actioned'].includes(status)) {
      throw new ValidationError('Status must be either "reviewed" or "actioned"');
    }

    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        reviewedBy: req.userId,
        reviewedAt: new Date()
      }
    });

    logger.info({
      reportId,
      reviewerId: req.userId,
      status,
      action
    }, 'Report reviewed');

    // TODO: Take action based on report (ban user, remove content, etc.)

    res.json({
      success: true,
      report,
      message: 'Report reviewed successfully'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
