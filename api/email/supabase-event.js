import {
  buildAdminPromotionEmail,
  buildAdminPromotionForMemberEmail,
  buildAdminTreeChangeEmail,
  buildNodeTargetUrl,
  buildGuestProposalEmail,
  buildMemberApprovedEmail,
  buildMemberApprovedForMemberEmail,
  buildPendingMemberEmail,
  buildPendingMemberForRegistrantEmail,
  decorateEmailForRecipient
} from '../_lib/email-templates.js';
import { sendEmail } from '../_lib/mail.js';
import {
  createAdminSupabaseClient,
  dedupeRecipients,
  doesRecipientAllowCategory,
  getAdminAndPrimaryRecipients,
  getAdminRecipients,
  getNodeWithParent,
  getVerifiedAndAdminRecipients,
  isRecipientEnabled,
  reserveEmailEventKey
} from '../_lib/supabase-admin.js';

function getSecretFromRequest(req) {
  const authorization = String(req.headers.authorization || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  if (authorization) return authorization;
  return String(req.headers['x-webhook-secret'] || '').trim();
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

function getBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  if (configured) return configured;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  if (!host) return '';
  const proto = String(req.headers['x-forwarded-proto'] || 'https').trim();
  return `${proto}://${host}`;
}

async function getTargetUrlForMemberRecord(supabase, baseUrl, record) {
  const personId = String(record?.person_id || '').trim();
  if (!personId) return '';

  let nodeDetails = null;
  try {
    nodeDetails = await getNodeWithParent(supabase, personId);
  } catch {
    nodeDetails = null;
  }

  return buildNodeTargetUrl(baseUrl, personId, nodeDetails?.parent?.id || nodeDetails?.node?.father_id || '');
}

function getTargetUrlForNotice(baseUrl, record, nodeDetails) {
  return buildNodeTargetUrl(baseUrl, record?.target_id, nodeDetails?.parent?.id || nodeDetails?.node?.father_id || record?.target_person_id || '');
}

function shouldSendPendingMemberEmail(record, oldRecord) {
  return Boolean(record && record.claim_status === 'pending' && (!oldRecord || oldRecord.claim_status !== 'pending'));
}

function shouldSendAdminPromotionEmail(record, oldRecord) {
  return Boolean(record && record.claim_status === 'approved' && record.member_level === 'admin' && (!oldRecord || oldRecord.member_level !== 'admin'));
}

function shouldSendMemberApprovedEmail(record, oldRecord) {
  return Boolean(record && record.claim_status === 'approved' && (!oldRecord || oldRecord.claim_status !== 'approved'));
}

function shouldSendGuestProposalEmail(record, eventType) {
  return Boolean(eventType === 'INSERT' && record && (record.type === 'proposal_add_child' || record.type === 'proposal_name_change'));
}

function shouldSendAdminTreeChangeEmail(record, eventType) {
  return Boolean(eventType === 'INSERT' && record && (record.type === 'new_member' || record.type === 'admin_name_change'));
}

function buildDeliveryEventKey(kind, record) {
  if (!record) return '';
  const stamp = record.created_at || record.updated_at || record.approved_at || record.timestamp || '';
  return [kind, record.id, record.email || record.type || record.claim_status || record.member_level || '', stamp].join(':');
}

async function deliverOnce({ supabase, kind, tableName, eventType, record, deliver }) {
  const eventKey = buildDeliveryEventKey(kind, record);
  const reserved = await reserveEmailEventKey(supabase, { eventKey, eventType, tableName });

  if (!reserved) {
    return { kind, recipientCount: 0, skipped: true, reason: 'duplicate_event' };
  }

  return deliver();
}

async function sendMessageToRecipients({ recipients, message, baseUrl }) {
  const filteredRecipients = (recipients || []).filter((recipient) => recipient?.email && isRecipientEnabled(recipient));
  const accepted = [];
  const rejected = [];
  const results = [];

  for (const recipient of filteredRecipients) {
    const personalizedMessage = decorateEmailForRecipient(message, recipient, baseUrl);
    const result = await sendEmail({ to: [recipient.email], ...personalizedMessage });
    accepted.push(...(result.accepted || []));
    rejected.push(...(result.rejected || []));
    results.push(...(result.results || []));
  }

  return {
    recipientCount: filteredRecipients.length,
    accepted,
    rejected,
    results
  };
}

async function sendCategoryMessageToRecipients({ recipients, message, baseUrl, category }) {
  return sendMessageToRecipients({
    recipients: (recipients || []).filter((recipient) => doesRecipientAllowCategory(recipient, category)),
    message,
    baseUrl
  });
}

async function deliverPendingMemberEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'pending_member', tableName, eventType, record,
    deliver: async () => {
      const recipients = await getAdminRecipients(supabase);
      const targetUrl = await getTargetUrlForMemberRecord(supabase, baseUrl, record);
      const sent = await sendCategoryMessageToRecipients({ recipients, message: buildPendingMemberEmail(record, targetUrl), baseUrl, category: 'member_updates' });
      return { kind: 'pending_member', ...sent };
    }
  });
}

async function deliverPendingMemberRegistrantEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'pending_member_registrant', tableName, eventType, record,
    deliver: async () => {
      const recipient = {
        email: String(record?.email || '').trim().toLowerCase(),
        unsubscribeToken: record?.email_unsubscribe_token,
        notificationsEnabled: record?.email_notifications_enabled,
        notifyNewPerson: record?.email_notify_new_person,
        notifyPersonUpdates: record?.email_notify_person_updates,
        notifyMemberUpdates: record?.email_notify_member_updates
      };
      const targetUrl = await getTargetUrlForMemberRecord(supabase, baseUrl, record);
      const sent = await sendCategoryMessageToRecipients({ recipients: [recipient], message: buildPendingMemberForRegistrantEmail(record, targetUrl), baseUrl, category: 'member_updates' });
      return { kind: 'pending_member_registrant', ...sent };
    }
  });
}

async function deliverAdminPromotionEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'admin_promotion', tableName, eventType, record,
    deliver: async () => {
      const recipients = await getAdminRecipients(supabase);
      const targetUrl = await getTargetUrlForMemberRecord(supabase, baseUrl, record);
      const sent = await sendCategoryMessageToRecipients({ recipients, message: buildAdminPromotionEmail(record, targetUrl), baseUrl, category: 'member_updates' });
      return { kind: 'admin_promotion', ...sent };
    }
  });
}

async function deliverAdminPromotionForMemberEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'admin_promotion_member', tableName, eventType, record,
    deliver: async () => {
      const recipient = {
        email: String(record?.email || '').trim().toLowerCase(),
        unsubscribeToken: record?.email_unsubscribe_token,
        notificationsEnabled: record?.email_notifications_enabled,
        notifyNewPerson: record?.email_notify_new_person,
        notifyPersonUpdates: record?.email_notify_person_updates,
        notifyMemberUpdates: record?.email_notify_member_updates
      };
      const targetUrl = await getTargetUrlForMemberRecord(supabase, baseUrl, record);
      const sent = await sendCategoryMessageToRecipients({ recipients: [recipient], message: buildAdminPromotionForMemberEmail(record, targetUrl), baseUrl, category: 'member_updates' });
      return { kind: 'admin_promotion_member', ...sent };
    }
  });
}

async function deliverMemberApprovedEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'member_approved', tableName, eventType, record,
    deliver: async () => {
      const adminRecipients = await getAdminAndPrimaryRecipients(supabase);
      const verifiedRecipients = await getVerifiedAndAdminRecipients(supabase);
      const targetUrl = await getTargetUrlForMemberRecord(supabase, baseUrl, record);
      const sent = await sendCategoryMessageToRecipients({ recipients: dedupeRecipients([...adminRecipients, ...verifiedRecipients]), message: buildMemberApprovedEmail(record, targetUrl), baseUrl, category: 'member_updates' });
      return { kind: 'member_approved', ...sent };
    }
  });
}

async function deliverMemberApprovedForMemberEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'member_approved_member', tableName, eventType, record,
    deliver: async () => {
      const recipient = {
        email: String(record?.email || '').trim().toLowerCase(),
        unsubscribeToken: record?.email_unsubscribe_token,
        notificationsEnabled: record?.email_notifications_enabled,
        notifyNewPerson: record?.email_notify_new_person,
        notifyPersonUpdates: record?.email_notify_person_updates,
        notifyMemberUpdates: record?.email_notify_member_updates
      };
      const targetUrl = await getTargetUrlForMemberRecord(supabase, baseUrl, record);
      const sent = await sendCategoryMessageToRecipients({ recipients: [recipient], message: buildMemberApprovedForMemberEmail(record, targetUrl), baseUrl, category: 'member_updates' });
      return { kind: 'member_approved_member', ...sent };
    }
  });
}

async function deliverGuestProposalEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'guest_proposal', tableName, eventType, record,
    deliver: async () => {
      const recipients = await getVerifiedAndAdminRecipients(supabase);
      let nodeDetails = null;
      try {
        nodeDetails = await getNodeWithParent(supabase, record.target_id);
      } catch (error) {
        console.error('Failed to enrich guest proposal email with node details:', error);
      }
      const targetUrl = getTargetUrlForNotice(baseUrl, record, nodeDetails);
      const sent = await sendCategoryMessageToRecipients({ recipients, message: buildGuestProposalEmail({ notice: record, nodeDetails, targetUrl }), baseUrl, category: 'person_updates' });
      return { kind: 'guest_proposal', ...sent };
    }
  });
}

async function deliverAdminTreeChangeEmail({ supabase, record, eventType, tableName, baseUrl }) {
  return deliverOnce({
    supabase, kind: 'admin_tree_change', tableName, eventType, record,
    deliver: async () => {
      const recipients = await getVerifiedAndAdminRecipients(supabase);
      let nodeDetails = null;
      try {
        nodeDetails = await getNodeWithParent(supabase, record.target_id);
      } catch (error) {
        console.error('Failed to enrich admin tree change email with node details:', error);
      }
      const targetUrl = getTargetUrlForNotice(baseUrl, record, nodeDetails);
      const sent = await sendCategoryMessageToRecipients({ recipients, message: buildAdminTreeChangeEmail({ notice: record, nodeDetails, targetUrl }), baseUrl, category: record?.type === 'new_member' ? 'new_person' : 'person_updates' });
      return { kind: 'admin_tree_change', ...sent };
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const expectedSecret = String(process.env.SUPABASE_WEBHOOK_SECRET || '').trim();
  if (!expectedSecret) {
    console.error('SUPABASE_WEBHOOK_SECRET is not configured. Rejecting webhook request.');
    res.status(500).json({ error: 'Webhook secret is not configured.' });
    return;
  }

  const requestSecret = getSecretFromRequest(req);
  if (requestSecret !== expectedSecret) {
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
    const baseUrl = getBaseUrl(req);
    const deliveries = [];

    if (table === 'baraja_member') {
      if (shouldSendPendingMemberEmail(record, oldRecord)) {
        deliveries.push(await deliverPendingMemberEmail({ supabase, record, eventType, tableName: table, baseUrl }));
        deliveries.push(await deliverPendingMemberRegistrantEmail({ supabase, record, eventType, tableName: table, baseUrl }));
      }
      if (shouldSendMemberApprovedEmail(record, oldRecord)) {
        deliveries.push(await deliverMemberApprovedEmail({ supabase, record, eventType, tableName: table, baseUrl }));
        deliveries.push(await deliverMemberApprovedForMemberEmail({ supabase, record, eventType, tableName: table, baseUrl }));
      }
      if (shouldSendAdminPromotionEmail(record, oldRecord)) {
        deliveries.push(await deliverAdminPromotionEmail({ supabase, record, eventType, tableName: table, baseUrl }));
        deliveries.push(await deliverAdminPromotionForMemberEmail({ supabase, record, eventType, tableName: table, baseUrl }));
      }
    }

    if (table === 'notices' && shouldSendGuestProposalEmail(record, eventType)) {
      deliveries.push(await deliverGuestProposalEmail({ supabase, record, eventType, tableName: table, baseUrl }));
    }
    if (table === 'notices' && shouldSendAdminTreeChangeEmail(record, eventType)) {
      deliveries.push(await deliverAdminTreeChangeEmail({ supabase, record, eventType, tableName: table, baseUrl }));
    }

    res.status(200).json({ ok: true, deliveries });
  } catch (error) {
    console.error('Supabase email webhook failed:', error);
    res.status(500).json({ error: error.message || 'Unexpected webhook failure.' });
  }
}
