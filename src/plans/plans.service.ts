import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { DemoRequest } from './entities/demo-request.entity';

@Injectable()
export class PlansService implements OnModuleInit {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepository: Repository<Plan>,
    @InjectRepository(DemoRequest)
    private readonly demoRequestRepository: Repository<DemoRequest>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPlans();
  }

  private async seedDefaultPlans() {
    const count = await this.planRepository.count();
    if (count > 0) return;

    const plans = [
      {
        name: 'Starter',
        description: 'Perfect for small businesses getting started.',
        price: 29.00,
        billingCycle: 'monthly',
        isPopular: false,
        features: ['Up to 500 SKUs', '1 User Account', 'Basic Inventory Tracking', 'Manual Purchase Orders'],
      },
      {
        name: 'Pro',
        description: 'For growing businesses leveraging AI.',
        price: 99.00,
        billingCycle: 'monthly',
        isPopular: true,
        features: ['Unlimited SKUs', 'Up to 5 User Accounts', 'Advanced AI Demand Forecasting', 'Automated Purchase Orders', 'Priority Support'],
      },
      {
        name: 'Enterprise',
        description: 'For large scale operations.',
        price: null,
        billingCycle: 'monthly',
        isPopular: false,
        features: ['Dedicated AI Assistant', 'Advanced RAG Analytics', 'Unlimited Users', 'Custom Integrations', '24/7 Phone Support'],
      },
    ];

    for (const plan of plans) {
      await this.planRepository.save(this.planRepository.create(plan));
    }
  }

  async findAll(): Promise<Plan[]> {
    return this.planRepository.find({
      order: {
        price: 'ASC', // Will put null (Enterprise) at the end or we might need custom sort
      }
    });
  }

  async getLandingStats() {
    // In a real app, these might be dynamically computed from the DB,
    // e.g. count of warehouses, sum of users, etc.
    // For this example, we return impressive platform-level stats
    return {
      fulfillmentIncrease: '24%',
      accuracy: '99.9%',
      warehouses: '3k+',
      discrepancies: '0'
    };
  }

  async submitDemoRequest(data: { name: string; email: string; company?: string; message?: string }) {
    const demoRequest = this.demoRequestRepository.create(data);
    await this.demoRequestRepository.save(demoRequest);
    return { success: true };
  }
}
