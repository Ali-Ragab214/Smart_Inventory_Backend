import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SimulatedVendorService } from './simulated-vendor.service';
import { VendorNegotiationProfile } from './entities/vendor-negotiation-profile.entity';
import { AgentRun } from './entities/agent-run.entity';
import { AgentEvents } from './agent-events';

describe('SimulatedVendorService', () => {
  let service: SimulatedVendorService;
  let emit: jest.Mock;

  const TENANT_ID = 'tenant-uuid';
  const VENDOR_ID = 'vendor-uuid';

  const mockRun = {
    id: 'run-1',
    tenantId: TENANT_ID,
    relatedVendorId: VENDOR_ID,
    roundNumber: 1,
    status: 'sent',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    emit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatedVendorService,
        { provide: getRepositoryToken(VendorNegotiationProfile), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(AgentRun), useValue: { findOne: jest.fn().mockResolvedValue(mockRun), save: jest.fn().mockResolvedValue(mockRun) } },
        { provide: EventEmitter2, useValue: { emit } },
      ],
    }).compile();

    service = module.get<SimulatedVendorService>(SimulatedVendorService);
  });

  it('should accept an offer at or above the default floor', async () => {
    const event = await service.respondToOffer(TENANT_ID, 'approval-1', 8);
    expect(event.accepted).toBe(true);
    expect(event.counterDiscountPercent).toBeNull();
    expect(emit).toHaveBeenCalledWith(
      AgentEvents.VENDOR_RESPONDED,
      expect.objectContaining({ accepted: true, offeredDiscountPercent: 8 }),
    );
  });

  it('should counter below the floor with the configured increment', async () => {
    const event = await service.respondToOffer(TENANT_ID, 'approval-1', 4);
    expect(event.accepted).toBe(false);
    expect(event.counterDiscountPercent).toBe(6);
  });

  it('should stand firm when the counter would hit the cap', async () => {
    const profileRepo = {
      findOne: jest.fn().mockResolvedValue({
        vendorId: VENDOR_ID,
        acceptMinimumDiscountPercent: 8,
        counterIncrementPercent: 1,
        maxDiscountPercent: 10,
        hardNegotiates: true,
      } as Partial<VendorNegotiationProfile>),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatedVendorService,
        { provide: getRepositoryToken(VendorNegotiationProfile), useValue: profileRepo },
        { provide: getRepositoryToken(AgentRun), useValue: { findOne: jest.fn().mockResolvedValue(mockRun), save: jest.fn().mockResolvedValue(mockRun) } },
        { provide: EventEmitter2, useValue: { emit } },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', 9);
    expect(event.accepted).toBe(false);
    expect(event.counterDiscountPercent).toBeNull();
    expect(event.message).toContain('final');
  });

  it('should use profile when present', async () => {
    const profileRepo = {
      findOne: jest.fn().mockResolvedValue({
        vendorId: VENDOR_ID,
        acceptMinimumDiscountPercent: 5,
        counterIncrementPercent: 1,
        maxDiscountPercent: 12,
        hardNegotiates: false,
      } as VendorNegotiationProfile),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatedVendorService,
        { provide: getRepositoryToken(VendorNegotiationProfile), useValue: profileRepo },
        { provide: getRepositoryToken(AgentRun), useValue: { findOne: jest.fn().mockResolvedValue(mockRun), save: jest.fn().mockResolvedValue(mockRun) } },
        { provide: EventEmitter2, useValue: { emit } },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', 5);
    expect(event.accepted).toBe(true);

    const counter = await svc.respondToOffer(TENANT_ID, 'approval-1', 3);
    expect(counter.counterDiscountPercent).toBe(4);
  });

  it('should hard-negotiate: floor raised and slower increments', async () => {
    const profileRepo = {
      findOne: jest.fn().mockResolvedValue({
        vendorId: VENDOR_ID,
        acceptMinimumDiscountPercent: 8,
        counterIncrementPercent: 2,
        maxDiscountPercent: 10,
        hardNegotiates: true,
      } as Partial<VendorNegotiationProfile>),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatedVendorService,
        { provide: getRepositoryToken(VendorNegotiationProfile), useValue: profileRepo },
        { provide: getRepositoryToken(AgentRun), useValue: { findOne: jest.fn().mockResolvedValue(mockRun), save: jest.fn().mockResolvedValue(mockRun) } },
        { provide: EventEmitter2, useValue: { emit } },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', 8);
    expect(event.accepted).toBe(false);
    expect(event.counterDiscountPercent).toBe(9);
  });
});