import { buildAdminPromotionEmail, buildGuestProposalEmail, buildPendingMemberEmail } from '../_lib/email-templates.js';
import { sendEmail } from '../_lib/mail.js';
import {
  createAdminSupabaseClient,
  getAdminRecipients,
  getNodeWithParent,
  getVerifiedAndAdminRecipients,
  reserveEmailEventKey
} from '../_lib/supabase-admin.js';

function getSecretFromRequest(req) {
  const authorization = req.headers.authorization || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return req.headers['x-webhook-secret'] || '';
}

function normalizePayload(body) {
  return body && typeof body === 'object' ? body : {};
}

function getTableName(payload) {
  return payload.table || payload.table_name || payload.type || payload.entity || '';
}

function getEventType(payload) {
  return String(payload.eventType || payload.type || payload.event || payload.operation || '').toUpperCase();
}

function getNewRecord(payload) {
  return payload.record || payload.new || payload.new_record || null;
}

function getOldRecord(payload) {
  return payload.old_record || payload.old || payload.previous || null;
}

function shouldSendPendingMemberEmail(record, oldRecord) {
  if (!record || record.claim_status !== 'pending') return false;
  return !oldRecord || oldRecord.claim_status !== 'pending';
}

function shouldSendAdminPromotionEmail(record, oldRecord) {
  if (!record || record.claim_status !== 'approved' || record.member_level !== 'admin') {
    return false;
  }

  return !oldRecord || oldRecord.member_level !== 'admin';
}

function shouldSendGuestProposalEmail(record, eventType) {
  if (eventType !== 'INSERT' || !record) return false;
  return record.type === 'proposal_add_child' || record.type === 'proposal_name_change';
}

function buildDeliveryEventKey(kind, record) {
  if (!record) return '';

  if (kind === 'pending_member') {
    return [
      kind,
      record.id,
      record.claim_status,
      record.created_at || record.updated_at || ''
    ].join(':');
  }

  if (kind === 'admin_promotion') {
    return [
      kind,
      record.id,
      record.member_level,
      record.updated_at || record.approved_at || ''
    ].join(':');
  }

  if (kind === 'guest_proposal') {
    return [
      kind,
      record.id,
      record.type,
      record.created_at || record.timestamp || ''
    ].join(':');
  }

  return '';
}

async function deliverOnce({ supabase, kind, tableName, eventType, record, deliver }) {
  const eventKey = buildDeliveryEventKey(kind, record);
  const reserved = await reserveEmailEventKey(supabase, {
    eventKey,
    eventType,
    tableName
  });

  if (!reserved) {
    return {
      kind,
      recipientCount: 0,
      skipped: true,
      reason: 'duplicate_event'
    };
  }

  return deliver();
}

async function deliverPendingMemberEmail({ supabase, record, eventType, tableName }) {
  return deliverOnce({
    supabase,
    kind: 'pending_member',
    tableName,
    eventType,
    record,
    deliver: async () => {
      const recipients = await getAdminRecipients(supabase);
      const message = buildPendingMemberEmail(record);

      return {
        kind: 'pending_member',
        recipientCount: recipients.length,
        accepted: recipients.length > 0 ? await sendEmail({ to: recipients.map((item) => item.email), ...message }) : { accepted: [], rejected: [] }
      };
    }
  });
}

async function deliverAdminPromotionEmail({ supabase, record, eventType, tableName }) {
  return deliverOnce({
    supabase,
    kind: 'admin_promotion',
    tableName,
    eventType,
    record,
    deliver: async () => {
      const recipients = await getVerifiedAndAdminRecipients(supabase);
      const message = buildAdminPromotionEmail(record);

      return {
        kind: 'admin_promotion',
        recipientCount: recipients.length,
        accepted: recipients.length > 0 ? await sendEmail({ to: recipients.map((item) => item.email), ...message }) : { accepted: [], rejected: [] }
      };
    }
  });
}

async function deliverGuestProposalEmail({ supabase, record, eventType, tableName }) {
  return deliverOnce({
    supabase,
    kind: 'guest_proposal',
    tableName,
    eventType,
    record,
    deliver: async () => {
      const recipients = await getAdminRecipients(supabase);
      let nodeDetails = null;
      try {
        nodeDetails = await getNodeWithParent(supabase, record.target_id);
      } catch (error) {
        console.error('Failed to enrich guest proposal email with node details:', error);
      }
      const message = buildGuestProposalEmail({ notice: record, nodeDetails });

      return {
        kind: 'guest_proposal',
        recipientCount: recipients.length,
        accepted: recipients.length > 0 ? await sendEmail({ to: recipients.map((item) => item.email), ...message }) : { accepted: [], rejected: [] }
      };
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET || '';
  const requestSecret = getSecretFromRequest(req);

  if (expectedSecret && requestSecret !== expectedSecret) {
    res.status(401).json({ error: 'Invalid webhook secret.' });
    return;
  }

  try {
    const payload = normalizePayload(req.body);
    const table = getTableName(payload);
    const eventType = getEventType(payload);
    const record = getNewRecord(payload);
    const oldRecord = getOldRecord(payload);
    const supabase = createAdminSupabaseClient();
    const deliveries = [];

    if (table === 'baraja_member') {
      if (shouldSendPendingMemberEmail(record, oldRecord)) {
        deliveries.push(await deliverPendingMemberEmail({ supabase, record, eventType, tableName: table }));
      }

      if (shouldSendAdminPromotionEmail(record, oldRecord)) {
        deliveries.push(await deliverAdminPromotionEmail({ supabase, record, eventType, tableName: table }));
      }
    }

    if (table === 'notices' && shouldSendGuestProposalEmail(record, eventType)) {
      deliveries.push(await deliverGuestProposalEmail({ supabase, record, eventType, tableName: table }));
    }

    res.status(200).json({
      ok: true,
      deliveries
    });
  } catch (error) {
    console.error('Supabase email webhook failed:', error);
    res.status(500).json({
      error: error.message || 'Unexpected webhook failure.'
    });
  }
}
