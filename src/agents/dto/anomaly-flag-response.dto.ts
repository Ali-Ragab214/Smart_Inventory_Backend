import { ApiProperty } from '@nestjs/swagger';

export class AnomalyFlagResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  agentRunId!: string | null;

  @ApiProperty()
  skuId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [String] })
  relatedMovementIds!: string[];

  @ApiProperty()
  status!: string;

  @ApiProperty({ nullable: true })
  reviewedBy!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
