import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NEG_TAG_PREFIX, VendorOfferPayload } from './vendor-channel.types';

/**
 * Real outbound email to vendors via SMTP. No Ethereal/mock fallback: when
 * VENDOR_CHANNEL=email this transport must be configured, otherwise dispatch
 * throws so the misconfiguration is loud instead of silently faking it.
 */
@Injectable()
export class VendorEmailService {
  private readonly logger = new Logger(VendorEmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP_HOST/USER/PASS are not configured — real vendor emails are disabled.',
      );
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(this.config.get<string>('SMTP_PORT', '587'), 10),
      secure: this.config.get<string>('SMTP_PORT') === '465',
      auth: { user, pass },
    });
    this.logger.log(`Vendor email transporter configured via ${host}.`);
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async verifyConnection(): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP is not configured. Set SMTP_HOST/USER/PASS.');
    }
    await this.transporter.verify();
  }

  /** Tag the subject with the negotiation run id so replies can be correlated. */
  buildSubject(original: string, runId: string): string {
    const tag = `${NEG_TAG_PREFIX}${runId}]`;
    const clean = (original || 'Vendor offer').trim();
    if (clean.toLowerCase().includes(tag.toLowerCase())) return clean;
    return `${tag} ${clean}`;
  }

  async sendOffer(payload: VendorOfferPayload): Promise<void> {
    if (!this.transporter) {
      throw new Error(
        'SMTP is not configured. Set SMTP_HOST/USER/PASS or use VENDOR_CHANNEL=simulated.',
      );
    }
    const from =
      this.config.get<string>('SMTP_FROM') ||
      `"StockSavvy" <${this.config.get<string>('SMTP_USER')}>`;
    const replyTo = this.config.get<string>('SMTP_USER') ?? undefined;

    const info = await this.transporter.sendMail({
      from,
      to: payload.to,
      subject: this.buildSubject(payload.subject, payload.runId),
      text: payload.text,
      replyTo,
    });
    this.logger.log(
      `[Vendor Offer Sent] messageId=${info.messageId} to=${payload.to} run=${payload.runId}`,
    );
  }
}
