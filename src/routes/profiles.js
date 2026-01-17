import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/profiles/search
 * Search for nearby users using PostGIS geospatial queries
 */
router.get('/search', authenticate, async (req, res, next) => {
  try {
    const {
      lat,
      lng,
      maxDistanceMeters = 5000,
      limit = 50,
      tags,
      minAge,
      maxAge,
      onlineOnly
    } = req.query;

    // Validate coordinates
    if (!lat || !lng) {
      throw new ValidationError('Latitude and longitude are required');
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new ValidationError('Invalid coordinates');
    }

    if (latitude < -90 || latitude > 90) {
      throw new ValidationError('Latitude must be between -90 and 90');
    }

    if (longitude < -180 || longitude > 180) {
      throw new ValidationError('Longitude must be between -180 and 180');
    }

    const distance = parseInt(maxDistanceMeters);
    const maxResults = Math.min(parseInt(limit), 100); // Cap at 100 results

    // Build filter conditions
    let ageFilter = '';
    if (minAge) {
      ageFilter += ` AND u.age >= ${parseInt(minAge)}`;
    }
    if (maxAge) {
      ageFilter += ` AND u.age <= ${parseInt(maxAge)}`;
    }

    // Tag filter (if provided)
    let tagFilter = '';
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      const tagList = tagArray.map(t => `'${t}'`).join(',');
      tagFilter = ` AND u.tags && ARRAY[${tagList}]::text[]`;
    }

    // Use PostGIS for geospatial query
    const users = await prisma.$queryRawUnsafe(`
      SELECT 
        u.id,
        u."displayName",
        u.age,
        u.bio,
        u.tags,
        u."photoUrl",
        u."isVerified",
        u.reputation,
        ROUND(
          ST_Distance(
            u.geo,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric,
          0
        ) AS "distanceMeters"
      FROM "User" u
      WHERE u.id != $3
        AND u.geo IS NOT NULL
        AND ST_DWithin(
          u.geo,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $4
        )
        ${ageFilter}
        ${tagFilter}
      ORDER BY "distanceMeters" ASC
      LIMIT $5
    `, longitude, latitude, req.userId, distance, maxResults);

    // Add jitter to distance for privacy (±50-200 meters)
    const profiles = users.map(user => ({
      ...user,
      distanceMeters: user.distanceMeters + Math.floor(Math.random() * 150) + 50,
      // Don't expose exact location
      location: null
    }));

    logger.info({
      userId: req.userId,
      resultsCount: profiles.length,
      searchRadius: distance
    }, 'Profile search executed');

    res.json({
      success: true,
      profiles,
      meta: {
        count: profiles.length,
        searchRadius: distance,
        center: { lat: latitude, lng: longitude }
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profiles/recommended
 * Get recommended profiles based on user preferences and behavior
 */
router.get('/recommended', authenticate, async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    const maxResults = Math.min(parseInt(limit), 50);

    // Get current user with their preferences
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        lat: true,
        lng: true,
        tags: true,
        age: true
      }
    });

    if (!currentUser.lat || !currentUser.lng) {
      throw new ValidationError('Please update your location to see recommendations');
    }

    // Find users with similar interests within 10km
    const recommended = await prisma.$queryRawUnsafe(`
      SELECT 
        u.id,
        u."displayName",
        u.age,
        u.bio,
        u.tags,
        u."photoUrl",
        u."isVerified",
        u.reputation,
        ROUND(
          ST_Distance(
            u.geo,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric,
          0
        ) AS "distanceMeters",
        CASE 
          WHEN u.tags && $3::text[] THEN 
            (SELECT COUNT(*) FROM unnest(u.tags) tag WHERE tag = ANY($3::text[]))
          ELSE 0
        END AS "matchScore"
      FROM "User" u
      WHERE u.id != $4
        AND u.geo IS NOT NULL
        AND ST_DWithin(
          u.geo,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)
