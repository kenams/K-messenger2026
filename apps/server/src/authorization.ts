import { supabaseAdmin } from './supabase.js';

export async function requireConversationMember(userId: string, conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('FORBIDDEN');
}

export async function requireActiveDevice(userId: string, deviceId: string) {
  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('id')
    .eq('id', deviceId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error || !data) throw new Error('FORBIDDEN_DEVICE');
}

export async function requireNotBlocked(a: string, b: string) {
  const { data, error } = await supabaseAdmin
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  if (error) throw new Error('AUTHZ_FAILED');
  if (data?.length) throw new Error('BLOCKED');
}

export async function requireConversationNotBlocked(userId: string, conversationId: string) {
  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .select('kind')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError || !conversation) throw new Error('FORBIDDEN');

  // Blocking is a hard stop for 1:1 delivery. Group semantics are separate:
  // blocking a member must not silently break the entire group transport.
  if (conversation.kind !== 'direct') return;

  const { data: members, error: membersError } = await supabaseAdmin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId);
  if (membersError) throw new Error('AUTHZ_FAILED');

  const memberIds = (members ?? []).map((row) => row.user_id as string);
  if (memberIds.length !== 2 || !memberIds.includes(userId)) throw new Error('FORBIDDEN');

  const peerId = memberIds.find((id) => id !== userId);
  if (!peerId) throw new Error('FORBIDDEN');
  await requireNotBlocked(userId, peerId);
}
