import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { VendorChannelService } from './vendor-channel.service';
import { SimulatedVendorService } from '../simulated-vendor.service';
import { VendorEmailService } from './vendor-email.service';
import { AgentRun } from '../entities/agent-run.entity';
import { Vendor } from '../../vendors/entities/vendor.entity';

describe('VendorChannelService', () => {
  let service: VendorChannelService;
  let simulated: { respondToOffer: jest.Mock };
  let emailService: { sendOffer: jest.Mock; isConfigured: jest.Mock };
  let getRepo: jest.Mock;

  const TENANT_ID = 'tenant-uuid';
  const RUN_ID = 'run-uuid';
  const OFFER = { discountPercent: 6, paymentTermsDays: 30, shippingCost: 50 };

  async function createModule(config: Record<string, string>): Promise<TestingModule> {
    return Test.createTestingModule({
      providers: [
        VendorChannelService,
        { provide: ConfigService, useValue: { get: (k: string, d?: string) => config[k] ?? d } },
        {
          provide: DataSource,
          useValue: { getRepository: getRepo },
        },
        { provide: SimulatedVendorService, useValue: simulated },
        { provide: VendorEmailService, useValue: emailService },
      ],
    }).compile();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    simulated = { respondToOffer: jest.fn().mockResolvedValue(undefined) };
    emailService = {
      sendOffer: jest.fn().mockResolvedValue(undefined),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    getRepo = jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
  });

  it('uses the simulated vendor when the channel is simulated', async () => {
    const module = await createModule({ VENDOR_CHANNEL: 'simulated' });
    service = module.get(VendorChannelService);
    await service.dispatchOffer(TENANT_ID, 'approval-1', RUN_ID, OFFER, {});
    expect(simulated.respondToOffer).toHaveBeenCalledWith(
      TENANT_ID,
      RUN_ID,
      OFFER,
      'approval-1',
    );
    expect(emailService.sendOffer).not.toHaveBeenCalled();
  });

  it('sends a real email when the channel is email and the vendor has a contact email', async () => {
    getRepo = jest.fn().mockImplementation((entity: unknown) => ({
      findOne: jest.fn().mockResolvedValue(
        entity === Vendor
          ? { id: 'vendor-1', contactEmail: 'sales@acme.com' }
          : { id: RUN_ID, relatedVendorId: 'vendor-1' },
      ),
    }));
    const module = await createModule({ VENDOR_CHANNEL: 'email' });
    service = module.get(VendorChannelService);

    await service.dispatchOffer(TENANT_ID, 'approval-1', RUN_ID, OFFER, {
      subject: 'Offer',
      emailContent: 'Dear vendor...',
    });

    expect(emailService.sendOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'sales@acme.com',
        runId: RUN_ID,
        subject: 'Offer',
        text: 'Dear vendor...',
        offer: OFFER,
      }),
    );
    expect(simulated.respondToOffer).not.toHaveBeenCalled();
  });

  it('falls back to the simulated vendor when the vendor has no contact email', async () => {
    getRepo = jest.fn().mockImplementation((entity: unknown) => ({
      findOne: jest.fn().mockResolvedValue(
        entity === Vendor
          ? { id: 'vendor-1', contactEmail: null }
          : { id: RUN_ID, relatedVendorId: 'vendor-1' },
      ),
    }));
    const module = await createModule({ VENDOR_CHANNEL: 'email' });
    service = module.get(VendorChannelService);

    await service.dispatchOffer(TENANT_ID, 'approval-1', RUN_ID, OFFER, {});
    expect(simulated.respondToOffer).toHaveBeenCalled();
    expect(emailService.sendOffer).not.toHaveBeenCalled();
  });

  it('throws a clear error when email channel is selected but SMTP is missing', async () => {
    emailService.isConfigured.mockReturnValue(false);
    getRepo = jest.fn().mockImplementation((entity: unknown) => ({
      findOne: jest.fn().mockResolvedValue(
        entity === Vendor
          ? { id: 'vendor-1', contactEmail: 'sales@acme.com' }
          : { id: RUN_ID, relatedVendorId: 'vendor-1' },
      ),
    }));
    const module = await createModule({ VENDOR_CHANNEL: 'email' });
    service = module.get(VendorChannelService);

    await expect(
      service.dispatchOffer(TENANT_ID, 'approval-1', RUN_ID, OFFER, {}),
    ).rejects.toThrow(/SMTP/);
  });
});
