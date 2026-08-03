import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { User } from '../users/entities/user.entity';
import { ApprovalRequestedPayload } from './events/approval-requested.event';
import { AnomalyFlaggedPayload } from './events/anomaly-flagged.event';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly initPromise: Promise<void>;

  constructor(private readonly configService: ConfigService) {
    this.initPromise = this.initTransporter();
  }

  private async initTransporter(): Promise<void> {
    try {
      const host = this.configService.get<string>('SMTP_HOST');
      const user = this.configService.get<string>('SMTP_USER');
      const pass = this.configService.get<string>('SMTP_PASS');

      if (host && user && pass) {
        this.transporter = nodemailer.createTransport({
          host,
          port: parseInt(this.configService.get<string>('SMTP_PORT', '587'), 10),
          secure: this.configService.get<string>('SMTP_PORT') === '465',
          auth: { user, pass },
        });
        this.logger.log(`Real SMTP email account configured: ${host}`);
      } else {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: { user: testAccount.user, pass: testAccount.pass },
        });
        this.logger.log('Ethereal test email account created successfully.');
      }
    } catch (err) {
      this.logger.error(
        'Failed to configure email transporter',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private getFrom(): string {
    return (
      this.configService.get<string>('SMTP_FROM') ||
      '"StockSavvy" <no-reply@stocksavvy.com>'
    );
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.initPromise;
    if (!this.transporter) {
      this.logger.log(`[Mock Email] to=${to} subject="${subject}"`);
      return;
    }
    try {
      const info = await this.transporter.sendMail({
        from: this.getFrom(),
        to,
        subject,
        html,
      });
      this.logger.log(`[Email Sent] messageId=${info.messageId} to=${to}`);
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${to}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  async sendToUsers(users: User[], subject: string, html: string): Promise<void> {
    for (const user of users) {
      if (user.email) {
        await this.sendEmail(user.email, subject, html);
      }
    }
  }

  async sendApprovalRequired(
    users: User[],
    payload: ApprovalRequestedPayload,
  ): Promise<void> {
    const subject = 'Action required: an agent step needs your approval';
    const html = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Approval Required</h2>
        <p>The ${payload.agentType} agent (run ${payload.agentRunId}, step ${payload.stepNumber}) is waiting for your review.</p>
        <p>Reasoning: ${payload.reasoning ?? 'No reasoning provided'}</p>
        <p style="font-size: 12px; color: #666;">Sign in to StockSavvy to approve or reject this request.</p>
      </div>
    `;
    await this.sendToUsers(users, subject, html);
  }

  async sendCriticalAnomaly(
    users: User[],
    payload: AnomalyFlaggedPayload,
  ): Promise<void> {
    const subject = 'Critical anomaly flagged in inventory';
    const html = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Critical Anomaly Flagged</h2>
        <p>${payload.description}</p>
        ${payload.skuId ? `<p>SKU: ${payload.skuId}</p>` : ''}
        <p style="font-size: 12px; color: #666;">Review the anomaly in the StockSavvy dashboard.</p>
      </div>
    `;
    await this.sendToUsers(users, subject, html);
  }
}
