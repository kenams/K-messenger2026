export type PresenceStatus = 'online' | 'busy' | 'away' | 'invisible' | 'offline';

const LOGIN_EVENT_DEBOUNCE_MS = 30_000;

export class PresenceRuntime {
  private readonly socketsByUser = new Map<string, Set<string>>();
  private readonly lastLoginEventAt = new Map<string, number>();

  connect(userId: string, socketId: string): { firstSocket: boolean } {
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
    const firstSocket = sockets.size === 0;
    sockets.add(socketId);
    this.socketsByUser.set(userId, sockets);
    return { firstSocket };
  }

  disconnect(userId: string, socketId: string): { lastSocket: boolean } {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return { lastSocket: true };

    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.socketsByUser.delete(userId);
      return { lastSocket: true };
    }

    return { lastSocket: false };
  }

  hasConnections(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }

  shouldEmitLoginEvent(userId: string, now = Date.now()): boolean {
    const previous = this.lastLoginEventAt.get(userId) ?? 0;
    if (now - previous < LOGIN_EVENT_DEBOUNCE_MS) return false;
    this.lastLoginEventAt.set(userId, now);
    return true;
  }
}

export function visiblePresence(status: PresenceStatus): Exclude<PresenceStatus, 'invisible'> {
  return status === 'invisible' ? 'offline' : status;
}
