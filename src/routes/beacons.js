import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/beacons
 * Create a new beacon
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { title, category, description, lat, lng, radiusMeters, durationMinutes } = req.body;

    // Validate required fields
    if (!title || !category || !lat || !lng) {
      throw new ValidationError('Title, category, latitude, and longitude are required');
    }

    // Validate coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new ValidationError('Invalid coordinates');
    }

    if (lat < -90 || lat > 90) {
      throw new ValidationError('Latitude must be between -90 and 90');
    }

    if (lng < -180 || lng > 180) {
      throw new ValidationError('Longitude must be between -180 and 180');
    }

    // Validate radius
    const radius = radiusMeters || 500;
    if (radius < 100 || radius > 5000) {
      throw new ValidationError('Radius must be between 100 and 5000 meters');
    }

    // Calculate expiration (default 2 hours)
    const duration = durationMinutes || 120;
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    // Create beacon
    const beacon = await prisma.beacon.create({
      data: {
        userId: req.userId,
        title,
        category,
        description: description || '',
        lat,
        lng,
        radiusMeters: radius,
        expiresAt
      },
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

    logger.info({ userId: req.userId, beaconId: beacon.id }, 'Beacon created');

    res.status(201).json({
      success: true,
      beacon
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/beacons/nearby
 * Get beacons near a location
 */
router.get('/nearby', authenticate, async (req, res, next) => {
  try {
    const { lat, lng, radiusMeters = 5000, category, limit = 50 } = req.query;

    if (!lat || !lng) {
      throw new ValidationError('Latitude and longitude are required');
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radius = parseInt(radiusMeters);
    const maxResults = Math.min(parseInt(limit), 100);

    // Build category filter
    let categoryFilter = '';
    if (category) {
      categoryFilter = `AND b.category = '${category}'`;
    }

    // Get nearby active beacons using PostGIS
    const beacons = await prisma.$queryRawUnsafe(`
      SELECT 
        b.id,
        b.title,
        b.category,
        b.description,
        b.lat,
        b.lng,
        b."radiusMeters",
        b."expiresAt",
        b."createdAt",
        u.id as "userId",
        u."displayName" as "userDisplayName",
        u."photoUrl" as "userPhotoUrl",
        ROUND(
          ST_Distance(
            b.geo,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric,
          0
        ) AS "distanceMeters"
      FROM "Beacon" b
      JOIN "User" u ON b."userId" = u.id
      WHERE b.active = true
        AND b."expiresAt" > NOW()
        AND ST_DWithin(
          b.geo,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        ${categoryFilter}
      ORDER BY "distanceMeters" ASC
      LIMIT $4
    `, longitude, latitude, radius, maxResults);

    res.json({
      success: true,
      beacons,
      meta: {
        count: beacons.length,
        searchRadius: radius
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/beacons/mine
 * Get current user's beacons
 */
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const { includeExpired = false } = req.query;

    const whereClause = {
      userId: req.userId
    };

    if (includeExpired !== 'true') {
      whereClause.expiresAt = {
        gt: new Date()
      };
    }

    const beacons = await prisma.beacon.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
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

    res.json({
      success: true,
      beacons
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/beacons/:beaconId
 * Get beacon by ID
 */
router.get('/:beaconId', authenticate, async (req, res, next) => {
  try {
    const { beaconId } = req.params;

    const beacon = await prisma.beacon.findUnique({
      where: { id: beaconId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true,
            isVerified: true
          }
        }
      }
    });

    if (!beacon) {
      throw new NotFoundError('Beacon not found');
    }

    // Check if expired
    if (new Date(beacon.expiresAt) < new Date()) {
      throw new ValidationError('Beacon has expired');
    }

    res.json({
      success: true,
      beacon
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/beacons/:beaconId
 * Update a beacon
 */
router.put('/:beaconId', authenticate, async (req, res, next) => {
  try {
    const { beaconId } = req.params;
    const { title, description, active } = req.body;

    // Find beacon
    const beacon = await prisma.beacon.findUnique({
      where: { id: beaconId }
    });

    if (!beacon) {
      throw new NotFoundError('Beacon not found');
    }

    // Check ownership
    if (beacon.userId !== req.userId) {
      throw new ForbiddenError('You can only update your own beacons');
    }

    // Update beacon
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (active !== undefined) updateData.active = active;

    const updated = await prisma.beacon.update({
      where: { id: beaconId },
      data: updateData,
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

    logger.info({ userId: req.userId, beaconId }, 'Beacon updated');

    res.json({
      success: true,
      beacon: updated
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/beacons/:beaconId
 * Delete a beacon
 */
router.delete('/:beaconId', authenticate, async (req, res, next) => {
  try {
    const { beaconId } = req.params;

    // Find beacon
    const beacon = await prisma.beacon.findUnique({
      where: { id: beaconId }
    });

    if (!beacon) {
      throw new NotFoundError('Beacon not found');
    }

    // Check ownership
    if (beacon.userId !== req.userId) {
      throw new ForbiddenError('You can only delete your own beacons');
    }

    // Delete beacon
    await prisma.beacon.delete({
      where: { id: beaconId }
    });

    logger.info({ userId: req.userId, beaconId }, 'Beacon deleted');

    res.json({
      success: true,
      message: 'Beacon deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/beacons/categories
 * Get available beacon categories
 */
router.get('/categories', (req, res) => {
  const categories = [
    { id: 'coffee', name: 'Coffee', icon: '☕' },
    { id: 'drinks', name: 'Drinks', icon: '🍺' },
    { id: 'food', name: 'Food', icon: '🍕' },
    { id: 'activity', name: 'Activity', icon: '⚽' },
    { id: 'study', name: 'Study', icon: '📚' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'music', name: 'Music', icon: '🎵' },
    { id: 'sports', name: 'Sports', icon: '🏃' },
    { id: 'art', name: 'Art', icon: '🎨' },
    { id: 'movie', name: 'Movie', icon: '🎬' },
    { id: 'party', name: 'Party', icon: '🎉' },
    { id: 'other', name: 'Other', icon: '💬' }
  ];

  res.json({
    success: true,
    categories
  });
});

/**
 * POST /api/beacons/:beaconId/extend
 * Extend beacon expiration time
 */
router.post('/:beaconId/extend', authenticate, async (req, res, next) => {
  try {
    const { beaconId } = req.params;
    const { minutesToAdd = 60 } = req.body;

    // Find beacon
    const beacon = await prisma.beacon.findUnique({
      where: { id: beaconId }
    });

    if (!beacon) {
      throw new NotFoundError('Beacon not found');
    }

    // Check ownership
    if (beacon.userId !== req.userId) {
      throw new ForbiddenError('You can only extend your own beacons');
    }

    // Check if already expired
    if (new Date(beacon.expiresAt) < new Date()) {
      throw new ValidationError('Cannot extend expired beacon');
    }

    // Extend expiration
    const minutes = Math.min(parseInt(minutesToAdd), 240); // Max 4 hours
    const newExpiration = new Date(new Date(beacon.expiresAt).getTime() + minutes * 60 * 1000);

    const updated = await prisma.beacon.update({
      where: { id: beaconId },
      data: { expiresAt: newExpiration }
    });

    res.json({
      success: true,
      beacon: updated,
      message: `Beacon extended by ${minutes} minutes`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/beacons/stats
 * Get beacon statistics
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const [total, active, expired] = await Promise.all([
      prisma.beacon.count({
        where: { userId: req.userId }
      }),
      prisma.beacon.count({
        where: {
          userId: req.userId,
          active: true,
          expiresAt: { gt: new Date() }
        }
      }),
      prisma.beacon.count({
        where: {
          userId: req.userId,
          expiresAt: { lt: new Date() }
        }
      })
    ]);

    res.json({
      success: true,
      stats: {
        total,
        active,
        expired
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
