export class SkuResponseDto {
  id!: string;

  sku!: string;

  name!: string;

  categoryId!: string | null;

  cost!: number;

  price!: number;

  preferredVendorId!: string | null;

  createdAt!: Date;

  updatedAt!: Date;
}
