import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsUUID,
  Min,
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
