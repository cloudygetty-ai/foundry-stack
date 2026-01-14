import pino from 'pino';

// Configure Pino logger
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development'
  }
});

// Log unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    type: 'unhandledRejection',
    reason: reason,
    promise: promise
  }, 'Unhandled Promise Rejection');
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({
    type: 'uncaughtException',
    error: error
  }, 'Uncaught Exception');
  
  // Exit process after logging
  process.exit(1);
});

export default logger;
