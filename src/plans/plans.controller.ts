import { Controller, Get, Post, Body } from '@nestjs/common';
import { PlansService } from './plans.service';
import { Public } from '../auth/public.decorator';

@Controller('public')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Public()
  @Get('plans')
  async getPlans() {
    return {
      success: true,
      data: await this.plansService.findAll(),
    };
  }

  @Public()
  @Get('landing-stats')
  async getLandingStats() {
    return {
      success: true,
      data: await this.plansService.getLandingStats(),
    };
  }

  @Public()
  @Post('demo-request')
  async requestDemo(@Body() body: { name: string; email: string; company?: string; message?: string }) {
    return this.plansService.submitDemoRequest(body);
  }
}
