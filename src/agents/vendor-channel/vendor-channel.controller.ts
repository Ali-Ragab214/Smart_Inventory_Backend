import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/public.decorator';
import { VendorEmailService } from './vendor-email.service';
import { VendorInboundMailService } from './vendor-inbound-mail.service';
import { VendorChannelService } from './vendor-channel.service';

import { IsEmail, IsOptional, IsString } from 'class-validator';

class TestSendDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  text?: string;
}

@ApiTags('agents')
@Controller('agents/vendor-channel')
export class VendorChannelController {
  constructor(
    private readonly vendorEmailService: VendorEmailService,
    private readonly inbound: VendorInboundMailService,
    private readonly channel: VendorChannelService,
  ) {}

  @Public()
  @Post('test-send')
  @ApiOperation({ summary: '[TEST] Send a real offer email to verify SMTP credentials' })
  async testSend(@Body() body: TestSendDto) {
    if (!body?.to) {
      throw new BadRequestException({ message: 'The "to" field is required.', code: 'TO_REQUIRED' });
    }
    await this.vendorEmailService.sendOffer({
      tenantId: 'test',
      runId: 'test-run',
      approvalId: 'test',
      vendorId: 'test',
      to: body.to,
      subject: body.subject ?? 'StockSavvy SMTP connection test',
      text:
        body.text ??
        'If you received this, the StockSavvy vendor email channel SMTP settings are working correctly.',
      offer: { discountPercent: 0 },
    });
    return { success: true, message: `Test email sent to ${body.to}` };
  }

  @Public()
  @Post('poll')
  @ApiOperation({ summary: '[TEST] Run one inbound email poll to verify IMAP credentials' })
  async poll() {
    await this.inbound.pollOnce();
    return { success: true, message: 'Inbound email poll completed.' };
  }

  @Public()
  @Get('status')
  @ApiOperation({ summary: '[TEST] Vendor channel configuration status' })
  status() {
    return {
      channel: this.channel.isEmailEnabled() ? 'email' : 'simulated',
      smtpConfigured: this.vendorEmailService.isConfigured(),
    };
  }
}
