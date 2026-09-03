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

export async function listContactRequests(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('contact_requests')
    .select('id,sender_id,recipient_id,status,created_at')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function searchProfiles(userId: string, query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await supabaseAdmin.rpc('search_profiles_by_username', { p_query: trimmed });
  if (error) throw error;
  return (data ?? []).filter((profile: { id: string }) => profile.id !== userId).slice(0, 20);
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

  const { data: existingContact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .select('contact_id')
    .eq('owner_id', userId)
    .eq('contact_id', recipientId)
    .maybeSingle();
  if (contactError) throw contactError;
  if (existingContact) throw new Error('ALREADY_CONTACT');

  const { data: pending, error: pendingError } = await supabaseAdmin
    .from('contact_requests')
    .select('id,sender_id,recipient_id,status')
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${userId})`)
    .eq('status', 'pending')
    .maybeSingle();
  if (pendingError) throw pendingError;
  if (pending) return pending;

  const { data, error } = await supabaseAdmin
    .from('contact_requests')
    .insert({ sender_id: userId, recipient_id: recipientId })
    .select('id,sender_id,recipient_id,status')
    .single();
  if (error) throw error;
  return data;
}

export async function acceptContact(userId: string, requestId: string) {
  const { data, error } = await supabaseAdmin.rpc('accept_contact_request', {
    p_recipient_id: userId,
    p_request_id: requestId,
  });
  if (error) {
    if (error.message.includes('REQUEST_NOT_FOUND')) throw new Error('REQUEST_NOT_FOUND');
    if (error.message.includes('BLOCKED')) throw new Error('BLOCKED');
    throw error;
  }
  return data;
}

export async function declineContact(userId: string, requestId: string) {
  const { data, error } = await supabaseAdmin
    .from('contact_requests')
    .update({ status: 'declined' })
    .eq('id', requestId)
    .eq('recipient_id', userId)
    .eq('status', 'pending')
    .select('id,sender_id,recipient_id,status')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('REQUEST_NOT_FOUND');
  return data;
}

export async function cancelContactRequest(userId: string, requestId: string) {
  const { data, error } = await supabaseAdmin
    .from('contact_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('sender_id', userId)
    .eq('status', 'pending')
    .select('id,sender_id,recipient_id,status')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('REQUEST_NOT_FOUND');
  return data;
}

export async function removeContact(userId: string, contactId: string) {
  if (userId === contactId) throw new Error('SELF_CONTACT');
  const { error } = await supabaseAdmin
    .from('contacts')
    .delete()
    .or(`and(owner_id.eq.${userId},contact_id.eq.${contactId}),and(owner_id.eq.${contactId},contact_id.eq.${userId})`);
  if (error) throw error;
}

export async function setFavorite(userId: string, contactId: string, favorite: boolean) {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update({ favorite })
    .eq('owner_id', userId)
    .eq('contact_id', contactId)
    .select('contact_id,favorite')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('CONTACT_NOT_FOUND');
  return data;
}

export async function blockUser(userId: string, blockedId: string) {
  if (userId === blockedId) throw new Error('SELF_BLOCK');
  const { error } = await supabaseAdmin
    .from('blocks')
    .upsert({ blocker_id: userId, blocked_id: blockedId });
  if (error) throw error;

  const { error: contactDeleteError } = await supabaseAdmin
    .from('contacts')
    .delete()
    .or(`and(owner_id.eq.${userId},contact_id.eq.${blockedId}),and(owner_id.eq.${blockedId},contact_id.eq.${userId})`);
  if (contactDeleteError) throw contactDeleteError;

  const { error: requestCleanupError } = await supabaseAdmin
    .from('contact_requests')
    .update({ status: 'cancelled' })
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${blockedId}),and(sender_id.eq.${blockedId},recipient_id.eq.${userId})`)
    .eq('status', 'pending');
  if (requestCleanupError) throw requestCleanupError;
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
