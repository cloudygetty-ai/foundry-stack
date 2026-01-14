import express from 'express';
import Stripe from 'stripe';
import { PaymentService } from '../services/PaymentService.js';
import { authenticate } from '../middleware/authenticate.js';
import { ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const router = express.Router();
const paymentService = new PaymentService();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * GET /api/payments/plans
 * Get all available subscription plans
 */
router.get('/plans', (req, res) => {
  try {
    const plans = paymentService.getPlans();

    res.json({
      success: true,
      plans
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/payments/subscribe
 * Create checkout session for subscription
 */
router.post('/subscribe', authenticate, async (req, res, next) => {
  try {
    const { plan } = req.body;

    if (!plan) {
      throw new ValidationError('Plan is required');
    }

    const session = await paymentService.createCheckoutSession(req.userId, plan);

    res.json({
      success: true,
      ...session
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/purchase
 * Create checkout session for one-time purchase
 */
router.post('/purchase', authenticate, async (req, res, next) => {
  try {
    const { productType, amount } = req.body;

    if (!productType || !amount) {
      throw new ValidationError('Product type and amount are required');
    }

    if (amount < 100) {
      throw new ValidationError('Amount must be at least $1.00 (100 cents)');
    }

    const session = await paymentService.createOneTimePurchase(
      req.userId,
      productType,
      amount
    );

    res.json({
      success: true,
      ...session
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/subscription
 * Get user's current subscription
 */
router.get('/subscription', authenticate, async (req, res, next) => {
  try {
    const subscription = await paymentService.getUserSubscription(req.userId);

    res.json({
      success: true,
      subscription
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/cancel
 * Cancel user's subscription
 */
router.post('/cancel', authenticate, async (req, res, next) => {
  try {
    const result = await paymentService.cancelSubscription(req.userId);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/reactivate
 * Reactivate a canceled subscription
 */
router.post('/reactivate', authenticate, async (req, res, next) => {
  try {
    const result = await paymentService.reactivateSubscription(req.userId);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/portal
 * Create Stripe customer portal session
 */
router.post('/portal', authenticate, async (req, res, next) => {
  try {
    const session = await paymentService.createPortalSession(req.userId);

    res.json({
      success: true,
      ...session
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/history
 * Get payment history for user
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const purchases = await prisma.purchase.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      purchases
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 * This endpoint should NOT use authentication middleware
 */
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.error({ err }, 'Webhook signature verification failed');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    await paymentService.handleWebhook(event);

    res.json({ received: true });
  } catch (err) {
    logger.error({ err, eventType: event.type }, 'Error processing webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /api/payments/invoice/:invoiceId
 * Get invoice details
 */
router.get('/invoice/:invoiceId', authenticate, async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    // Get user's Stripe customer ID
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { stripeCustomerId: true }
    });

    await prisma.$disconnect();

    if (!user?.stripeCustomerId) {
      throw new ValidationError('No payment account found');
    }

    // Retrieve invoice from Stripe
    const invoice = await stripe.invoices.retrieve(invoiceId);

    // Verify invoice belongs to user
    if (invoice.customer !== user.stripeCustomerId) {
      throw new ValidationError('Invoice not found');
    }

    res.json({
      success: true,
      invoice: {
        id: invoice.id,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        pdfUrl: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url,
        created: new Date(invoice.created * 1000)
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/update-payment-method
 * Update default payment method
 */
router.post('/update-payment-method', authenticate, async (req, res, next) => {
  try {
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      throw new ValidationError('Payment method ID is required');
    }

    const customerId = await paymentService.getOrCreateCustomer(req.userId);

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    res.json({
      success: true,
      message: 'Payment method updated successfully'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/payment-methods
 * Get user's saved payment methods
 */
router.get('/payment-methods', authenticate, async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { stripeCustomerId: true }
    });

    await prisma.$disconnect();

    if (!user?.stripeCustomerId) {
      return res.json({
        success: true,
        paymentMethods: []
      });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card'
    });

    const methods = paymentMethods.data.map(pm => ({
      id: pm.id,
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year
    }));

    res.json({
      success: true,
      paymentMethods: methods
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/payments/payment-methods/:paymentMethodId
 * Remove a payment method
 */
router.delete('/payment-methods/:paymentMethodId', authenticate, async (req, res, next) => {
  try {
    const { paymentMethodId } = req.params;

    await stripe.paymentMethods.detach(paymentMethodId);

    res.json({
      success: true,
      message: 'Payment method removed successfully'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
