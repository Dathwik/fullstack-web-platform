const nodemailer = require('nodemailer');

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const STATUS_SUBJECT = {
  'In Preparation': 'Your order is being prepared',
  'Completed':      'Your order is ready',
  'Cancelled':      'Your order has been cancelled',
};

const STATUS_BODY = {
  'In Preparation': (name) =>
    `Hi ${name},\n\nGreat news! Your order is now being prepared. We will notify you when it is ready.\n\nThank you for ordering with us.`,
  'Completed': (name) =>
    `Hi ${name},\n\nYour order has been completed and is ready. Thank you for ordering with us!`,
  'Cancelled': (name) =>
    `Hi ${name},\n\nUnfortunately your order has been cancelled. Please contact us if you have any questions.`,
};

async function sendOrderStatusEmail(order, newStatus) {
  const subject = STATUS_SUBJECT[newStatus];
  if (!subject || !order.email) return;

  const transport = createTransport();
  if (!transport) return; // SMTP not configured — silently skip

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const text = STATUS_BODY[newStatus](order.customer_name);

  try {
    await transport.sendMail({
      from,
      to: order.email,
      subject,
      text,
    });
  } catch (err) {
    // Email failure must never break the API response; log and continue.
    console.error('Failed to send status email:', err.message);
  }
}

async function sendEmailChangeVerification(pendingEmail, name, token) {
  const transport = createTransport();
  if (!transport) return; // SMTP not configured — silently skip

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const link = `${appUrl}/verify-email?token=${token}`;

  try {
    await transport.sendMail({
      from,
      to: pendingEmail,
      subject: 'Confirm your new email address',
      text: `Hi ${name},\n\nConfirm this email address is yours by opening the link below. It expires in 24 hours.\n\n${link}\n\nIf you didn't request this change, you can ignore this message.`,
    });
  } catch (err) {
    // Email failure must never break the API response; log and continue.
    console.error('Failed to send email-change verification:', err.message);
  }
}

module.exports = { sendOrderStatusEmail, sendEmailChangeVerification };
