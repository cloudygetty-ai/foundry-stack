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
router.get('/mine', authenticate​​​​​​​​​​​​​​​​
