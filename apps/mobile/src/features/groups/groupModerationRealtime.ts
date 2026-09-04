import { emitAck, getRealtimeSocket } from '../../lib/realtime';
import {
  buildBanPayload,
  buildOneHourMutePayload,
  buildUnbanPayload,
  buildUnmutePayload,
  normalizeGroupBanListResponse,
  type GroupBanSummary,
} from './groupModeration';

type MutationAck = {
  ok?: boolean;
  error?: string;
};

function requireSuccessfulAck(raw: unknown): void {
  if (!raw || typeof raw !== 'object') throw new Error('GROUP_MODERATION_INVALID_RESPONSE');
  const value = raw as MutationAck;
  if (value.ok === true) return;
  if (value.error === 'RATE_LIMITED') throw new Error('GROUP_MODERATION_RATE_LIMITED');
  throw new Error('GROUP_MODERATION_REJECTED');
}

export async function listGroupBansRealtime(conversationId: string): Promise<GroupBanSummary[]> {
  const socket = await getRealtimeSocket();
  const raw = await emitAck<unknown>(socket, 'group:bans-list', { conversationId });
  const parsed = normalizeGroupBanListResponse(raw);
  if (!parsed) throw new Error('GROUP_BAN_LIST_INVALID_RESPONSE');
  if (!parsed.ok) {
    if (parsed.error === 'RATE_LIMITED') throw new Error('GROUP_BAN_LIST_RATE_LIMITED');
    throw new Error('GROUP_BAN_LIST_REJECTED');
  }
  return parsed.bans;
}

export async function muteGroupMemberOneHour(conversationId: string, userId: string): Promise<void> {
  const socket = await getRealtimeSocket();
  const raw = await emitAck<unknown>(socket, 'group:mute', buildOneHourMutePayload(conversationId, userId));
  requireSuccessfulAck(raw);
}

export async function unmuteGroupMember(conversationId: string, userId: string): Promise<void> {
  const socket = await getRealtimeSocket();
  const raw = await emitAck<unknown>(socket, 'group:mute', buildUnmutePayload(conversationId, userId));
  requireSuccessfulAck(raw);
}

export async function banGroupMemberRealtime(conversationId: string, userId: string, reason?: string): Promise<void> {
  const socket = await getRealtimeSocket();
  const raw = await emitAck<unknown>(socket, 'group:ban', buildBanPayload(conversationId, userId, reason));
  requireSuccessfulAck(raw);
}

export async function unbanGroupMemberRealtime(conversationId: string, userId: string): Promise<void> {
  const socket = await getRealtimeSocket();
  const raw = await emitAck<unknown>(socket, 'group:unban', buildUnbanPayload(conversationId, userId));
  requireSuccessfulAck(raw);
}
