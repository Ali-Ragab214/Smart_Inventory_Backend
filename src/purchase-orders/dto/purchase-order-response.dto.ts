export class PurchaseOrderLineItemResponseDto {
  id!: string;
  skuId!: string;
  quantity!: number;
  unitPrice!: number;
  total!: number;
}

export class PurchaseOrderResponseDto {
  id!: string;
  vendorId!: string;
  warehouseId!: string;
  status!: string;
  createdBy!: string;
  negotiationRunId!: string | null;
  lineItems!: PurchaseOrderLineItemResponseDto[];
  createdAt!: Date;
  updatedAt!: Date;
}
