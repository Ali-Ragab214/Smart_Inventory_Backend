import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveApprovalRequestDto {
  @ApiProperty()
  @IsUUID()
  reviewedBy!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  editedPayload?: object;
}

export class RejectApprovalRequestDto {
  @ApiProperty()
  @IsUUID()
  reviewedBy!: string;
}

export class NegotiateApprovalRequestDto {
  @ApiProperty()
  @IsUUID()
  reviewedBy!: string;
}
