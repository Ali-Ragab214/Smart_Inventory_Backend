import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { NOTIFICATION_SOCKET_EVENT } from './events/notification-events';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let mockJwtService: { verifyAsync: jest.Mock };
  let mockServer: { to: jest.Mock };
  let mockClient: any;

  beforeEach(async () => {
    mockJwtService = { verifyAsync: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('secret') } },
      ],
    }).compile();

    gateway = module.get(NotificationsGateway);

    const room = { emit: jest.fn() };
    mockServer = { to: jest.fn().mockReturnValue(room) };
    (gateway as any).server = mockServer;

    mockClient = {
      id: 'socket-1',
      handshake: { auth: { token: 'valid-token' }, query: {}, headers: {} },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should authenticate the token and join tenant, warehouse, and user rooms', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        tenantId: 'tenant-1',
        warehouseId: 'warehouse-1',
      });

      await gateway.handleConnection(mockClient);

      expect(mockClient.join).toHaveBeenCalledWith('tenant:tenant-1');
      expect(mockClient.join).toHaveBeenCalledWith('warehouse:warehouse-1');
      expect(mockClient.join).toHaveBeenCalledWith('user:user-1');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect when no token is provided', async () => {
      mockClient.handshake.auth = {};
      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect when the token is invalid', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));
      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('emit methods', () => {
    const notification = { id: 'n1', title: 'Test' } as any;

    it('should emit to the tenant room', () => {
      gateway.emitToTenant('tenant-1', notification);
      expect(mockServer.to).toHaveBeenCalledWith('tenant:tenant-1');
      expect(mockServer.to('tenant:tenant-1').emit).toHaveBeenCalledWith(
        NOTIFICATION_SOCKET_EVENT,
        notification,
      );
    });

    it('should emit to the warehouse room', () => {
      gateway.emitToWarehouse('warehouse-1', notification);
      expect(mockServer.to).toHaveBeenCalledWith('warehouse:warehouse-1');
    });

    it('should emit to the user room', () => {
      gateway.emitToUser('user-1', notification);
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
    });
  });
});
