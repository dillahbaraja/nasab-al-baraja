import { createAdminSupabaseClient } from '../_lib/supabase-admin.js';

function renderPage(message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Email Notifications</title>
  </head>
  <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:48px auto;padding:24px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;text-align:center;color:#111827;">
        <div style="font-size:24px;font-weight:700;margin-bottom:12px;">Nasab Al-Baraja</div>
        <div style="font-size:16px;line-height:1.7;">${message}</div>
      </div>
    </div>
  </body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed.');
    return;
  }

  const token = String(req.query?.token || '').trim();
  if (!token) {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage('Missing unsubscribe token.'));
    return;
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('baraja_member')
      .update({ email_notifications_enabled: false })
      .eq('email_unsubscribe_token', token)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    res.status(data ? 200 : 404).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage(data
      ? 'Email notifications have been disabled for this account. You can enable them again later from Settings.'
      : 'This unsubscribe link is invalid or has already been used.'));
  } catch (error) {
    console.error('Email unsubscribe failed:', error);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage('We could not update your email notification preference right now. Please try again later from Settings.'));
  }
}
