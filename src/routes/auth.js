import express from 'express';
import { AuthService } from '../services/AuthService.js';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError } from '../middleware/errorHandler.js';

export const router = express.Router();
const authService = new AuthService();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, displayName, age } = req.body;

    const user = await authService.register(email, password, displayName, age);

    res.status(201).json({
      success: true,
      user,
      message: 'Registration successful. Please log in.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, deviceId, platform, userAgent } = req.body;

    const result = await authService.login(
      email,
      password,
      deviceId || 'unknown',
      platform || 'unknown',
      userAgent || req.headers['user-agent'] || ''
    );

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/verify-2fa
 * Verify 2FA code and complete login
 */
router.post('/verify-2fa', async (req, res, next) => {
  try {
    const { tempToken, code, deviceId } = req.body;

    if (!tempToken || !code) {
      throw new ValidationError('Temp token and 2FA code are required');
    }

    const result = await authService.verify2FA(
      tempToken,
      code,
      deviceId || 'unknown'
    );

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Rotate refresh token to get new access token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    const tokens = await authService.rotateRefresh(refreshToken);

    res.json({
      success: true,
      ...tokens
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Logout and revoke refresh token
 */
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    await authService.logout(refreshToken);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 * Requires authentication
 */
router.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    const result = await authService.logoutAllDevices(req.userId);

    res.json({
      success: true,
      message: 'Logged out from all devices',
      revokedSessions: result.revokedSessions
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.userId);

    res.json({
      success: true,
      user
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/change-password
 * Change user password
 * Requires authentication
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    // Import here to avoid circular dependency
    const { PrismaClient } = await import('@prisma/client');
    const bcrypt = await import('bcryptjs');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash: newHash }
    });

    // Revoke all sessions except current one
    await authService.logoutAllDevices(req.userId);

    await prisma.$disconnect();

    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again on other devices.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/sessions
 * Get all active sessions for user
 */
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const sessions = await prisma.session.findMany({
      where: {
        userId: req.userId,
        revoked: false,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          select: {
            devices: {
              where: {
                userId: req.userId
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    await prisma.$disconnect();

    // Map sessions to devices
    const sessionsWithDevices = sessions.map(session => {
      const device = session.user.devices.find(d => d.deviceId === session.deviceId);
      return {
        id: session.id,
        deviceId: session.deviceId,
        platform: device?.platform || 'unknown',
        lastSeen: device?.lastSeenAt || session.createdAt,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      };
    });

    res.json({
      success: true,
      sessions: sessionsWithDevices
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke a specific session
 */
router.delete('/sessions/:sessionId', authenticate, async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // Verify session belongs to user
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });

    if (!session || session.userId !== req.userId) {
      throw new ValidationError('Session not found');
    }

    // Revoke session
    await prisma.session.update({
      where: { id: sessionId },
      data: { revoked: true }
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
