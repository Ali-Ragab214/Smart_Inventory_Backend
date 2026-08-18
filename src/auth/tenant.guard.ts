import { Injectable, CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantsService: TenantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Access denied: You do not belong to any tenant');
    }

    const tenant = await this.tenantsService.findById(user.tenantId).catch(() => null);
    if (tenant) {
      if (tenant.subscriptionStatus === 'trialing' && tenant.trialEndsAt) {
        if (new Date() > tenant.trialEndsAt) {
          throw new HttpException(
            'Your 14-day trial has expired. Please subscribe to a plan to continue using StockSavvy features.',
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      if (tenant.subscriptionStatus === 'canceled' || tenant.subscriptionStatus === 'past_due') {
          throw new HttpException(
              'Your subscription has ended or is past due. Please update your billing information.',
              HttpStatus.PAYMENT_REQUIRED,
          );
      }
    }

    return true;
  }
}
