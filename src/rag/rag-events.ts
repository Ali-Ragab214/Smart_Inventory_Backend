/* ─── RAG Domain Event Payloads ─── */

export const RagEvents = {
  VENDOR_CATALOG_UPSERTED: 'knowledge.vendorCatalog.upserted',
  VENDOR_CATALOG_DELETED: 'knowledge.vendorCatalog.deleted',
  PURCHASE_ORDER_SAVED: 'knowledge.purchaseOrder.saved',
  NEGOTIATION_APPROVED: 'knowledge.negotiation.approved',
  VENDOR_DELETED: 'knowledge.vendor.deleted',
  WAREHOUSE_SAVED: 'knowledge.warehouse.saved',
  WAREHOUSE_DELETED: 'knowledge.warehouse.deleted',
} as const;

export interface VendorCatalogUpsertedEvent {
  tenantId: string;
  vendorId: string;
  vendorName: string;
  catalogEntryId: string;
  skuId: string;
  price: number;
  leadTimeDays: number;
}

export interface VendorCatalogDeletedEvent {
  tenantId: string;
  vendorId: string;
  catalogEntryId: string;
}

export interface PurchaseOrderSavedEvent {
  tenantId: string;
  purchaseOrderId: string;
  vendorId: string;
  warehouseId: string;
  status: string;
  createdBy: string;
  negotiationRunId: string | null;
  lineItems: Array<{
    skuId: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export interface NegotiationApprovedEvent {
  tenantId: string;
  approvalId: string;
  vendorId: string;
  agentRunId: string;
  reasoning: string;
  payload: Record<string, unknown>;
}

export interface VendorDeletedEvent {
  tenantId: string;
  vendorId: string;
  vendorName: string;
}

export interface WarehouseSavedEvent {
  tenantId: string;
  warehouseId: string;
  warehouseName: string;
  location: string | null;
  status: string;
  isMain: boolean;
}

export interface WarehouseDeletedEvent {
  tenantId: string;
  warehouseId: string;
  warehouseName: string;
}
