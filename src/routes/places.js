import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/places/venues
 * Get nearby venues (bars, clubs, parks, etc.)
 */
router.get('/venues', authenticate, async (req, res, next) => {
  try {
    const { lat, lng, radiusMeters = 5000, kind, limit = 100 } = req.query;

    if (!lat || !lng) {
      throw new ValidationError('Latitude and longitude are required');
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radius = parseInt(radiusMeters);
    const maxResults = Math.min(parseInt(limit), 200);

    // Build kind filter
    let kindFilter = '';
    if (kind) {
      kindFilter = `AND v.kind = '${kind}'`;
    }

    // Get nearby venues using PostGIS
    const venues = await prisma.$queryRawUnsafe(`
      SELECT 
        v.id,
        v.name,
        v.kind,
        v.description,
        v.lat,
        v.lng,
        v.address,
        v.website,
        v.verified,
        ROUND(
          ST_Distance(
            v.geo,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric,
          0
        ) AS "distanceMeters"
      FROM "Venue" v
      WHERE ST_DWithin(
        v.geo,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
      ${kindFilter}
      ORDER BY "distanceMeters" ASC
      LIMIT $4
    `, longitude, latitude, radius, maxResults);

    res.json({
      success: true,
      venues,
      meta: {
        count: venues.length,
        searchRadius: radius
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/places/venues/:venueId
 * Get venue by ID
 */
router.get('/venues/:venueId', authenticate, async (req, res, next) => {
  try {
    const { venueId } = req.params;

    const venue = await prisma.venue.findUnique({
      where: { id: venueId }
    });

    if (!venue) {
      throw new NotFoundError('Venue not found');
    }

    res.json({
      success: true,
      venue
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/places/venue-kinds
 * Get available venue categories
 */
router.get('/venue-kinds', (req, res) => {
  const kinds = [
    { id: 'bar', name: 'Bar', icon: '🍺' },
    { id: 'club', name: 'Club', icon: '💃' },
    { id: 'restaurant', name: 'Restaurant', icon: '🍽️' },
    { id: 'cafe', name: 'Cafe', icon: '☕' },
    { id: 'park', name: 'Park', icon: '🌳' },
    { id: 'gym', name: 'Gym', icon: '💪' },
    { id: 'library', name: 'Library', icon: '📚' },
    { id: 'cinema', name: 'Cinema', icon: '🎬' },
    { id: 'museum', name: 'Museum', icon: '🖼️' },
    { id: 'theater', name: 'Theater', icon: '🎭' },
    { id: 'mall', name: 'Shopping Mall', icon: '🛍️' },
    { id: 'beach', name: 'Beach', icon: '🏖️' }
  ];

  res.json({
    success: true,
    kinds
  });
});

/**
 * GET /api/places/spots
 * Get nearby user-generated spots
 */
router.get('/spots', authenticate, async (req, res, next) => {
  try {
    const { lat, lng, radiusMeters = 5000, limit = 100 } = req.query;

    if (!lat || !lng) {
      throw new ValidationError('Latitude and longitude are required');
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radius = parseInt(radiusMeters);
    const maxResults = Math.min(parseInt(limit), 200);

    // Get nearby approved spots using PostGIS
    const spots = await prisma.$queryRawUnsafe(`
      SELECT 
        s.id,
        s.title,
        s.note,
        s.lat,
        s.lng,
        s."createdAt",
        u.id as "userId",
        u."displayName" as "userDisplayName",
        u."photoUrl" as "userPhotoUrl",
        ROUND(
          ST_Distance(
            s.geo,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric,
          0
        ) AS "distanceMeters"
      FROM "Spot" s
      JOIN "User" u ON s."userId" = u.id
      WHERE s.approved = true
        AND s.flagged = false
        AND ST_DWithin(
          s.geo,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
      ORDER BY "distanceMeters" ASC
      LIMIT $4
    `, longitude, latitude, radius, maxResults);

    res.json({
      success: true,
      spots,
      meta: {
        count: spots.length,
        searchRadius: radius
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/places/spots
 * Create a new user-generated spot
 */
router.post('/spots', authenticate, async (req, res, next) => {
  try {
    const { title, note, lat, lng } = req.body;

    if (!title || typeof lat !== 'number' || typeof lng !== 'number') {
      throw new ValidationError('Title, latitude, and longitude are required');
    }

    if (lat < -90 || lat > 90) {
      throw new ValidationError('Latitude must be between -90 and 90');
    }

    if (lng < -180 || lng > 180) {
      throw new ValidationError('Longitude must be between -180 and 180');
    }

    // Create spot (pending approval)
    const spot = await prisma.spot.create({
      data: {
        userId: req.userId,
        title,
        note: note || '',
        lat,
        lng,
        approved: false // Requires moderation
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

    logger.info({ userId: req.userId, spotId: spot.id }, 'Spot created');

    res.status(201).json({
      success: true,
      spot,
      message: 'Spot submitted for approval'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/places/spots/mine
 * Get current user's spots
 */
router.get('/spots/mine', authenticate, async (req, res, next) => {
  try {
    const spots = await prisma.spot.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
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
      spots
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/places/spots/:spotId
 * Get spot by ID
 */
router.get('/spots/:spotId', authenticate, async (req, res, next) => {
  try {
    const { spotId } = req.params;

    const spot = await prisma.spot.findUnique({
      where: { id: spotId },
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

    if (!spot) {
      throw new NotFoundError('Spot not found');
    }

    // Check if user can view (must be approved or own spot)
    if (!spot.approved && spot.userId !== req.userId) {
      throw new NotFoundError('Spot not found');
    }

    res.json({
      success: true,
      spot
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/places/spots/:spotId
 * Update a spot
 */
router.put('/spots/:spotId', authenticate, async (req, res, next) => {
  try {
    const { spotId } = req.params;
    const { title, note } = req.body;

    const spot = await prisma.spot.findUnique({
      where: { id: spotId }
    });

    if (!spot) {
      throw new NotFoundError('Spot not found');
    }

    // Check ownership
    if (spot.userId !== req.userId) {
      throw new ForbiddenError('You can only update your own spots');
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (note !== undefined) updateData.note = note;

    const updated = await prisma.spot.update({
      where: { id: spotId },
      data: updateData
    });

    res.json({
      success: true,
      spot: updated
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/places/spots/:spotId
 * Delete a spot
 */
router.delete('/spots/:spotId', authenticate, async (req, res, next) => {
  try {
    const { spotId } = req.params;

    const spot = await prisma.spot.findUnique({
      where: { id: spotId }
    });

    if (!spot) {
      throw new NotFoundError('Spot not found');
    }

    // Check ownership
    if (spot.userId !== req.userId) {
      throw new ForbiddenError('You can only delete your own spots');
    }

    await prisma.spot.delete({
      where: { id: spotId }
    });

    logger.info({ userId: req.userId, spotId }, 'Spot deleted');

    res.json({
      success: true,
      message: 'Spot deleted successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/places/spots/:spotId/moderate
 * Moderate a spot (admin only - placeholder)
 */
router.put('/spots/:spotId/moderate', authenticate, async (req, res, next) => {
  try {
    const { spotId } = req.params;
    const { approved, flagged } = req.body;

    // TODO: Check if user is admin

    const spot = await prisma.spot.update({
      where: { id: spotId },
      data: {
        approved: approved !== undefined ? approved : undefined,
        flagged: flagged !== undefined ? flagged : undefined
      }
    });

    logger.info({ spotId, approved, flagged }, 'Spot moderated');

    res.json({
      success: true,
      spot
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/places/spots/:spotId/report
 * Report a spot
 */
router.post('/spots/:spotId/report', authenticate, async (req, res, next) => {
  try {
    const { spotId } = req.params;
    const { reason, details } = req.body;

    if (!reason) {
      throw new ValidationError('Reason is required');
    }

    const spot = await prisma.spot.findUnique({
      where: { id: spotId }
    });

    if (!spot) {
      throw new NotFoundError('Spot not found');
    }

    // Create report
    await prisma.report.create({
      data: {
        reporterId: req.userId,
        type: 'spot',
        targetId: spotId,
        reason,
        details: details || null
      }
    });

    logger.warn({ userId: req.userId, spotId, reason }, 'Spot reported');

    res.json({
      success: true,
      message: 'Report submitted successfully'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
