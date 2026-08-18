import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryService } from './inventory.service';
import { VendorsService } from '../vendors/vendors.service';
import { CampaignsService } from '../forecasts/campaigns.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { StockMovementService } from '../inventory/stock-movements/stock-movement.service';
import { ForecastService } from '../forecasts/forecast.service';
import { ApprovalQueueService } from './approval-queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { AgentRunService } from './agent-run.service';
import { UserRole, User } from '../users/entities/user.entity';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { ToolExecutorService as IToolExecutor } from './interfaces/tool-executor.interface';

export const AVAILABLE_TOOLS = [
  {
    name: 'get_sku',
    description: 'Get a SKU by its ID including current quantity and reorder threshold',
    input_schema: {
      type: 'object',
      properties: { skuId: { type: 'string', description: 'The SKU UUID' } },
      required: ['skuId'],
    },
  },
  {
    name: 'get_all_skus',
    description: 'Get all SKUs available in the system',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_inventory_status',
    description: 'Get stock levels and locations for all SKUs across all warehouses',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_marketing_calendar',
    description: 'Get marketing/promotion campaigns overlapping a date range, optionally filtered by SKUs, with expected demand multipliers',
    input_schema: {
      type: 'object',
      properties: {
        skuIds: { type: 'array', items: { type: 'string' }, description: 'Optional SKU UUIDs to filter by' },
        from: { type: 'string', description: 'Start of the window (ISO date), defaults to today' },
        to: { type: 'string', description: 'End of the window (ISO date), defaults to +90 days' },
      },
      required: [],
    },
  },
  {
    name: 'get_low_stock_skus',
    description: 'Get all SKUs that are below or at their reorder threshold across all warehouses',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_movement_history',
    description: 'Get recent stock movement history for a SKU',
    input_schema: {
      type: 'object',
      properties: { skuId: { type: 'string', description: 'The SKU UUID' } },
      required: ['skuId'],
    },
  },
  {
    name: 'get_vendor',
    description: 'Get a vendor by its ID',
    input_schema: {
      type: 'object',
      properties: { vendorId: { type: 'string', description: 'The vendor UUID' } },
      required: ['vendorId'],
    },
  },
  {
    name: 'get_vendors_for_sku',
    description: 'Get all vendors that supply a given SKU, sorted by price ascending',
    input_schema: {
      type: 'object',
      properties: { skuId: { type: 'string', description: 'The SKU UUID' } },
      required: ['skuId'],
    },
  },
  {
    name: 'get_vendor_catalog_entry',
    description: 'Get pricing and lead time for a specific vendor-SKU combination',
    input_schema: {
      type: 'object',
      properties: {
        vendorId: { type: 'string', description: 'The vendor UUID' },
        skuId: { type: 'string', description: 'The SKU UUID' },
      },
      required: ['vendorId', 'skuId'],
    },
  },
  {
    name: 'get_all_vendors',
    description: 'Get all vendors',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_purchase_orders',
    description: 'Get all purchase orders with their line items',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_recent_movements',
    description: 'Get the most recent stock movements across all SKUs (receipts, sales, transfers, write-offs, returns, adjustments)',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_forecasts',
    description: 'Get demand forecasts for all SKUs',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_approval_requests',
    description: 'Get all agent approval requests (reorder/negotiation items awaiting, approved, rejected or deferred)',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_notifications',
    description: 'Get recent notifications and alerts for the tenant',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_staff',
    description: 'Get the staff members (users) of the tenant',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_agent_runs',
    description: 'Get the most recent agent runs (reorder, negotiation, forecast, feedback) with their status',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

@Injectable()
export class ToolExecutorService implements IToolExecutor {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly vendorsService: VendorsService,
    private readonly campaignsService: CampaignsService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly stockMovementService: StockMovementService,
    private readonly forecastService: ForecastService,
    private readonly approvalQueueService: ApprovalQueueService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly agentRunService: AgentRunService,
  ) {}

  private systemUser(tenantId: string): UserResponseDto {
    return { id: '', tenantId, role: UserRole.TENANT } as UserResponseDto;
  }

  private async nameLookups(tenantId: string) {
    const whRows = (await this.dataSource.query(
      'SELECT id, name, location FROM warehouses WHERE tenant_id = $1',
      [tenantId],
    )) as Array<{ id: string; name: string; location: string | null }>;
    const vRows = (await this.dataSource.query(
      'SELECT id, name FROM vendors WHERE tenant_id = $1',
      [tenantId],
    )) as Array<{ id: string; name: string }>;
    const sRows = (await this.dataSource.query(
      'SELECT id, name, sku FROM skus WHERE tenant_id = $1',
      [tenantId],
    )) as Array<{ id: string; name: string; sku: string }>;
    return {
      warehouses: new Map(whRows.map((r) => [r.id, r])),
      vendors: new Map(vRows.map((r) => [r.id, r.name])),
      skus: new Map(sRows.map((r) => [r.id, r])),
    };
  }

  async execute(tenantId: string, toolName: string, input: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'get_sku':
        return this.inventoryService.findSku(tenantId, input.skuId as string);

      case 'get_all_skus':
        return this.inventoryService.findAllSkus(tenantId);

      case 'get_inventory_status':
        return this.inventoryService.findAllStockLevels(tenantId);

      case 'get_marketing_calendar': {
        const skuIds = Array.isArray(input.skuIds)
          ? (input.skuIds as string[]).filter((s) => typeof s === 'string')
          : [];
        const from = input.from ? new Date(input.from as string) : new Date();
        const to = input.to ? new Date(input.to as string) : new Date(Date.now() + 90 * 86_400_000);
        return this.campaignsService.findForSkus(tenantId, skuIds, from, to);
      }

      case 'get_low_stock_skus':
        return this.inventoryService.findLowStock(tenantId);

      case 'get_movement_history':
        return this.inventoryService.getMovementHistory(tenantId, input.skuId as string);

      case 'get_vendor':
        return this.vendorsService.findOne(tenantId, input.vendorId as string);

      case 'get_vendors_for_sku':
        return this.vendorsService.findVendorsForSku(tenantId, input.skuId as string);

      case 'get_vendor_catalog_entry':
        return this.vendorsService.getVendorCatalogEntry(
          tenantId,
          input.vendorId as string,
          input.skuId as string,
        );

      case 'get_all_vendors': {
        const { data } = await this.vendorsService.findAll(tenantId, {
          page: 1,
          limit: 100,
        });
        return data;
      }

      case 'get_purchase_orders': {
        const { data } = await this.purchaseOrdersService.findAll(tenantId, {
          page: 1,
          limit: 100,
        });
        const names = await this.nameLookups(tenantId);
        return data.map((po: any) => ({
          ...po,
          vendorName: names.vendors.get(po.vendorId) ?? null,
          warehouseName: names.warehouses.get(po.warehouseId)?.name ?? null,
          warehouseLocation: names.warehouses.get(po.warehouseId)?.location ?? null,
          lineItems: po.lineItems.map((li: any) => ({
            ...li,
            skuName: names.skus.get(li.skuId)?.name ?? null,
            skuCode: names.skus.get(li.skuId)?.sku ?? null,
          })),
        }));
      }

      case 'get_recent_movements': {
        const data = await this.stockMovementService.getRecentMovements(tenantId, undefined, 30);
        const names = await this.nameLookups(tenantId);
        return data.map((m: any) => ({
          ...m,
          warehouseName: names.warehouses.get(m.warehouseId)?.name ?? null,
          warehouseLocation: names.warehouses.get(m.warehouseId)?.location ?? null,
        }));
      }

      case 'get_forecasts': {
        const data = await this.forecastService.findAllByTenant(tenantId, 50);
        const names = await this.nameLookups(tenantId);
        return data.map((f: any) => ({
          ...f,
          skuName: names.skus.get(f.skuId)?.name ?? null,
          skuCode: names.skus.get(f.skuId)?.sku ?? null,
        }));
      }

      case 'get_approval_requests': {
        const { data } = await this.approvalQueueService.findAll(this.systemUser(tenantId), {
          page: 1,
          limit: 100,
        });
        return data;
      }

      case 'get_notifications': {
        const { data } = await this.notificationsService.findAll(
          { ...this.systemUser(tenantId), id: null } as unknown as UserResponseDto,
          {
            page: 1,
            limit: 100,
          },
        );
        return data;
      }

      case 'get_staff': {
        const { data } = await this.usersService.findAll(this.systemUser(tenantId), {
          page: 1,
          limit: 100,
        });
        const names = await this.nameLookups(tenantId);
        return data.map((u: any) => ({
          ...u,
          warehouseName: u.warehouseId ? names.warehouses.get(u.warehouseId)?.name ?? null : null,
        }));
      }

      case 'get_agent_runs': {
        const { data } = await this.agentRunService.findRecent(tenantId, 25);
        return data;
      }

      default:
        throw new BadRequestException({ message: 'An internal error occurred: unrecognized tool requested.', code: 'UNKNOWN_TOOL' });
    }
  }
}
