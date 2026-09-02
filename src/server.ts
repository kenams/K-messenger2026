import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import {
  MessageAck,
  MessageSend,
  NudgeSend,
  PresenceUpdate,
  TypingEvent,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "./events.js";
import { checkNudgeAllowed } from "./nudgeRateLimit.js";
import { saveMessage, setMessageState } from "./messageStore.js";
import { env } from "./env.js";

// Auth handshake: expects { userId, deviceId } set by a verified session
// upstream (Phase D auth work — placeholder identity for now, NOT a real
// auth boundary yet). Blocking connections with no identity at all so the
// event handlers can assume socket.data is populated.
interface SocketData {
  userId: string;
  deviceId: string;
}

const blockedPairs = new Set<string>(); // `${blockerId}:${blockedId}` — placeholder, no backend yet

export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  io.use((socket, next) => {
    const { userId, deviceId } = socket.handshake.auth ?? {};
    if (typeof userId !== "string" || !userId || typeof deviceId !== "string" || !deviceId) {
      next(new Error("unauthenticated"));
      return;
    }
    socket.data.userId = userId;
    socket.data.deviceId = deviceId;
    next();
  });

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) => {
    const { userId } = socket.data;
    socket.join(`user:${userId}`);
    io.emit("presence:online", { userId, status: "online" });

    socket.on("presence:update", (raw) => {
      const parsed = PresenceUpdate.safeParse(raw);
      if (!parsed.success) return socket.emit("error", { message: "invalid presence:update" });
      // "invisible" -> broadcast offline, keep the socket connected server-side.
      const broadcastStatus = parsed.data.status === "invisible" ? "offline" : parsed.data.status;
      io.emit("presence:online", { userId, status: broadcastStatus });
    });

    socket.on("conversation:join", ({ conversationId }) => {
      if (typeof conversationId === "string" && conversationId) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on("message:send", async (raw, ack) => {
      const parsed = MessageSend.safeParse(raw);
      if (!parsed.success) return ack({ ok: false, error: "invalid_envelope" });

      const messageId = randomUUID();
      try {
        await saveMessage({
          messageId,
          conversationId: parsed.data.conversationId,
          senderDeviceId: parsed.data.envelope.senderDeviceId,
          envelope: parsed.data.envelope,
          sentAt: Date.now(),
          state: "sent",
        });
      } catch (err) {
        return ack({ ok: false, error: "persist_failed" });
      }

      io.to(`conversation:${parsed.data.conversationId}`).emit("message:new", {
        messageId,
        conversationId: parsed.data.conversationId,
        senderDeviceId: parsed.data.envelope.senderDeviceId,
        envelope: parsed.data.envelope,
        sentAt: Date.now(),
      });
      ack({ ok: true, messageId });
    });

    socket.on("message:ack", async (raw) => {
      const parsed = MessageAck.safeParse(raw);
      if (!parsed.success) return;
      await setMessageState(parsed.data.messageId, parsed.data.state).catch(() => undefined);
      io.emit("message:ack", parsed.data);
    });

    socket.on("typing:start", (raw) => {
      const parsed = TypingEvent.safeParse(raw);
      if (!parsed.success) return;
      socket.to(`conversation:${parsed.data.conversationId}`).emit("typing:start", { ...parsed.data, fromUserId: userId });
    });

    socket.on("typing:stop", (raw) => {
      const parsed = TypingEvent.safeParse(raw);
      if (!parsed.success) return;
      socket.to(`conversation:${parsed.data.conversationId}`).emit("typing:stop", { ...parsed.data, fromUserId: userId });
    });

    socket.on("nudge:send", (raw, ack) => {
      const parsed = NudgeSend.safeParse(raw);
      if (!parsed.success) return ack({ ok: false, error: "invalid_nudge" });
      if (blockedPairs.has(`${parsed.data.conversationId}:${userId}`)) {
        return ack({ ok: false, error: "blocked" });
      }
      const rl = checkNudgeAllowed(userId, parsed.data.conversationId);
      if (!rl.allowed) return ack({ ok: false, error: rl.reason });

      socket.to(`conversation:${parsed.data.conversationId}`).emit("nudge:receive", {
        fromUserId: userId,
        kind: parsed.data.kind,
        conversationId: parsed.data.conversationId,
      });
      ack({ ok: true });
    });

    socket.on("disconnect", () => {
      io.emit("presence:online", { userId, status: "offline" });
    });
  });

  return io;
}
