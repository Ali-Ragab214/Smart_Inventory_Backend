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
      apiVersion: '2023-10-16',
    });
  }

  async createCheckoutSession(tenantId: string, planId: string, successUrl: string, cancelUrl: string) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, relations: ['users'] });
    if (!tenant) throw new Error('Tenant not found');

    const plan = await this.planRepository.findOne({ where: { id: planId } });
    if (!plan) {
       throw new Error('Invalid plan selected.');
    }

    if (plan.price === null) {
      // Enterprise plan selected - redirect to a contact sales page or return a specific url
      return { url: '/contact-sales' };
    }

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      // Create Stripe customer first to ensure webhook matches correctly
      const ownerEmail = tenant.users && tenant.users.length > 0 ? tenant.users[0].email : undefined;
      const customer = await this.stripe.customers.create({
         name: tenant.name,
         email: ownerEmail,
         metadata: { tenantId: tenant.id },
      });
      customerId = customer.id;
      tenant.stripeCustomerId = customerId;
      await this.tenantRepository.save(tenant);
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: customerId,
      client_reference_id: tenant.id,
      metadata: { planId },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: plan.description || '',
            },
            unit_amount: Math.round(plan.price * 100), // Base plan price based on limits
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
            
            // If the subscription has a trial, mark it as trialing, otherwise active
            const subscriptionId = session.subscription as string;
            let status = 'active';
            if (subscriptionId) {
               const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
               if (subscription.status === 'trialing') {
                 status = 'trialing';
                 tenant.trialEndsAt = new Date(subscription.trial_end! * 1000);
               }
            }
            tenant.subscriptionStatus = status;
            
            if (session.metadata?.planId) {
              tenant.planId = session.metadata.planId;
            }
            await this.tenantRepository.save(tenant);
            this.logger.log(`Tenant ${tenant.id} subscribed successfully (Status: ${status}).`);
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

    if (!tenant.stripeCustomerId) {
      return {
        isMock: false,
        nextPaymentDate: null,
        paymentMethod: null,
        history: [],
      };
    }

    try {
      // 1. Fetch the active subscription
      const subscriptions = await this.stripe.subscriptions.list({
        customer: tenant.stripeCustomerId,
        status: 'active',
        limit: 1,
      });

      let nextPaymentDate: string | null = null;
      if (subscriptions.data.length > 0) {
        nextPaymentDate = new Date((subscriptions.data[0] as any).current_period_end * 1000).toISOString();
      }

      // 2. Fetch the default payment method
      const customer = await this.stripe.customers.retrieve(tenant.stripeCustomerId) as Stripe.Customer;
      let paymentMethod: any = null;
      
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
        history: history, // Return actual history even if empty
      };

    } catch (err) {
      this.logger.error('Failed to fetch billing portal data from Stripe.', err);
      // Remove fake data fallback, throw real error
      throw new Error('Could not retrieve billing information. Please check your Stripe connection.');
    }
  }

  async createCustomerPortalSession(tenantId: string, returnUrl: string) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    if (!tenant.stripeCustomerId) {
      throw new Error('No Stripe customer associated with this account. Please subscribe first.');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }
}
