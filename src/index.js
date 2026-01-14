import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIO } from 'socket.io';
import jwt from 'jsonwebtoken';

// Import routes
import { router as authRouter } from './routes/auth.js';
import { router as userRouter } from './routes/users.js';
import { router as profileRouter } from './routes/profiles.js';
import { router as beaconRouter } from './routes/beacons.js';
import { router as messageRouter } from './routes/messages.js';
import { router as paymentRouter } from './routes/payments.js';
import { router as mediaRouter } from './routes/media.js';
import { router as privacyRouter } from './routes/privacy.js';
import { router as placesRouter } from './routes/places.js';
import { router as reportRouter } from './routes/reports.js';

// Import middleware and utilities
import { logger } from './utils/logger.js';
import { metricsMiddleware, metricsRoute } from './utils/metrics.js';
import { errorHandler } from './middleware/errorHandler.js';
import { MessageService } from './services/MessageService.js';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new SocketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Security middleware
app.use(helmet());

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Body parser
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Metrics middleware
app.use(metricsMiddleware);

// Logging middleware
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/profiles', profileRouter);
app.use('/api/beacons', beaconRouter);
app.use('/api/messages', messageRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/media', mediaRouter);
app.use('/api/privacy', privacyRouter);
app.use('/api/places', placesRouter);
app.use('/api/reports', reportRouter);

// Metrics endpoint
metricsRoute(app);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    if (payload.type !== 'access') {
      return next(new Error('Invalid token type'));
    }

    socket.userId = payload.sub;
    next();
  } catch (err) {
    logger.error({ err }, 'Socket.IO authentication failed');
    next(new Error('Authentication failed'));
  }
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  logger.info({ userId: socket.userId }, 'User connected via WebSocket');

  // Join user's personal room
  socket.join(`user:${socket.userId}`);

  // Handle sending messages
  socket.on('send_message', async (data) => {
    try {
      const { recipientId, content, encrypted = false } = data;

      if (!recipientId || !content) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      const messageService = new MessageService();
      const message = await messageService.create({
        senderId: socket.userId,
        recipientId,
        content,
        encrypted
      });

      // Send to recipient
      io.to(`user:${recipientId}`).emit('new_message', message);

      // Confirm to sender
      socket.emit('message_sent', { messageId: message.id });

      logger.info({
        from: socket.userId,
        to: recipientId,
        messageId: message.id
      }, 'Message sent');
    } catch (err) {
      logger.error({ err }, 'Error sending message');
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    const { recipientId } = data;
    if (recipientId) {
      io.to(`user:${recipientId}`).emit('user_typing', {
        userId: socket.userId
      });
    }
  });

  // Handle stop typing
  socket.on('stop_typing', (data) => {
    const { recipientId } = data;
    if (recipientId) {
      io.to(`user:${recipientId}`).emit('user_stop_typing', {
        userId: socket.userId
      });
    }
  });

  // Handle marking messages as read
  socket.on('mark_read', async (data) => {
    try {
      const { messageId } = data;
      const messageService = new MessageService();
      await messageService.markAsRead(messageId, socket.userId);
      
      socket.emit('marked_read', { messageId });
    } catch (err) {
      logger.error({ err }, 'Error marking message as read');
    }
  });

  // Handle presence/online status
  socket.on('presence', (data) => {
    const { status } = data; // online, away, busy
    socket.broadcast.emit('user_presence', {
      userId: socket.userId,
      status
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info({ userId: socket.userId }, 'User disconnected');
    
    // Notify others user is offline
    socket.broadcast.emit('user_presence', {
      userId: socket.userId,
      status: 'offline'
    });
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
  logger.info(`Metrics available at http://localhost:${PORT}/metrics`);
});

export { app, io };
