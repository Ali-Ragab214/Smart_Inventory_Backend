import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class CreatePurchaseOrderLineItemDto {
  @IsUUID()
  @IsNotEmpty()
  skuId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unitPrice!: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  @IsNotEmpty()
  vendorId!: string;

  @IsUUID()
  @IsNotEmpty()
  warehouseId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'lineItems must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineItemDto)
  lineItems!: CreatePurchaseOrderLineItemDto[];

  @IsString()
  @IsOptional()
  createdBy?: string;
}
