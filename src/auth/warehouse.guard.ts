import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class WarehouseGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.TENANT) {
      return true;
    }

    if (user.role === UserRole.WAREHOUSE_MANAGER) {
      if (!user.warehouseId) {
        throw new ForbiddenException('Access denied: You are not assigned to a warehouse');
      }

      // We expect controllers to parse warehouseId from params, query, or body.
      // If it exists in the request, we must validate it matches the user's warehouseId.
      const requestedWarehouseId = request.params?.warehouseId || request.query?.warehouseId || request.body?.warehouseId;
      
      if (requestedWarehouseId && requestedWarehouseId !== user.warehouseId) {
        throw new ForbiddenException('Access denied: You can only access your assigned warehouse');
      }
    }

    return true;
  }
}
