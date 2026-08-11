import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
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
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<SimulatedVendorService>(SimulatedVendorService);
  });

  it('should accept an offer at or above the default floor', async () => {
    const event = await service.respondToOffer(TENANT_ID, 'approval-1', { discountPercent: 8 });
    expect(event.accepted).toBe(true);
    expect(event.counterDiscountPercent).toBeNull();
    expect(event.paymentTermsDays).toBe(30);
    expect(emit).toHaveBeenCalledWith(
      AgentEvents.VENDOR_RESPONDED,
      expect.objectContaining({ accepted: true, offeredDiscountPercent: 8 }),
    );
  });

  it('should counter below the floor with the configured increment', async () => {
    const event = await service.respondToOffer(TENANT_ID, 'approval-1', { discountPercent: 4 });
    expect(event.accepted).toBe(false);
    expect(event.counterDiscountPercent).toBe(6);
    expect(event.counterPaymentTermsDays).toBeNull();
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
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', { discountPercent: 9 });
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
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', { discountPercent: 5 });
    expect(event.accepted).toBe(true);

    const counter = await svc.respondToOffer(TENANT_ID, 'approval-1', { discountPercent: 3 });
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
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', { discountPercent: 8 });
    expect(event.accepted).toBe(false);
    expect(event.counterDiscountPercent).toBe(9);
  });

  it('should count long payment terms toward the concession (composite value)', async () => {
    const itemsRun = { ...mockRun, negotiationItems: [{ unitPrice: 100, recommendedQuantity: 10 }] };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatedVendorService,
        { provide: getRepositoryToken(VendorNegotiationProfile), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(AgentRun), useValue: { findOne: jest.fn().mockResolvedValue(itemsRun), save: jest.fn().mockResolvedValue(itemsRun) } },
        { provide: EventEmitter2, useValue: { emit } },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    // 5% discount alone is below the 8% floor, but net-60 adds 3 pts of terms
    // concession (0.1 pt/day over net-30) → 8 pts total → accepted.
    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', {
      discountPercent: 5,
      paymentTermsDays: 60,
    });
    expect(event.accepted).toBe(true);
    expect(event.orderValue).toBe(1000);
    // discount savings 50 + float value (1000 * 10% * 30 / 365) ≈ 8.22
    expect(event.compositeValueUSD).toBe(58.22);
  });

  it('should counter with standard terms when requested terms are too long', async () => {
    const itemsRun = { ...mockRun, negotiationItems: [{ unitPrice: 100, recommendedQuantity: 10 }] };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulatedVendorService,
        { provide: getRepositoryToken(VendorNegotiationProfile), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(AgentRun), useValue: { findOne: jest.fn().mockResolvedValue(itemsRun), save: jest.fn().mockResolvedValue(itemsRun) } },
        { provide: EventEmitter2, useValue: { emit } },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();
    const svc = module.get<SimulatedVendorService>(SimulatedVendorService);

    // 3% + (60-30)*0.1 = 6 pts < floor → counter at 5%, but the vendor
    // insists on net-30 terms.
    const event = await svc.respondToOffer(TENANT_ID, 'approval-1', {
      discountPercent: 3,
      paymentTermsDays: 60,
    });
    expect(event.accepted).toBe(false);
    expect(event.counterDiscountPercent).toBe(5);
    expect(event.counterPaymentTermsDays).toBe(30);
    expect(event.counterShippingCost).toBeNull();
    expect(event.message).toContain('net-30');
  });
});
