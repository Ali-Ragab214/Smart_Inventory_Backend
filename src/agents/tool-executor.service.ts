import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { VendorsService } from '../vendors/vendors.service';
import { CampaignsService } from '../forecasts/campaigns.service';
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
];

@Injectable()
export class ToolExecutorService implements IToolExecutor {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly vendorsService: VendorsService,
    private readonly campaignsService: CampaignsService,
  ) {}

  async execute(tenantId: string, toolName: string, input: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'get_sku':
        return this.inventoryService.findSku(tenantId, input.skuId as string);

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

      default:
        throw new BadRequestException({ message: 'An internal error occurred: unrecognized tool requested.', code: 'UNKNOWN_TOOL' });
    }
  }
}
