import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const emailFrom = process.env.EMAIL_FROM || smtpUser;

let transporter = null;

function getTransporter() {
  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured.');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });
  }

  return transporter;
}

export async function sendEmail({ to, subject, text, html }) {
  if (!Array.isArray(to) || to.length === 0) {
    return { accepted: [], rejected: [] };
  }

  const activeTransporter = getTransporter();
  return activeTransporter.sendMail({
    from: emailFrom,
    to: to.join(', '),
    subject,
    text,
    html
  });
}
