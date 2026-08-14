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
    const plans = [
      {
        name: 'Starter',
        description: 'Perfect for small businesses getting started.',
        price: 9.00,
        billingCycle: 'monthly',
        isPopular: false,
        features: ['Up to 1,000 SKUs', 'Up to 5 User Accounts', 'Up to 2 Warehouses', 'Basic Inventory Tracking', 'Manual Purchase Orders'],
        maxUsers: 5,
        maxSkus: 1000,
        maxWarehouses: 2,
      },
      {
        name: 'Pro',
        description: 'For growing businesses leveraging AI.',
        price: 29.00,
        billingCycle: 'monthly',
        isPopular: true,
        features: ['Up to 10,000 SKUs', 'Up to 10 User Accounts', 'Up to 5 Warehouses', 'Advanced AI Forecasting', 'Automated POs'],
        maxUsers: 10,
        maxSkus: 10000,
        maxWarehouses: 5,
      },
      {
        name: 'Enterprise',
        description: 'For large scale operations.',
        price: null,
        billingCycle: 'monthly',
        isPopular: false,
        features: ['Dedicated AI Assistant', 'Advanced RAG Analytics', 'Unlimited Limits', 'Custom Integrations', '24/7 Phone Support'],
        maxUsers: null,
        maxSkus: null,
        maxWarehouses: null,
      },
    ];

    for (const planData of plans) {
      const existing = await this.planRepository.findOne({ where: { name: planData.name } });
      if (existing) {
        Object.assign(existing, planData);
        await this.planRepository.save(existing);
      } else {
        await this.planRepository.save(this.planRepository.create(planData));
      }
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
