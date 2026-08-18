import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { UserRole } from '../users/entities/user.entity';
import { EmailService } from './email.service';

jest.mock('nodemailer');

describe('EmailService', () => {
  let service: EmailService;
  const sendMail = jest.fn();

  const configValues: Record<string, string | undefined> = {
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user@test.com',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'StockSavvy <no-reply@stocksavvy.com>',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    sendMail.mockResolvedValue({ messageId: 'msg-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => configValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should send an email through the configured transporter', async () => {
    await service.sendEmail('recipient@test.com', 'Hello', '<p>Hi</p>');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.test.com', auth: { user: 'user@test.com', pass: 'secret' } }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@test.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        from: 'StockSavvy <no-reply@stocksavvy.com>',
      }),
    );
  });

  it('should not throw when the transporter rejects', async () => {
    sendMail.mockRejectedValue(new Error('smtp is down'));

    await expect(service.sendEmail('a@test.com', 'x', 'x')).resolves.toBeUndefined();
  });

  it('should log a mock email when no SMTP credentials are configured', async () => {
    const noSmtpConfig = new EmailService(
      { get: jest.fn((key: string) => (key === 'SMTP_HOST' ? undefined : undefined)) } as unknown as ConfigService,
    );

    await expect(noSmtpConfig.sendEmail('a@test.com', 'Mock', '<p>x</p>')).resolves.toBeUndefined();
  });

  it('should send an approval-required email to every recipient user', async () => {
    const users = [
      { id: 'u1', email: 'owner@test.com', role: UserRole.TENANT },
      { id: 'u2', email: 'manager@test.com', role: UserRole.WAREHOUSE_MANAGER },
    ] as any;

    await service.sendApprovalRequired(users, {
      approvalId: 'ap-1',
      agentRunId: 'run-1',
      agentType: 'reorder',
      stepNumber: 2,
      reasoning: 'Low stock on multiple SKUs',
      requestedAt: new Date().toISOString(),
    });

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@test.com', subject: expect.stringContaining('approval') }),
    );
  });
});
