// End-to-end proof over the REAL socket wire + REAL server code:
// - Alice encrypts client-side (libsodium AEAD, simulating the mobile
//   CryptoProvider) BEFORE emitting message:send.
// - The server (createSocketServer) only ever touches ciphertext.
// - Bob receives message:new and decrypts client-side.
// - We assert the plaintext never appears in anything the server stored
//   or relayed.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import sodium from "libsodium-wrappers";
import { createSocketServer } from "../src/server.js";
import { getUndeliveredForConversation } from "../src/messageStore.js";

let httpServer: http.Server;
let port: number;

beforeAll(async () => {
  await sodium.ready;
  httpServer = http.createServer();
  createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(() => {
  httpServer.close();
});

function connect(userId: string, deviceId: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, { auth: { userId, deviceId } });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

describe("Alice/Bob real E2EE round-trip over the socket wire", () => {
  it("server never sees plaintext; Bob decrypts what Alice sent", async () => {
    const conversationId = "conv-alice-bob-1";
    const plaintext = "Salut Bob";

    const alice = await connect("alice", "alice-device-1");
    const bob = await connect("bob", "bob-device-1");
    alice.emit("conversation:join", { conversationId });
    bob.emit("conversation:join", { conversationId });
    await new Promise((r) => setTimeout(r, 50)); // let joins land

    // Alice encrypts client-side (real AEAD, mirrors mobile CryptoProvider).
    const key = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext, null, null, nonce, key
    );

    const bobReceived = new Promise<any>((resolve) => bob.once("message:new", resolve));

    const ackResult = await new Promise<any>((resolve) => {
      alice.emit(
        "message:send",
        {
          conversationId,
          clientMessageId: "cm-1",
          envelope: {
            ciphertext: sodium.to_base64(ciphertext),
            nonce: sodium.to_base64(nonce),
            senderDeviceId: "alice-device-1",
            protocolVersion: 0,
          },
        },
        resolve
      );
    });
    expect(ackResult.ok).toBe(true);

    const received = await bobReceived;
    expect(received.envelope.ciphertext).toBe(sodium.to_base64(ciphertext));

    // Bob decrypts client-side.
    const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      sodium.from_base64(received.envelope.ciphertext),
      null,
      sodium.from_base64(received.envelope.nonce),
      key
    );
    expect(sodium.to_string(decrypted)).toBe(plaintext);

    // Server-side storage: assert plaintext never appears anywhere.
    const stored = await getUndeliveredForConversation(conversationId);
    const storedJson = JSON.stringify(stored);
    expect(storedJson.includes(plaintext)).toBe(false);
    expect(storedJson).toContain(sodium.to_base64(ciphertext));

    alice.close();
    bob.close();
  });

  it("a message sent with a tampered ciphertext is relayed as-is but fails Bob's local decryption (server can't tell, doesn't need to)", async () => {
    const conversationId = "conv-alice-bob-2";
    const alice = await connect("alice2", "alice-device-2");
    const bob = await connect("bob2", "bob-device-2");
    alice.emit("conversation:join", { conversationId });
    bob.emit("conversation:join", { conversationId });
    await new Promise((r) => setTimeout(r, 50));

    const key = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt("hello", null, null, nonce, key);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0xff;

    const bobReceived = new Promise<any>((resolve) => bob.once("message:new", resolve));
    alice.emit("message:send", {
      conversationId,
      clientMessageId: "cm-2",
      envelope: {
        ciphertext: sodium.to_base64(tampered),
        nonce: sodium.to_base64(nonce),
        senderDeviceId: "alice-device-2",
        protocolVersion: 0,
      },
    }, () => undefined);

    const received = await bobReceived;
    expect(() =>
      sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, sodium.from_base64(received.envelope.ciphertext), null, sodium.from_base64(received.envelope.nonce), key
      )
    ).toThrow();

    alice.close();
    bob.close();
  });
});
