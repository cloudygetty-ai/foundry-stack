import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import otplib from 'otplib';
import { PrismaClient } from '@prisma/client';
import { ValidationError, UnauthorizedError, ConflictError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { userRegistrations } from '../utils/metrics.js';

const prisma = new PrismaClient();

export class AuthService {
  constructor() {
    this.ACCESS_TTL = '15m';
    this.REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
  }

  /**
   * Register a new user
   */
  async register(email, password, displayName, age = 18) {
    // Validate input
    if (!email || !password || !displayName) {
      throw new ValidationError('Email, password, and display name are required');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    if (age < 18) {
      throw new ValidationError('You must be 18 or older to register');
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (existing) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        displayName,
        age
      }
    });

    logger.info({ userId: user.id, email: user.email }, 'User registered');
    userRegistrations.inc();

    return this.sanitizeUser(user);
  }

  /**
   * Login user
   */
  async login(email, password, deviceId = 'unknown', platform = 'unknown', userAgent = '') {
    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Track device
    await prisma.device.upsert({
      where: {
        userId_deviceId: {
          userId: user.id,
          deviceId
        }
      },
      create: {
        userId: user.id,
        deviceId,
        platform,
        userAgent,
        lastSeenAt: new Date()
      },
      update: {
        lastSeenAt: new Date(),
        userAgent,
        platform
      }
    });

    // Check if 2FA is enabled
    if (user.twoFAEnabled && user.totpSecret) {
      const tempToken = this.signTemp(user.id);
      return {
        require2FA: true,
        tempToken,
        message: 'Please provide 2FA code'
      };
    }

    // Issue tokens
    const tokens = await this.issueTokens(user.id, deviceId);

    logger.info({ userId: user.id, deviceId }, 'User logged in');

    return {
      user: this.sanitizeUser(user),
      ...tokens
    };
  }

  /**
   * Verify 2FA code and complete login
   */
  async verify2FA(tempToken, code, deviceId = 'unknown') {
    if (!tempToken || !code) {
      throw new ValidationError('Temp token and 2FA code are required');
    }

    // Verify temp token
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired temp token');
    }

    if (payload.type !== 'temp') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || !user.twoFAEnabled || !user.totpSecret) {
      throw new UnauthorizedError('2FA not enabled for this user');
    }

    // Verify TOTP code
    const valid = otplib.authenticator.check(code, user.totpSecret);

    if (!valid) {
      throw new UnauthorizedError('Invalid 2FA code');
    }

    // Issue full tokens
    const tokens = await this.issueTokens(user.id, deviceId);

    logger.info({ userId: user.id }, '2FA verification successful');

    return {
      user: this.sanitizeUser(user),
      ...tokens
    };
  }

  /**
   * Issue access and refresh tokens
   */
  async issueTokens(userId, deviceId) {
    const jti = randomUUID();

    const accessToken = jwt.sign(
      { sub: userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: this.ACCESS_TTL }
    );

    const refreshToken = jwt.sign(
      { sub: userId, type: 'refresh', jti, did: deviceId },
      process.env.JWT_SECRET,
      { expiresIn: `${this.REFRESH_TTL_SECONDS}s` }
    );

    const expiresAt = new Date(Date.now() + this.REFRESH_TTL_SECONDS * 1000);

    // Store session
    await prisma.session.create({
      data: {
        userId,
        deviceId,
        refreshJti: jti,
        expiresAt
      }
    });

    return { accessToken, refreshToken };
  }

  /**
   * Rotate refresh token
   */
  async rotateRefresh(refreshToken) {
    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    // Verify token
    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Check session
    const session = await prisma.session.findUnique({
      where: { refreshJti: payload.jti }
    });

    if (!session) {
      throw new UnauthorizedError('Session not found');
    }

    if (session.revoked) {
      // Token reuse detected - revoke entire chain
      await this.revokeFamily(payload.jti);
      throw new UnauthorizedError('Token has been revoked');
    }

    // Issue new tokens
    const newTokens = await this.issueTokens(payload.sub, payload.did);

    // Revoke old session
    await prisma.session.update({
      where: { refreshJti: payload.jti },
      data: {
        revoked: true,
        replacedBy: jwt.decode(newTokens.refreshToken).jti
      }
    });

    logger.info({ userId: payload.sub, jti: payload.jti }, 'Refresh token rotated');

    return newTokens;
  }

  /**
   * Revoke token family (cascade revocation)
   */
  async revokeFamily(jti) {
    const session = await prisma.session.findUnique({
      where: { refreshJti: jti }
    });

    if (!session) return;

    // Revoke current session
    await prisma.session.update({
      where: { refreshJti: jti },
      data: { revoked: true }
    });

    // Recursively revoke child tokens
    if (session.replacedBy) {
      await this.revokeFamily(session.replacedBy);
    }

    logger.warn({ jti }, 'Token family revoked');
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken) {
    if (!refreshToken) {
      return { success: true };
    }

    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
      
      await prisma.session.update({
        where: { refreshJti: payload.jti },
        data: { revoked: true }
      });

      logger.info({ userId: payload.sub, jti: payload.jti }, 'User logged out');
    } catch (err) {
      // Token might be invalid, but that's okay for logout
      logger.warn({ err }, 'Logout with invalid token');
    }

    return { success: true };
  }

  /**
   * Logout from all devices
   */
  async logoutAllDevices(userId) {
    const result = await prisma.session.updateMany({
      where: {
        userId,
        revoked: false
      },
      data: {
        revoked: true
      }
    });

    logger.info({ userId, count: result.count }, 'User logged out from all devices');

    return { success: true, revokedSessions: result.count };
  }

  /**
   * Sign temporary token (for 2FA flow)
   */
  signTemp(userId) {
    return jwt.sign(
      { sub: userId, type: 'temp' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
  }

  /**
   * Remove sensitive fields from user object
   */
  sanitizeUser(user) {
    const { passwordHash, totpSecret, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true
      }
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return this.sanitizeUser(user);
  }

  /**
   * Clean up expired sessions (run periodically)
   */
  async cleanupExpiredSessions() {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    logger.info({ count: result.count }, 'Expired sessions cleaned up');

    return result.count;
  }
}

export default AuthService;
