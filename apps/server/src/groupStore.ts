import { supabaseAdmin } from './supabase.js';

export async function createGroup(ownerId: string, title: string, memberIds: string[]) {
  if (memberIds.includes(ownerId)) throw new Error('OWNER_DUPLICATED_IN_MEMBERS');

  const { data: contacts, error: contactsError } = await supabaseAdmin
    .from('contacts')
    .select('contact_id')
    .eq('owner_id', ownerId)
    .in('contact_id', memberIds);
  if (contactsError) throw new Error('GROUP_CONTACT_CHECK_FAILED');

  const contactSet = new Set((contacts ?? []).map((row) => row.contact_id));
  if (memberIds.some((id) => !contactSet.has(id))) throw new Error('GROUP_MEMBERS_MUST_BE_CONTACTS');

  const { data: outgoingBlocks, error: outgoingBlockError } = await supabaseAdmin
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', ownerId)
    .in('blocked_id', memberIds);
  if (outgoingBlockError) throw new Error('GROUP_BLOCK_CHECK_FAILED');
  if ((outgoingBlocks ?? []).length > 0) throw new Error('GROUP_MEMBER_BLOCKED');

  const { data: incomingBlocks, error: incomingBlockError } = await supabaseAdmin
    .from('blocks')
    .select('blocker_id')
    .eq('blocked_id', ownerId)
    .in('blocker_id', memberIds);
  if (incomingBlockError) throw new Error('GROUP_BLOCK_CHECK_FAILED');
  if ((incomingBlocks ?? []).length > 0) throw new Error('GROUP_MEMBER_BLOCKED');

  const { data, error } = await supabaseAdmin.rpc('create_group_conversation', {
    p_owner_id: ownerId,
    p_title: title,
    p_member_ids: memberIds,
  });
  if (error || !data) throw new Error('GROUP_CREATE_FAILED');

  return { conversationId: data as string, title, memberIds };
}
