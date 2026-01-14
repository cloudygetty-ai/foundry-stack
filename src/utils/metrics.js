import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ 
  register,
  prefix: 'social_app_'
});

// Custom Metrics

// HTTP Request Duration
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10]
});
register.registerMetric(httpRequestDuration);

// HTTP Request Counter
export const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestCounter);

// Active WebSocket Connections
export const activeConnections = new client.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections'
});
register.registerMetric(activeConnections);

// Messages Sent Counter
export const messagesSent = new client.Counter({
  name: 'messages_sent_total',
  help: 'Total number of messages sent'
});
register.registerMetric(messagesSent);

// User Registrations Counter
export const userRegistrations = new client.Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations'
});
register.registerMetric(userRegistrations);

// Subscription Events Counter
export const subscriptionEvents = new client.Counter({
  name: 'subscription_events_total',
  help: 'Total number of subscription events',
  labelNames: ['event_type'] // created, updated, canceled
});
register.registerMetric(subscriptionEvents);

// Database Query Duration
export const dbQueryDuration = new client.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2]
});
register.registerMetric(dbQueryDuration);

// Authentication Failures Counter
export const authFailures = new client.Counter({
  name: 'auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['reason'] // invalid_credentials, token_expired, etc.
});
register.registerMetric(authFailures);

// API Errors Counter
export const apiErrors = new client.Counter({
  name: 'api_errors_total',
  help: 'Total number of API errors',
  labelNames: ['route', 'error_type', 'status_code']
});
register.registerMetric(apiErrors);

// Middleware to track HTTP metrics
export const metricsMiddleware = (req, res, next) => {
  const start = Date.now();

  // Track when response finishes
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const statusCode = res.statusCode;

    // Record metrics
    httpRequestDuration
      .labels(req.method, route, statusCode)
      .observe(duration);

    httpRequestCounter
      .labels(req.method, route, statusCode)
      .inc();
  });

  next();
};

// Route to expose metrics
export const metricsRoute = (app) => {
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  });
};

export { register };
