import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';

const FROM = process.env.MAIL_FROM || 'newsletter@based.example';
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const DRIVER = process.env.MAIL_DRIVER || 'ses'; // 'ses' | 'smtp'

let sesClient = null;
let smtpTransport = null;

if (DRIVER === 'ses') {
  sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
} else {
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function confirmationHtml(token) {
  const link = `${BASE_URL}/confirm?token=${token}`;
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#e8e8e8;padding:40px 0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#141414;border:1px solid #262626;border-radius:4px">
        <tr><td style="padding:36px 36px 0">
          <div style="font-size:11px;letter-spacing:.22em;color:#6b6b6b;text-transform:uppercase">Confirm subscription</div>
          <h1 style="font-size:22px;margin:14px 0 0;font-weight:600;color:#fff">One more step.</h1>
          <p style="font-size:14px;line-height:1.6;color:#9a9a9a;margin:16px 0 28px">
            You're almost in. Confirm your email to lock in your spot. If you didn't request this, ignore it — nothing happens without this click.
          </p>
          <a href="${link}" style="display:inline-block;background:#fff;color:#0a0a0a;text-decoration:none;font-size:14px;font-weight:600;padding:13px 26px;border-radius:3px">Confirm &rarr;</a>
          <p style="font-size:12px;color:#555;margin:28px 0 0;word-break:break-all">${link}</p>
        </td></tr>
        <tr><td style="padding:28px 36px 36px"><div style="border-top:1px solid #262626;padding-top:16px;font-size:11px;color:#444">Self-hosted. No third-party tracking. This link expires in 48h.</div></td></tr>
      </table>
    </td></tr></table></body></html>`;
}

export async function sendConfirmation(email, token) {
  const subject = 'Confirm your subscription';
  const html = confirmationHtml(token);

  if (DRIVER === 'ses') {
    await sesClient.send(new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: html } }
      }
    }));
  } else {
    await smtpTransport.sendMail({ from: FROM, to: email, subject, html });
  }
}
