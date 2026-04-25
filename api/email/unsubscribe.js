import { createAdminSupabaseClient } from '../_lib/supabase-admin.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage({ token, message = '', success = false }) {
  const safeToken = escapeHtml(token);
  const messageBlock = message
    ? `<div style="margin-bottom:20px;padding:12px 14px;border-radius:10px;background:${success ? '#ecfdf5' : '#fef2f2'};color:${success ? '#065f46' : '#991b1b'};font-size:14px;line-height:1.6;">${escapeHtml(message)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Email Notifications</title>
  </head>
  <body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:700px;margin:48px auto;padding:24px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;color:#111827;">
        <div style="font-size:24px;font-weight:700;margin-bottom:12px;text-align:center;">Nasab Al-Baraja</div>
        <div style="font-size:15px;line-height:1.7;margin-bottom:20px;text-align:center;color:#374151;">Choose which email notifications you want to disable. You can enable them again later from Settings.</div>
        ${messageBlock}
        <form method="POST" action="/api/email/unsubscribe" style="display:grid;gap:12px;">
          <input type="hidden" name="token" value="${safeToken}" />
          <button type="submit" name="action" value="disable_all" style="padding:14px 16px;border:none;border-radius:10px;background:#111827;color:#fff;font-size:15px;cursor:pointer;">A. Disable all email notifications</button>
          <button type="submit" name="action" value="disable_person_updates" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#111827;font-size:15px;cursor:pointer;">B. Disable person change notifications</button>
          <button type="submit" name="action" value="disable_new_person" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#111827;font-size:15px;cursor:pointer;">C. Disable new person notifications</button>
          <button type="submit" name="action" value="disable_member_updates" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#111827;font-size:15px;cursor:pointer;">D. Disable member notifications</button>
        </form>
      </div>
    </div>
  </body>
</html>`;
}

function parseFormBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  return String(body).split('&').reduce((acc, pair) => {
    const [rawKey, rawValue = ''] = pair.split('=');
    const key = decodeURIComponent(String(rawKey || '').replace(/\+/g, ' '));
    const value = decodeURIComponent(String(rawValue || '').replace(/\+/g, ' '));
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function getUpdateForAction(action) {
  if (action === 'disable_all') {
    return {
      email_notifications_enabled: false,
      email_notify_new_person: false,
      email_notify_person_updates: false,
      email_notify_member_updates: false
    };
  }

  if (action === 'disable_person_updates') {
    return { email_notify_person_updates: false };
  }

  if (action === 'disable_new_person') {
    return { email_notify_new_person: false };
  }

  if (action === 'disable_member_updates') {
    return { email_notify_member_updates: false };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).send('Method not allowed.');
    return;
  }

  const source = req.method === 'GET' ? req.query : parseFormBody(req.body);
  const token = String(source?.token || '').trim();

  if (!token) {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage({ token: '', message: 'Missing unsubscribe token.' }));
    return;
  }

  if (req.method === 'GET') {
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage({ token }));
    return;
  }

  const action = String(source?.action || '').trim();
  const update = getUpdateForAction(action);
  if (!update) {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage({ token, message: 'Unknown email notification action.' }));
    return;
  }

  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('baraja_member')
      .update(update)
      .eq('email_unsubscribe_token', token)
      .select('id')
      .maybeSingle();

    if (error) throw error;

    res.status(data ? 200 : 404).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage({
      token,
      success: Boolean(data),
      message: data
        ? 'Your email notification preferences have been updated successfully.'
        : 'This notification link is invalid or no longer available.'
    }));
  } catch (error) {
    console.error('Email unsubscribe failed:', error);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPage({ token, message: 'We could not update your email notification preference right now. Please try again later from Settings.' }));
  }
}
