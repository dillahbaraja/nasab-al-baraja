import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function normalizeRecipient(email) {
  const normalizedEmail = normalizeEmail(email);
  return normalizedEmail ? { email: normalizedEmail } : null;
}

export function dedupeRecipients(recipients = []) {
  const uniqueRecipients = [];
  const seen = new Set();

  for (const recipient of recipients) {
    const normalized = normalizeRecipient(recipient?.email || recipient);
    if (!normalized || seen.has(normalized.email)) continue;
    seen.add(normalized.email);
    uniqueRecipients.push(normalized);
  }

  return uniqueRecipients;
}

export async function getAdminRecipients(supabase) {
  const [{ data: adminUsers, error: adminUsersError }, { data: adminMembers, error: adminMembersError }] = await Promise.all([
    supabase.from('admin_users').select('email'),
    supabase
      .from('baraja_member')
      .select('email')
      .eq('claim_status', 'approved')
      .eq('member_level', 'admin')
  ]);

  if (adminUsersError) {
    throw new Error(adminUsersError.message || 'Failed to load admin_users recipients.');
  }

  if (adminMembersError) {
    throw new Error(adminMembersError.message || 'Failed to load admin member recipients.');
  }

  return dedupeRecipients([
    ...(adminUsers || []),
    ...(adminMembers || [])
  ]);
}

export async function getVerifiedAndAdminRecipients(supabase) {
  const { data, error } = await supabase
    .from('baraja_member')
    .select('email')
    .eq('claim_status', 'approved')
    .in('member_level', ['verified', 'admin']);

  if (error) {
    throw new Error(error.message || 'Failed to load verified recipients.');
  }

  return dedupeRecipients(data || []);
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
