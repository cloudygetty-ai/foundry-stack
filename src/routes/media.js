import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const prisma = new PrismaClient();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * POST /api/media/sign
 * Get signed URL for direct upload to S3
 */
router.post('/sign', authenticate, async (req, res, next) => {
  try {
    const { filename, contentType, kind } = req.body;

    if (!filename || !contentType) {
      throw new ValidationError('Filename and content type are required');
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (!allowedTypes.includes(contentType)) {
      throw new ValidationError(`Invalid content type. Allowed: ${allowedTypes.join(', ')}`);
    }

    // Determine kind from content type
    const mediaKind = kind || (contentType.startsWith('video/') ? 'video' : 'photo');

    // Generate unique key
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = filename.split('.').pop();
    const key = `media/${req.userId}/${timestamp}-${randomString}.${extension}`;

    // Max file size
    const maxBytes = (parseInt(process.env.MAX_UPLOAD_MB) || 15) * 1024 * 1024;

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: maxBytes,
      ACL: 'private'
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

    const assetUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    logger.info({ userId: req.userId, key, kind: mediaKind }, 'Signed upload URL generated');

    res.json({
      success: true,
      uploadUrl,
      assetUrl,
      key,
      expiresIn: 300
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/media
 * Register uploaded media asset
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { assetUrl, kind, blurHash, width, height, sizeBytes } = req.body;

    if (!assetUrl || !kind) {
      throw new ValidationError('Asset URL and kind are required');
    }

    if (!['photo', 'video'].includes(kind)) {
      throw new ValidationError('Kind must be either "photo" or "video"');
    }

    // Create media asset record
    const media = await prisma.mediaAsset.create({
      data: {
        userId: req.userId,
        url: assetUrl,
        kind,
        blurHash: blurHash || null,
        width: width || null,
        height: height || null,
        sizeBytes: sizeBytes || null,
        status: 'pending' // Will be reviewed by moderation
      }
    });

    logger.info({ userId: req.userId, mediaId: media.id }, 'Media asset registered');

    // TODO: Trigger moderation check (AWS Rekognition, etc.)

    res.status(201).json({
      success: true,
      media
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/media/mine
 * Get current user's media assets
 */
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const { kind, status, limit = 50 } = req.query;

    const whereClause = {
      userId: req.userId
    };

    if (kind) {
      whereClause.kind = kind;
    }

    if (status) {
      whereClause.status = status;
    }

    const media = await prisma.mediaAsset.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: Math.min(parseInt(limit), 100)
    });

    res.json({
      success: true,
      media
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/media/:mediaId
 * Get media asset by ID
 */
router.get('/:mediaId', authenticate, async (req, res, next) => {
  try {
    const { mediaId } = req.params;

    const media = await prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true
          }
        }
      }
    });

    if (!media) {
      throw new NotFoundError('Media not found');
    }

    // Check if flagged or rejected
    if (media.status === 'rejected' && media.userId !== req.userId) {
      throw new NotFoundError('Media not found');
    }

    res.json({
      success: true,
      media
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/media/:mediaId
 * Delete media asset
 */
router.delete('/:mediaId', authenticate, async (req, res, next) => {
  try {
    const { mediaId } = req.params;

    const media = await prisma.mediaAsset.findUnique({
      where: { id: mediaId }
    });

    if (!media) {
      throw new NotFoundError('Media not found');
    }

    // Check ownership
    if (media.userId !== req.userId) {
      throw new ValidationError('You can only delete your own media');
    }

    // Delete from database
    await prisma.mediaAsset.delete({
      where: { id: mediaId }
    });

    // TODO: Delete from S3 bucket

    logger.info({ userId: req.userId, mediaId }, 'Media asset deleted');

    res.json({
      success: true,
      message: 'Media deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/media/:mediaId/report
 * Report inappropriate media
 */
router.post('/:mediaId/report', authenticate, async (req, res, next) => {
  try {
    const { mediaId } = req.params;
    const { reason, details } = req.body;

    if (!reason) {
      throw new ValidationError('Reason is required');
    }

    const media = await prisma.mediaAsset.findUnique({
      where: { id: mediaId }
    });

    if (!media) {
      throw new NotFoundError('Media not found');
    }

    // Create report
    await prisma.report.create({
      data: {
        reporterId: req.userId,
        type: 'photo',
        targetId: mediaId,
        reason,
        details: details || null
      }
    });

    logger.warn({ userId: req.userId, mediaId, reason }, 'Media reported');

    res.json({
      success: true,
      message: 'Report submitted successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/media/stats
 * Get media statistics for user
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const [photos, videos, pending, approved, rejected] = await Promise.all([
      prisma.mediaAsset.count({
        where: { userId: req.userId, kind: 'photo' }
      }),
      prisma.mediaAsset.count({
        where: { userId: req.userId, kind: 'video' }
      }),
      prisma.mediaAsset.count({
        where: { userId: req.userId, status: 'pending' }
      }),
      prisma.mediaAsset.count({
        where: { userId: req.userId, status: 'approved' }
      }),
      prisma.mediaAsset.count({
        where: { userId: req.userId, status: 'rejected' }
      })
    ]);

    res.json({
      success: true,
      stats: {
        photos,
        videos,
        total: photos + videos,
        pending,
        approved,
        rejected
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/media/:mediaId/moderate
 * Moderate media (admin only - placeholder)
 */
router.put('/:mediaId/moderate', authenticate, async (req, res, next) => {
  try {
    const { mediaId } = req.params;
    const { status, flagged } = req.body;

    // TODO: Check if user is admin

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const media = await prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        status,
        flagged: flagged || false
      }
    });

    logger.info({ mediaId, status }, 'Media moderated');

    res.json({
      success: true,
      media
    });
  } catch (err) {
    next(err);
  }
});

export default router;
