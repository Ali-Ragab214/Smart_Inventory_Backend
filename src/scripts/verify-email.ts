import 'dotenv/config';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

/**
 * Standalone verification of the vendor email channel credentials (no DB/Redis
 * required). Usage:
 *   npm run verify:email                  → test SMTP + IMAP connections only
 *   npm run verify:email -- send me@x.com → also send a real test email to me@x.com
 */
async function main() {
  const args = process.argv.slice(2);
  const sendIdx = args.indexOf('send');
  const sendTo = sendIdx >= 0 ? args[sendIdx + 1] : undefined;

  console.log('=== StockSavvy vendor email channel verification ===\n');
  console.log(`VENDOR_CHANNEL = ${process.env.VENDOR_CHANNEL ?? 'simulated'}`);

  let failed = false;

  // 1. SMTP
  console.log('[1/3] SMTP (sending)...');
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('  ✘ SMTP_HOST / SMTP_USER / SMTP_PASS missing in .env');
    failed = true;
  } else {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: smtpUser, pass: smtpPass },
    });
    try {
      await transporter.verify();
      console.log('  ✔ SMTP connection OK (credentials accepted).');
    } catch (err) {
      console.error('  ✘ SMTP connection FAILED:', (err as Error).message);
      failed = true;
    }
  }

  // 2. IMAP
  console.log('\n[2/3] IMAP (receiving)...');
  const imapHost = process.env.IMAP_HOST;
  const imapUser = process.env.IMAP_USER;
  const imapPass = process.env.IMAP_PASS;
  if (!imapHost || !imapUser || !imapPass) {
    console.error('  ✘ IMAP_HOST / IMAP_USER / IMAP_PASS missing in .env');
    failed = true;
  } else {
    const client = new ImapFlow({
      host: imapHost,
      port: parseInt(process.env.IMAP_PORT || '993', 10),
      secure: process.env.IMAP_TLS !== 'false',
      auth: { user: imapUser, pass: imapPass },
      logger: false,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mailbox = client.mailbox;
        console.log(
          `  ✔ IMAP connection OK (mailbox "${mailbox ? mailbox.path : 'unknown'}", ${mailbox ? mailbox.exists : 0} message(s)).`,
        );
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err) {
      console.error('  ✘ IMAP connection FAILED:', (err as Error).message);
      failed = true;
    }
  }

  // 3. Optional real test email
  console.log('\n[3/3] Test email...');
  if (sendTo) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: smtpUser, pass: smtpPass },
    });
    try {
      const from = process.env.SMTP_FROM || `"StockSavvy" <${smtpUser}>`;
      const info = await transporter.sendMail({
        from,
        to: sendTo,
        replyTo: smtpUser,
        subject: '[StockSavvy NEG-verify-run] Vendor channel test',
        text: 'If you received this, the StockSavvy vendor email channel SMTP settings are working. Reply to this email to test the inbound (IMAP) path.',
      });
      console.log(`  ✔ Test email sent to ${sendTo} (messageId ${info.messageId}).`);
    } catch (err) {
      console.error('  ✘ Test email FAILED:', (err as Error).message);
      failed = true;
    }
  } else {
    console.log('  – Skipped (add "send <email>" to send a real test email).');
  }

  console.log(`\n${failed ? 'Verification FAILED — fix the errors above.' : 'Verification PASSED.'}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
