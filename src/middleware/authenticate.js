import jwt from 'jsonwebtoken';
import { UnauthorizedError } from './errorHandler.js';
import { authFailures } from '../utils/metrics.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to authenticate JWT access tokens
 * Adds userId to req object if valid
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      authFailures.labels('missing_token').inc();
      throw new UnauthorizedError('Authorization header required');
    }

    if (!authHeader.startsWith('Bearer ')) {
      authFailures.labels('invalid_format').inc();
      throw new UnauthorizedError('Invalid authorization format. Use: Bearer <token>');
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    if (!token) {
      authFailures.labels('empty_token').inc();
      throw new UnauthorizedError('Token not provided');
    }

    // Verify token
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        authFailures.labels('token_expired').inc();
        throw new UnauthorizedError('Token expired');
      }
      if (err.name === 'JsonWebTokenError') {
        authFailures.labels('invalid_token').inc();
        throw new UnauthorizedError('Invalid token');
      }
      throw err;
    }

    // Check token type
    if (payload.type !== 'access') {
      authFailures.labels('wrong_token_type').inc();
      throw new UnauthorizedError('Invalid token type');
    }

    // Add user ID to request
    req.userId = payload.sub;

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Optional authentication - doesn't fail if no token
 * Useful for endpoints that work differently for authenticated users
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7);

    if (!token) {
      return next();
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.type === 'access') {
      req.userId = payload.sub;
    }

    next();
  } catch (err) {
    // Don't fail - just continue without userId
    logger.warn({ err }, 'Optional auth failed');
    next();
  }
};

/**
 * Middleware to require specific subscription tier
 * Must be used AFTER authenticate middleware
 */
export const requireSubscription = (...allowedPlans) => {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        throw new UnauthorizedError('Authentication required');
      }

      // Import here to avoid circular dependency
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        include: { subscription: true }
      });

      await prisma.$disconnect();

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Check if user has active subscription
      if (!user.subscription || user.subscription.status !== 'active') {
        return res.status(403).json({
          error: 'Subscription Required',
          message: 'This feature requires an active subscription',
          requiredPlans: allowedPlans
        });
      }

      // Check if user's plan is in allowed list
      if (!allowedPlans.includes(user.subscription.plan)) {
        return res.status(403).json({
          error: 'Upgrade Required',
          message: `This feature requires one of: ${allowedPlans.join(', ')}`,
          currentPlan: user.subscription.plan,
          requiredPlans: allowedPlans
        });
      }

      // Add subscription info to request
      req.subscription = user.subscription;

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Middleware to check if user is verified
 */
export const requireVerified = async (req, res, next) => {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isVerified: true }
    });

    await prisma.$disconnect();

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.isVerified) {
      return res.status(403).json({
        error: 'Verification Required',
        message: 'This action requires account verification'
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

export default authenticate;
