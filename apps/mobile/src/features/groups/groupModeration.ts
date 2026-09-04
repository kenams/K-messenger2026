export type GroupRole = 'member' | 'admin' | 'owner';

export type GroupMemberModerationTarget = {
  userId: string;
  role: GroupRole;
};

export type GroupModerationCapabilities = {
  canMute: boolean;
  canBan: boolean;
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
