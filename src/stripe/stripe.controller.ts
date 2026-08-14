import { Controller, Post, Get, Param, Body, Req, Headers, BadRequestException, RawBodyRequest } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { Public } from '../auth/public.decorator';
import { Request } from 'express';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('checkout-session')
  async createCheckoutSession(
    @Body() body: { tenantId: string; planId: string; successUrl: string; cancelUrl: string },
  ) {
    try {
      const session = await this.stripeService.createCheckoutSession(
        body.tenantId,
        body.planId,
        body.successUrl,
        body.cancelUrl,
      );
      return { success: true, data: { url: session.url } };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Failed to create checkout session');
    }
  }

  @Post('customer-portal')
  async createCustomerPortalSession(
    @Body() body: { tenantId: string; returnUrl: string },
  ) {
    try {
      const session = await this.stripeService.createCustomerPortalSession(
        body.tenantId,
        body.returnUrl,
      );
      return { success: true, data: { url: session.url } };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Failed to create customer portal session');
    }
  }

  @Get('billing-info/:tenantId')
  async getBillingInfo(
    @Param('tenantId') tenantId: string,
  ) {
    try {
      const data = await this.stripeService.getBillingPortalData(tenantId);
      return { success: true, data };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Failed to retrieve billing info');
    }
  }

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) throw new BadRequestException('Missing stripe-signature header');
    try {
      await this.stripeService.handleWebhook(req, signature);
      return { received: true };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Webhook handler failed');
    }
  }
}
