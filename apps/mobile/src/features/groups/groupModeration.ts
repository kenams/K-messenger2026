export type GroupRole = 'member' | 'admin' | 'owner';

export type GroupMemberModerationTarget = {
  userId: string;
  role: GroupRole;
};

export type GroupModerationCapabilities = {
  canMute: boolean;
  canBan: boolean;
};

export type GroupModerationEvent = {
  conversationId: string;
  userId: string;
  action: 'muted' | 'unmuted' | 'banned';
  mutedUntil?: string | null;
};

export function getGroupModerationCapabilities(
  actorUserId: string,
  actorRole: GroupRole,
  target: GroupMemberModerationTarget,
): GroupModerationCapabilities {
  if (!actorUserId || actorUserId === target.userId) return { canMute: false, canBan: false };
  if (target.role === 'owner') return { canMute: false, canBan: false };

  if (actorRole === 'owner') {
    return { canMute: true, canBan: true };
  }

  if (actorRole === 'admin' && target.role === 'member') {
    return { canMute: true, canBan: true };
  }

  return { canMute: false, canBan: false };
}

export function buildOneHourMutePayload(conversationId: string, userId: string, now = new Date()) {
  return {
    conversationId,
    userId,
    mutedUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  };
}

export function buildUnmutePayload(conversationId: string, userId: string) {
  return {
    conversationId,
    userId,
    mutedUntil: null,
  };
}

export function buildBanPayload(conversationId: string, userId: string, reason?: string) {
  const normalizedReason = reason?.trim();
  return {
    conversationId,
    userId,
    ...(normalizedReason ? { reason: normalizedReason.slice(0, 240) } : {}),
  };
}

export function buildUnbanPayload(conversationId: string, userId: string) {
  return { conversationId, userId };
}

export function normalizeGroupModerationEvent(raw: unknown): GroupModerationEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.conversationId !== 'string' || typeof value.userId !== 'string') return null;
  if (value.action !== 'muted' && value.action !== 'unmuted' && value.action !== 'banned') return null;
  if (value.mutedUntil !== undefined && value.mutedUntil !== null && typeof value.mutedUntil !== 'string') return null;
  return {
    conversationId: value.conversationId,
    userId: value.userId,
    action: value.action,
    mutedUntil: value.mutedUntil as string | null | undefined,
  };
}
