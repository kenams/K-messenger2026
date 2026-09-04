import { supabaseAdmin } from './supabase.js';
import { requireNotBlocked } from './authorization.js';

export async function listContacts(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('contact_id,favorite,profiles!contacts_contact_id_fkey(id,username,display_name,avatar_url,custom_status,presence)')
    .eq('owner_id', userId)
    .order('favorite', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getContactAudience(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('contact_id')
    .eq('owner_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.contact_id as string);
}

export async function setPresence(userId: string, status: 'online' | 'busy' | 'away' | 'invisible' | 'offline') {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ presence: status, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function requestContact(userId: string, recipientId: string) {
  if (userId === recipientId) throw new Error('SELF_CONTACT');
  await requireNotBlocked(userId, recipientId);
  const { data, error } = await supabaseAdmin
    .from('contact_requests')
    .insert({ sender_id: userId, recipient_id: recipientId })
    .select('id,status')
    .single();
  if (error) throw error;
  return data;
}

export async function acceptContact(userId: string, requestId: string) {
  const { data: request, error } = await supabaseAdmin
    .from('contact_requests')
    .select('id,sender_id,recipient_id,status')
    .eq('id', requestId)
    .eq('recipient_id', userId)
    .eq('status', 'pending')
    .single();
  if (error || !request) throw new Error('REQUEST_NOT_FOUND');
  await requireNotBlocked(request.sender_id, request.recipient_id);

  const { error: contactError } = await supabaseAdmin.from('contacts').upsert([
    { owner_id: request.sender_id, contact_id: request.recipient_id },
    { owner_id: request.recipient_id, contact_id: request.sender_id },
  ]);
  if (contactError) throw contactError;

  const { error: updateError } = await supabaseAdmin
    .from('contact_requests')
    .update({ status: 'accepted' })
    .eq('id', requestId);
  if (updateError) throw updateError;
  return request;
}

export async function blockUser(userId: string, blockedId: string) {
  if (userId === blockedId) throw new Error('SELF_BLOCK');
  const { error } = await supabaseAdmin
    .from('blocks')
    .upsert({ blocker_id: userId, blocked_id: blockedId });
  if (error) throw error;

  await supabaseAdmin
    .from('contacts')
    .delete()
    .or(`and(owner_id.eq.${userId},contact_id.eq.${blockedId}),and(owner_id.eq.${blockedId},contact_id.eq.${userId})`);
}

export async function canWizz(senderId: string, recipientId: string) {
  await requireNotBlocked(senderId, recipientId);
  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('favorite')
    .eq('owner_id', recipientId)
    .eq('contact_id', senderId)
    .maybeSingle();
  const { data: privacy } = await supabaseAdmin
    .from('privacy_settings')
    .select('allow_wizz')
    .eq('user_id', recipientId)
    .maybeSingle();

  const policy = privacy?.allow_wizz ?? 'contacts';
  if (policy === 'nobody') throw new Error('WIZZ_DISABLED');
  if (policy === 'contacts' && !contact) throw new Error('WIZZ_FORBIDDEN');
  if (policy === 'favorites' && !contact?.favorite) throw new Error('WIZZ_FORBIDDEN');
}
