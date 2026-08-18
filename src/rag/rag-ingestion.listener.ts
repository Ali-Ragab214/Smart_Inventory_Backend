import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RagService } from './rag.service';
import { KnowledgeSourceType } from './entities/knowledge-chunk.entity';
import {
  RagEvents,
  VendorCatalogUpsertedEvent,
  VendorCatalogDeletedEvent,
  PurchaseOrderSavedEvent,
  NegotiationApprovedEvent,
  VendorDeletedEvent,
  WarehouseSavedEvent,
  WarehouseDeletedEvent,
} from './rag-events';

@Injectable()
export class RagIngestionListener {
  private readonly logger = new Logger(RagIngestionListener.name);

  constructor(private readonly ragService: RagService) {}

  /* ── Vendor Catalog ── */

  @OnEvent(RagEvents.VENDOR_CATALOG_UPSERTED, { async: true })
  async onVendorCatalogUpserted(event: VendorCatalogUpsertedEvent): Promise<void> {
    const summary = [
      `${event.vendorName} supplies SKU ${event.skuId}`,
      `at $${event.price.toFixed(2)}/unit`,
      `with ${event.leadTimeDays}-day lead time.`,
    ].join(' ');

    try {
      await this.ragService.upsertForEntity(
        event.tenantId,
        'vendor_catalog',
        event.catalogEntryId,
        KnowledgeSourceType.CATALOG,
        summary,
        { vendorId: event.vendorId, skuId: event.skuId },
      );
      this.logger.log(`Ingested catalog chunk for entry ${event.catalogEntryId}`);
    } catch (err) {
      this.logger.error(
        `Failed to ingest catalog entry ${event.catalogEntryId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(RagEvents.VENDOR_CATALOG_DELETED, { async: true })
  async onVendorCatalogDeleted(event: VendorCatalogDeletedEvent): Promise<void> {
    try {
      await this.ragService.removeForEntity(
        event.tenantId,
        'vendor_catalog',
        event.catalogEntryId,
      );
      this.logger.log(`Removed catalog chunk for entry ${event.catalogEntryId}`);
    } catch (err) {
      this.logger.error(
        `Failed to remove catalog entry ${event.catalogEntryId}: ${(err as Error).message}`,
      );
    }
  }

  /* ── Purchase Orders ── */

  @OnEvent(RagEvents.PURCHASE_ORDER_SAVED, { async: true })
  async onPurchaseOrderSaved(event: PurchaseOrderSavedEvent): Promise<void> {
    const linesSummary = event.lineItems
      .map((li) => `SKU ${li.skuId}: ${li.quantity} units @ $${li.unitPrice.toFixed(2)}`)
      .join('; ');

    const total = event.lineItems.reduce(
      (sum, li) => sum + li.quantity * li.unitPrice,
      0,
    );

    const summary = [
      `Purchase Order ${event.purchaseOrderId}`,
      `for vendor ${event.vendorId}`,
      `(warehouse ${event.warehouseId}).`,
      `Status: ${event.status}.`,
      `Created by: ${event.createdBy}.`,
      event.negotiationRunId ? `Negotiation run: ${event.negotiationRunId}.` : '',
      `Line items: ${linesSummary}.`,
      `Total: $${total.toFixed(2)}.`,
    ]
      .filter(Boolean)
      .join(' ');

    try {
      await this.ragService.upsertForEntity(
        event.tenantId,
        'purchase_order',
        event.purchaseOrderId,
        KnowledgeSourceType.REPORT,
        summary,
        { vendorId: event.vendorId },
      );
      this.logger.log(`Ingested PO chunk for ${event.purchaseOrderId} (status: ${event.status})`);
    } catch (err) {
      this.logger.error(
        `Failed to ingest PO ${event.purchaseOrderId}: ${(err as Error).message}`,
      );
    }
  }

  /* ── Negotiation Approved ── */

  @OnEvent(RagEvents.NEGOTIATION_APPROVED, { async: true })
  async onNegotiationApproved(event: NegotiationApprovedEvent): Promise<void> {
    const payload = event.payload;
    const parts: string[] = [
      `Negotiation approved (approval ${event.approvalId}).`,
      `Vendor: ${event.vendorId}.`,
      `Agent run: ${event.agentRunId}.`,
    ];

    if (event.reasoning) {
      parts.push(`Reasoning: ${event.reasoning}`);
    }

    // Include any structured negotiation details from the payload
    if (payload.requestedDiscountPercent !== undefined) {
      parts.push(`Requested discount: ${payload.requestedDiscountPercent}%.`);
    }
    if (payload.emailContent) {
      parts.push(`Email content: ${String(payload.emailContent).slice(0, 500)}`);
    }
    if (payload.subject) {
      parts.push(`Subject: ${String(payload.subject)}.`);
    }

    const summary = parts.join(' ');

    try {
      await this.ragService.upsertForEntity(
        event.tenantId,
        'negotiation',
        event.approvalId,
        KnowledgeSourceType.NEGOTIATION_TRANSCRIPT,
        summary,
        { vendorId: event.vendorId },
      );
      this.logger.log(`Ingested negotiation chunk for approval ${event.approvalId}`);
    } catch (err) {
      this.logger.error(
        `Failed to ingest negotiation ${event.approvalId}: ${(err as Error).message}`,
      );
    }
  }

  /* ── Vendor Deleted ── */

  @OnEvent(RagEvents.VENDOR_DELETED, { async: true })
  async onVendorDeleted(event: VendorDeletedEvent): Promise<void> {
    try {
      await this.ragService.removeForEntity(event.tenantId, 'vendor', event.vendorId);
      this.logger.log(`Removed all knowledge chunks for vendor ${event.vendorId} (${event.vendorName})`);
    } catch (err) {
      this.logger.error(
        `Failed to remove vendor chunks for ${event.vendorId}: ${(err as Error).message}`,
      );
    }
  }

  /* ── Warehouses ── */

  @OnEvent(RagEvents.WAREHOUSE_SAVED, { async: true })
  async onWarehouseSaved(event: WarehouseSavedEvent): Promise<void> {
    const summary = [
      `Warehouse ${event.warehouseName}`,
      `is located in ${event.location || 'an unspecified city'}.`,
      `Status: ${event.status}.`,
      event.isMain ? 'This is the main warehouse.' : 'This is not the main warehouse.',
    ].join(' ');

    try {
      await this.ragService.upsertForEntity(
        event.tenantId,
        'warehouse',
        event.warehouseId,
        KnowledgeSourceType.REPORT,
        summary,
      );
      this.logger.log(`Ingested warehouse chunk for ${event.warehouseId} (${event.warehouseName})`);
    } catch (err) {
      this.logger.error(
        `Failed to ingest warehouse ${event.warehouseId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(RagEvents.WAREHOUSE_DELETED, { async: true })
  async onWarehouseDeleted(event: WarehouseDeletedEvent): Promise<void> {
    try {
      await this.ragService.removeForEntity(
        event.tenantId,
        'warehouse',
        event.warehouseId,
      );
      this.logger.log(`Removed warehouse chunk for ${event.warehouseId} (${event.warehouseName})`);
    } catch (err) {
      this.logger.error(
        `Failed to remove warehouse ${event.warehouseId}: ${(err as Error).message}`,
      );
    }
  }
}
