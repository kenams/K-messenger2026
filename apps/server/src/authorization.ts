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
