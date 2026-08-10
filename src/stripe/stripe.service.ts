import { Injectable, Logger, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import type Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Plan } from '../plans/entities/plan.entity';

@Injectable()
export class StripeService {
  private stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
  ) {
    const Stripe = require('stripe');
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY') || 'sk_test_placeholder';
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-07-29.dahlia',
    });
  }

  async createCheckoutSession(tenantId: string, planId: string, successUrl: string, cancelUrl: string) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    const plan = await this.planRepository.findOne({ where: { id: planId } });
    if (!plan || plan.price === null) {
       throw new Error('Invalid plan selected.');
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: tenant.stripeCustomerId || undefined, // If they already have a customer ID, use it
      client_reference_id: tenant.id, // Tie the session back to our tenant
      metadata: { planId },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: plan.description || '',
            },
            unit_amount: Math.round(plan.price * 100), // convert dollars to cents
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return { url: session.url };
  }

  async handleWebhook(req: RawBodyRequest<Request>, signature: string) {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET is not configured');
      return;
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody!,
        signature,
        webhookSecret
      );
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err);
      throw new Error('Webhook Error');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.client_reference_id) {
          const tenant = await this.tenantRepository.findOne({ where: { id: session.client_reference_id } });
          if (tenant) {
            tenant.stripeCustomerId = session.customer as string;
            tenant.subscriptionStatus = 'active';
            if (session.metadata?.planId) {
              tenant.planId = session.metadata.planId;
            }
            await this.tenantRepository.save(tenant);
            this.logger.log(`Tenant ${tenant.id} subscribed successfully.`);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const tenant = await this.tenantRepository.findOne({ where: { stripeCustomerId: customerId } });
        if (tenant) {
          tenant.subscriptionStatus = 'canceled';
          await this.tenantRepository.save(tenant);
          this.logger.log(`Tenant ${tenant.id} subscription canceled.`);
        }
        break;
      }
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }
  }

  async getBillingPortalData(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, relations: ['plan'] });
    if (!tenant) throw new Error('Tenant not found');

    const defaultMockData = {
      isMock: true,
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      paymentMethod: {
        brand: 'mastercard',
        last4: '3847',
        expMonth: 12,
        expYear: 2026,
      },
      history: [
        {
          id: 'inv_mock1',
          date: new Date().toISOString(),
          amount: tenant.plan?.price ? tenant.plan.price * 100 : 9900,
          status: 'paid',
          invoicePdf: '#',
        },
        {
          id: 'inv_mock2',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          amount: tenant.plan?.price ? tenant.plan.price * 100 : 9900,
          status: 'paid',
          invoicePdf: '#',
        }
      ]
    };

    if (!tenant.stripeCustomerId) {
      return defaultMockData;
    }

    try {
      // 1. Fetch the active subscription
      const subscriptions = await this.stripe.subscriptions.list({
        customer: tenant.stripeCustomerId,
        status: 'active',
        limit: 1,
      });

      let nextPaymentDate = defaultMockData.nextPaymentDate;
      if (subscriptions.data.length > 0) {
        nextPaymentDate = new Date((subscriptions.data[0] as any).current_period_end * 1000).toISOString();
      }

      // 2. Fetch the default payment method
      const customer = await this.stripe.customers.retrieve(tenant.stripeCustomerId) as Stripe.Customer;
      let paymentMethod = defaultMockData.paymentMethod;
      
      if (customer.invoice_settings?.default_payment_method) {
        const pm = await this.stripe.paymentMethods.retrieve(customer.invoice_settings.default_payment_method as string);
        if (pm.card) {
          paymentMethod = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          };
        }
      } else {
        // Fallback: just get the first card attached to the customer
        const pms = await this.stripe.paymentMethods.list({ customer: tenant.stripeCustomerId, type: 'card', limit: 1 });
        if (pms.data.length > 0 && pms.data[0].card) {
          const pm = pms.data[0];
          paymentMethod = {
            brand: pm.card!.brand,
            last4: pm.card!.last4,
            expMonth: pm.card!.exp_month,
            expYear: pm.card!.exp_year,
          };
        }
      }

      // 3. Fetch invoice history
      const invoices = await this.stripe.invoices.list({
        customer: tenant.stripeCustomerId,
        limit: 10,
      });

      const history = invoices.data.map((inv) => ({
        id: inv.id,
        date: new Date(inv.created * 1000).toISOString(),
        amount: inv.amount_paid,
        status: inv.status,
        invoicePdf: inv.invoice_pdf,
      }));

      return {
        isMock: false,
        nextPaymentDate,
        paymentMethod,
        history: history.length > 0 ? history : defaultMockData.history,
      };

    } catch (err) {
      this.logger.error('Failed to fetch billing portal data from Stripe. Returning mock data.', err);
      return defaultMockData;
    }
  }
}
