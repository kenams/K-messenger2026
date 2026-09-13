import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from './config.js';

/**
 * K-Live: one ad-hoc LiveKit room per broadcaster, named after their user id.
 * No persistence — the room exists only while LiveKit has active
 * participants and is torn down (or simply expires) once everyone leaves.
 * Contacts are notified over the existing realtime socket, same pattern as
 * K-Pulse.
 */

export const isLiveConfigured = !!(config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET);

function roomService(): RoomServiceClient {
  if (!isLiveConfigured) throw new Error('LIVE_NOT_CONFIGURED');
  const httpUrl = config.LIVEKIT_URL!.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  return new RoomServiceClient(httpUrl, config.LIVEKIT_API_KEY!, config.LIVEKIT_API_SECRET!);
}

export function liveRoomName(broadcasterId: string): string {
  return `live:${broadcasterId}`;
}

export async function mintLiveToken(params: {
  userId: string;
  displayName: string;
  broadcasterId: string;
  publish: boolean;
}): Promise<string> {
  if (!isLiveConfigured) throw new Error('LIVE_NOT_CONFIGURED');
  const at = new AccessToken(config.LIVEKIT_API_KEY!, config.LIVEKIT_API_SECRET!, {
    identity: params.userId,
    name: params.displayName,
    ttl: '4h',
  });
  at.addGrant({
    room: liveRoomName(params.broadcasterId),
    roomJoin: true,
    canPublish: params.publish,
    canPublishData: true,
    canSubscribe: true,
    // Only the broadcaster may (re)create the room implicitly by publishing;
    // viewers joining before the broadcaster is live get a token but no room
    // to join yet, and their client shows "pas encore en direct".
    roomCreate: params.publish,
  });
  return at.toJwt();
}

export async function endLiveRoom(broadcasterId: string): Promise<void> {
  if (!isLiveConfigured) return;
  await roomService().deleteRoom(liveRoomName(broadcasterId)).catch(() => {
    /* room already gone — not an error */
  });
}
