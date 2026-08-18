import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
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

import { CreatePurchaseOrderLineItemDto } from './create-purchase-order-line-item.dto';

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

  @IsUUID()
  @IsOptional()
  approvalRequestId?: string;

  @IsUUID()
  @IsOptional()
  negotiationRunId?: string;

  @IsOptional()
  @IsIn(['draft', 'pending_approval', 'approved'])
  status?: string;
}
