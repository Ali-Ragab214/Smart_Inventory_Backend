export interface ToolExecutorService {
  execute(tenantId: string, toolName: string, input: Record<string, unknown>): Promise<unknown>;
}
