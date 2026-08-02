import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NOTIFICATION_SOCKET_EVENT } from './events/notification-events';

interface JwtSocketPayload {
  sub: string;
  tenantId?: string | null;
  warehouseId?: string | null;
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        return this.disconnect(client);
      }

      const payload = await this.jwtService.verifyAsync<JwtSocketPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.data.userId = payload.sub;
      client.data.tenantId = payload.tenantId ?? null;
      client.data.warehouseId = payload.warehouseId ?? null;

      if (payload.tenantId) {
        await client.join(`tenant:${payload.tenantId}`);
      }
      if (payload.warehouseId) {
        await client.join(`warehouse:${payload.warehouseId}`);
      }
      await client.join(`user:${payload.sub}`);

      this.logger.log(
        `Socket connected: user=${payload.sub} tenant=${payload.tenantId ?? '-'} socket=${client.id}`,
      );
    } catch (err) {
      this.logger.warn(
        `Socket connection rejected for ${client.id}: ${(err as Error).message}`,
      );
      this.disconnect(client);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket disconnected: socket=${client.id}`);
  }

  emitToTenant(tenantId: string, notification: NotificationResponseDto): void {
    this.server?.to(`tenant:${tenantId}`).emit(NOTIFICATION_SOCKET_EVENT, notification);
  }

  emitToWarehouse(warehouseId: string, notification: NotificationResponseDto): void {
    this.server?.to(`warehouse:${warehouseId}`).emit(NOTIFICATION_SOCKET_EVENT, notification);
  }

  emitToUser(userId: string, notification: NotificationResponseDto): void {
    this.server?.to(`user:${userId}`).emit(NOTIFICATION_SOCKET_EVENT, notification);
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: string } | undefined;
    const query = client.handshake.query as { token?: string } | undefined;
    const header = client.handshake.headers.authorization;

    if (auth?.token) return auth.token;
    if (query?.token) return query.token;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }

  private disconnect(client: Socket): void {
    client.disconnect(true);
  }
}
