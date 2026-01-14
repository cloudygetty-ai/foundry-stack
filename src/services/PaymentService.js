import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { subscriptionEvents } from '../utils/metrics.js';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export class PaymentService {
  constructor() {
    this.plans = {
      basic: {
        priceId: process.env.STRIPE_PRICE_BASIC || 'price_basic',
        amount: 999, // $9.99
        name: 'Basic',
        features: ['100 connections', 'Basic matching', '5 GB storage']
      },
      premium: {
        priceId: process.env.STRIPE_PRICE_PREMIUM || 'price_premium',
        amount: 1999, // $19.99
        name: 'Premium',
        features: ['Unlimited connections', 'AI matching', '50 GB storage', 'Priority support']
      },
      enterprise: {
        priceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise',
        amount: 4999, // $49.99
        name: 'Enterprise',
        features: ['Everything in Premium', 'Custom branding', 'API access', '24/7 support']
      }
    };
  }

  /**
   * Get or create Stripe customer for user
   */
  async getOrCreateCustomer(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Return existing customer
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: user.id
      }
    });

    // Save customer ID
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id }
    });

    logger.info({ userId, customerId: customer.id }, 'Stripe customer created');

    return customer.id;
  }

  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(userId, plan) {
    if (!this.plans[plan]) {
      throw new ValidationError(`Invalid plan: ${plan}. Choose from: ${Object.keys(this.plans).join(', ')}`);
    }

    const customerId = await this.getOrCreateCustomer(userId);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: this.plans[plan].priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/pricing`,
      metadata: {
        userId,
        plan
      }
    });

    logger.info({ userId, plan, sessionId: session.id }, 'Checkout session created');

    return {
      url: session.url,
      sessionId: session.id
    };
  }

  /**
   * Create checkout session for one-time purchase
   */
  async createOneTimePurchase(userId, productType, amount) {
    const customerId = await this.getOrCreateCustomer(userId);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount, // Amount in cents
            product_data: {
              name: productType,
              description: `One-time purchase: ${productType}`
            }
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/pricing`,
      metadata: {
        userId,
        productType
      }
    });

    logger.info({ userId, productType, amount }, 'One-time purchase session created');

    return {
      url: session.url,
      sessionId: session.id
    };
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event) {
    logger.info({ type: event.type }, 'Processing webhook event');

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancel(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;

      default:
        logger.warn({ type: event.type }, 'Unhandled webhook event type');
    }
  }

  /**
   * Handle completed checkout session
   */
  async handleCheckoutComplete(session) {
    const { userId, plan, productType } = session.metadata;

    if (session.mode === 'subscription') {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      
      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          plan: plan || 'basic',
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        },
        update: {
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          plan: plan || 'basic',
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        }
      });

      subscriptionEvents.labels('created').inc();
      logger.info({ userId, plan, subscriptionId: subscription.id }, 'Subscription created');

    } else if (session.mode === 'payment') {
      // One-time purchase
      await prisma.purchase.create({
        data: {
          userId,
          stripePaymentIntentId: session.payment_intent,
          amount: session.amount_total,
          currency: session.currency,
          productType: productType || 'unknown',
          status: 'succeeded'
        }
      });

      logger.info({ userId, productType, amount: session.amount_total }, 'One-time purchase completed');
    }
  }

  /**
   * Handle subscription update
   */
  async handleSubscriptionUpdate(subscription) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      }
    });

    subscriptionEvents.labels('updated').inc();
    logger.info({ subscriptionId: subscription.id, status: subscription.status }, 'Subscription updated');
  }

  /**
   * Handle subscription cancellation
   */
  async handleSubscriptionCancel(subscription) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: 'canceled',
        canceledAt: new Date()
      }
    });

    subscriptionEvents.labels('canceled').inc();
    logger.info({ subscriptionId: subscription.id }, 'Subscription canceled');
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSuccess(invoice) {
    logger.info({ invoiceId: invoice.id, customerId: invoice.customer }, 'Payment succeeded');
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailed(invoice) {
    logger.warn({ invoiceId: invoice.id, customerId: invoice.customer }, 'Payment failed');
    
    // TODO: Send email notification to user about failed payment
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription) {
      return {
        plan: 'free',
        status: 'none',
        features: ['Basic features', 'Limited connections']
      };
    }

    return {
      ...subscription,
      features: this.plans[subscription.plan]?.features || []
    };
  }

  /**
   * Cancel user's subscription
   */
  async cancelSubscription(userId) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription) {
      throw new NotFoundError('No active subscription found');
    }

    // Cancel at period end (don't immediately revoke access)
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    await prisma.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: true
      }
    });

    logger.info({ userId, subscriptionId: subscription.stripeSubscriptionId }, 'Subscription set to cancel at period end');

    return {
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period',
      endsAt: subscription.currentPeriodEnd
    };
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(userId) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    if (!subscription) {
      throw new NotFoundError('No subscription found');
    }

    // Remove cancellation
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    await prisma.subscription.update({
      where: { userId },
      data: {
        cancelAtPeriodEnd: false
      }
    });

    logger.info({ userId, subscriptionId: subscription.stripeSubscriptionId }, 'Subscription reactivated');

    return {
      success: true,
      message: 'Subscription reactivated successfully'
    };
  }

  /**
   * Get all available plans
   */
  getPlans() {
    return Object.entries(this.plans).map(([key, plan]) => ({
      id: key,
      name: plan.name,
      price: plan.amount / 100, // Convert cents to dollars
      features: plan.features
    }));
  }

  /**
   * Create customer portal session
   */
  async createPortalSession(userId) {
    const customerId = await this.getOrCreateCustomer(userId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.CLIENT_URL}/account/billing`
    });

    return {
      url: session.url
    };
  }
}

export default PaymentService;
