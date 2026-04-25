import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

let resendClient = null;

function getResendClient() {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY must be configured.');
  }

  if (!emailFrom) {
    throw new Error('EMAIL_FROM must be configured.');
  }

  if (!resendClient) {
    resendClient = new Resend(resendApiKey);
  }

  return resendClient;
}

export async function sendEmail({ to, subject, text, html }) {
  if (!Array.isArray(to) || to.length === 0) {
    return { accepted: [], rejected: [], results: [] };
  }

  const client = getResendClient();
  const accepted = [];
  const rejected = [];
  const results = [];

  for (const recipient of to) {
    try {
      const result = await client.emails.send({
        from: emailFrom,
        to: recipient,
        subject,
        text,
        html
      });

      if (result?.error) {
        rejected.push(recipient);
        results.push({ recipient, error: result.error.message || String(result.error) });
        continue;
      }

      accepted.push(recipient);
      results.push({ recipient, id: result?.data?.id || null });
    } catch (error) {
      rejected.push(recipient);
      results.push({ recipient, error: error.message || String(error) });
    }
  }

  return { accepted, rejected, results };
}
