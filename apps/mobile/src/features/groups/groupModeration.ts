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

export type GroupBanSummary = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannedBy: string;
  reason: string | null;
  bannedAt: string;
};

export type GroupBanListResponse = {
  ok: boolean;
  bans: GroupBanSummary[];
  error?: string;
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

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function normalizeGroupBanSummary(raw: unknown): GroupBanSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.userId !== 'string' || !value.userId) return null;
  if (typeof value.username !== 'string' || !value.username) return null;
  if (typeof value.displayName !== 'string' || !value.displayName) return null;
  if (value.avatarUrl !== null && typeof value.avatarUrl !== 'string') return null;
  if (typeof value.bannedBy !== 'string' || !value.bannedBy) return null;
  if (value.reason !== null && typeof value.reason !== 'string') return null;
  if (!isIsoDate(value.bannedAt)) return null;

  return {
    userId: value.userId,
    username: value.username,
    displayName: value.displayName,
    avatarUrl: value.avatarUrl as string | null,
    bannedBy: value.bannedBy,
    reason: value.reason as string | null,
    bannedAt: value.bannedAt,
  };
}

export function normalizeGroupBanListResponse(raw: unknown): GroupBanListResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.ok !== true) {
    if (value.ok !== false) return null;
    return {
      ok: false,
      bans: [],
      ...(typeof value.error === 'string' ? { error: value.error } : {}),
    };
  }
  if (!Array.isArray(value.bans) || value.bans.length > 200) return null;

  const bans: GroupBanSummary[] = [];
  for (const item of value.bans) {
    const normalized = normalizeGroupBanSummary(item);
    if (!normalized) return null;
    bans.push(normalized);
  }

  return { ok: true, bans };
}
