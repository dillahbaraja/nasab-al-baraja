import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const primaryEmailRecipient = String(process.env.EMAIL_PRIMARY_TO || process.env.SMTP_USER || 'info.albaraja@gmail.com').trim().toLowerCase();

export function createAdminSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRecipient(input) {
  const normalizedEmail = normalizeEmail(input?.email || input);
  if (!normalizedEmail) return null;

  return {
    email: normalizedEmail,
    unsubscribeToken: String(input?.unsubscribeToken || input?.email_unsubscribe_token || '').trim() || null,
    notificationsEnabled: input?.notificationsEnabled ?? input?.email_notifications_enabled ?? true,
    isPrimary: Boolean(input?.isPrimary)
  };
}

export function dedupeRecipients(recipients = []) {
  const uniqueRecipients = [];
  const seen = new Set();

  for (const recipient of recipients) {
    const normalized = normalizeRecipient(recipient);
    if (!normalized || seen.has(normalized.email)) continue;
    seen.add(normalized.email);
    uniqueRecipients.push(normalized);
  }

  return uniqueRecipients;
}

export function withPrimaryRecipient(recipients = []) {
  if (!primaryEmailRecipient) {
    return dedupeRecipients(recipients);
  }

  return dedupeRecipients([
    ...recipients,
    { email: primaryEmailRecipient, isPrimary: true, notificationsEnabled: true }
  ]);
}

export async function getAdminRecipients(supabase) {
  const [{ data: adminUsers, error: adminUsersError }, { data: adminMembers, error: adminMembersError }] = await Promise.all([
    supabase.from('admin_users').select('email'),
    supabase
      .from('baraja_member')
      .select('email, email_unsubscribe_token, email_notifications_enabled')
      .eq('claim_status', 'approved')
      .eq('member_level', 'admin')
      .eq('email_notifications_enabled', true)
  ]);

  if (adminUsersError) {
    throw new Error(adminUsersError.message || 'Failed to load admin_users recipients.');
  }

  if (adminMembersError) {
    throw new Error(adminMembersError.message || 'Failed to load admin member recipients.');
  }

  return withPrimaryRecipient([
    ...(adminUsers || []),
    ...(adminMembers || [])
  ]);
}

export async function getVerifiedAndAdminRecipients(supabase) {
  const { data, error } = await supabase
    .from('baraja_member')
    .select('email, email_unsubscribe_token, email_notifications_enabled')
    .eq('claim_status', 'approved')
    .eq('email_notifications_enabled', true)
    .in('member_level', ['verified', 'admin']);

  if (error) {
    throw new Error(error.message || 'Failed to load verified recipients.');
  }

  return withPrimaryRecipient(data || []);
}

export async function getAdminAndPrimaryRecipients(supabase) {
  return getAdminRecipients(supabase);
}

export function isRecipientEnabled(recipientOrMember) {
  return Boolean(recipientOrMember?.isPrimary || recipientOrMember?.notificationsEnabled ?? recipientOrMember?.email_notifications_enabled ?? true);
}

export async function getNodeWithParent(supabase, nodeId) {
  if (nodeId == null || nodeId === '') return null;

  const { data: node, error } = await supabase
    .from('nodes')
    .select('id, english_name, arabic_name, father_id')
    .eq('id', nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load node details.');
  }

  if (!node) return null;

  let parent = null;
  if (node.father_id != null && node.father_id !== '') {
    const { data: parentNode, error: parentError } = await supabase
      .from('nodes')
      .select('id, english_name, arabic_name')
      .eq('id', node.father_id)
      .maybeSingle();

    if (parentError) {
      throw new Error(parentError.message || 'Failed to load parent node details.');
    }

    parent = parentNode || null;
  }

  return { node, parent };
}

export async function reserveEmailEventKey(supabase, { eventKey, eventType, tableName }) {
  if (!eventKey) {
    throw new Error('eventKey is required for email deduplication.');
  }

  const { error } = await supabase
    .from('email_webhook_log')
    .insert({
      event_key: eventKey,
      event_type: String(eventType || ''),
      table_name: String(tableName || '')
    });

  if (!error) {
    return true;
  }

  if (error.code === '42P01' || error.code === 'PGRST205') {
    console.warn('email_webhook_log table is missing; skipping webhook deduplication.');
    return true;
  }

  if (error.code === '23505') {
    return false;
  }

  throw new Error(error.message || 'Failed to reserve email event key.');
}
