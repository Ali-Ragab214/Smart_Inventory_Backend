export class AgentRunResponseDto {
  id!: string;
  agentType!: string;
  status!: string;
  skuIds!: string[];
  relatedVendorId!: string | null;
  relatedPoId!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
