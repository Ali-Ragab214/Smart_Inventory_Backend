export abstract class BaseNotificationEvent<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  constructor(
    public readonly tenantId: string,
    public readonly payload: P,
  ) {}
}
