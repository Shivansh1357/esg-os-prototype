import type { Task } from 'graphile-worker';
import { Pool } from 'pg';

type Payload = {
  tenantId: string;
  notificationId: string;
  to: string;
  subject: string;
  body: string;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function isPayload(payload: unknown): payload is Payload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.tenantId === 'string' &&
    typeof p.notificationId === 'string' &&
    typeof p.to === 'string' &&
    typeof p.subject === 'string' &&
    typeof p.body === 'string'
  );
}

const task: Task = async (payload, { logger }) => {
  if (!isPayload(payload)) {
    logger.error('notify.email FAIL: invalid payload');
    throw new Error('Invalid notify.email payload');
  }

  const { tenantId, notificationId, to, subject, body } = payload;
  let emailSent = false;

  // Email sending strategy:
  // 1. Check SMTP_HOST env var — if set, use nodemailer
  // 2. Otherwise, log the email (for dev/staging)
  const smtpHost = process.env.SMTP_HOST;

  if (smtpHost) {
    try {
      // Dynamic import to avoid requiring nodemailer in dev
      const nodemailerModuleName = 'nodemailer';
      const nodemailer = await import(nodemailerModuleName);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        } : undefined,
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@esg-os.local',
        to,
        subject: `[ESG OS] ${subject}`,
        text: body,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#1a1a2e">${subject}</h2>
          <p style="color:#333;line-height:1.6">${body.replace(/\n/g, '<br>')}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#999;font-size:12px">This notification was sent by ESG OS. Do not reply to this email.</p>
        </div>`,
      });

      emailSent = true;
      logger.info(`Email sent to ${to}: ${subject}`);
    } catch (err: any) {
      logger.error(`Email send failed: ${err.message}`);
    }
  } else {
    logger.info(`[DEV] Email would be sent to ${to}: ${subject}\n${body}`);
    emailSent = true;
  }

  // Persist notification email status with transaction-scoped tenant context.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    await client.query(`SELECT set_config('app.user_id', $1, true)`, ['00000000-0000-0000-0000-000000000001']);
    await client.query(
      `UPDATE esg.notifications SET email_sent = $1, email_address = $2 WHERE id = $3 AND tenant_id = $4`,
      [emailSent, to, notificationId, tenantId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default task;
