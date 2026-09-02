import React, { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Vibration,
  Platform,
  Animated,
  KeyboardAvoidingView,
} from "react-native";
import { io } from "socket.io-client";
import {
  legacyDeriveKeyFromPassphrase,
  legacyEncryptText,
  legacyDecryptText,
} from "./src/crypto/legacyAes";

// ⚠️ Chat de démo legacy (AES partagé) — voir docs/CRYPTO_DECISION.md.
// Sera remplacé par la vraie session E2EE par device en Phase E.
// SERVER_URL sera lu depuis la config d'environnement une fois le
// backend réel créé (Phase D) ; laissé en placeholder LAN pour l'instant,
// il n'y a de toute façon aucun serveur à joindre tant que Phase D
// n'est pas commencée.
const SERVER_URL = "http://192.168.1.100:3000";

export default function App() {
  const socketRef = useRef(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("");
  const [status, setStatus] = useState("online");
  const [passphrase, setPassphrase] = useState("");
  const [cryptoKey, setCryptoKey] = useState(null);

  const [meNickname, setMeNickname] = useState(null);
  const [users, setUsers] = useState([]);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const [toast, setToast] = useState("");
  const toastRef = useRef(null);

  // ---------- Helpers ----------

  const showToast = (text) => {
    setToast(text);
    if (toastRef.current) {
      clearTimeout(toastRef.current);
    }
    toastRef.current = setTimeout(() => setToast(""), 2500);
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const statusLabel = (s) => {
    switch (s) {
      case "online":
        return "En ligne";
      case "busy":
        return "Occupé";
      case "away":
        return "Absent";
      case "invisible":
        return "Invisible";
      default:
        return s || "";
    }
  };

  const triggerNudge = (from) => {
    Vibration.vibrate(200);
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
    showToast(`Nudge de ${from}`);
  };

  // ---------- Crypto AES (legacy — voir src/crypto/legacyAes.js) ----------

  const decryptIfNeeded = (msg) => {
    if (msg.system) return msg.text || "";
    if (!msg.cipherText || !msg.iv) return msg.text || "";
    if (!cryptoKey) return "🔒 Message chiffré (aucune clé définie)";
    try {
      return legacyDecryptText(msg.cipherText, msg.iv, cryptoKey);
    } catch {
      return "🔒 Message chiffré (clé incorrecte)";
    }
  };

  // ---------- Socket.io ----------

  useEffect(() => {
    const s = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = s;

    s.on("connect_error", (err) => {
      console.log("Socket connect_error:", err.message);
      showToast("Connexion serveur impossible");
    });

    s.on("nicknameOk", ({ nickname, users }) => {
      setMeNickname(nickname);
      showToast(`Connecté en tant que ${nickname}`);
      setUsers(users || []);
    });

    s.on("nicknameError", (msg) => showToast(msg));
    s.on("userList", (users) => setUsers(users || []));

    s.on("message", (msg) => {
      const text = decryptIfNeeded(msg);
      setMessages((prev) => [...prev, { ...msg, text }]);
    });

    s.on("nudge", (payload) => triggerNudge(payload.from));

    return () => {
      s.disconnect();
    };
  }, [cryptoKey, meNickname]);

  // ---------- Actions ----------

  const handleSetKey = () => {
    if (!passphrase.trim()) {
      showToast("Entre une clé secrète");
      return;
    }
    try {
      const key = legacyDeriveKeyFromPassphrase(passphrase.trim());
      setCryptoKey(key);
      showToast("Clé de chiffrement définie ✅");
    } catch {
      showToast("Erreur chiffrement");
    }
  };

  const handleConnect = () => {
    if (!nickname.trim()) {
      showToast("Choisis un pseudo d'abord.");
      return;
    }
    const avatarEmoji = (avatar.trim() || "😀").slice(0, 2);
    socketRef.current?.emit("setNickname", {
      nickname: nickname.trim(),
      status,
      avatarEmoji,
    });
  };

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    if (meNickname) {
      socketRef.current?.emit("updateStatus", newStatus);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (!meNickname) {
      showToast("Connecte-toi d'abord.");
      return;
    }
    if (!cryptoKey) {
      showToast("Définis une clé secrète avant d'envoyer.");
      return;
    }
    try {
      const encrypted = legacyEncryptText(text, cryptoKey);
      socketRef.current?.emit("sendMessage", encrypted);
      setInput("");
    } catch {
      showToast("Erreur de chiffrement");
    }
  };

  const handleNudgeGlobal = () => {
    if (!meNickname) {
      showToast("Connecte-toi d'abord.");
      return;
    }
    socketRef.current?.emit("sendNudge", null);
  };

  // ---------- Renders ----------

  const renderMessageItem = ({ item }) => {
    const system = item.system;
    const isMe = item.from === meNickname;
    const color = system ? "#eab308" : item.color || "#e5e7eb";
    return (
      <View
        style={[
          styles.messageRow,
          system && styles.messageSystem,
          !system && { borderLeftWidth: 3, borderLeftColor: color },
        ]}
      >
        <Text style={[styles.messageAuthor, { color }]}>
          {system ? item.from : isMe ? "Moi" : item.from}
        </Text>
        <Text style={styles.messageText}>{item.text}</Text>
        <Text style={styles.messageTime}>{formatTime(item.time)}</Text>
      </View>
    );
  };

  const renderUserItem = ({ item }) => {
    const isMe = item.nickname === meNickname;
    const isInvisible = item.status === "invisible" && !isMe;
    return (
      <View style={[styles.userRow, isInvisible && { opacity: 0.5 }]}>
        <Text style={styles.userAvatar}>{item.avatarEmoji || "😀"}</Text>
        <View style={styles.userMain}>
          <Text style={[styles.userName, { color: item.color || "#e5e7eb" }]}>
            {item.nickname}
            {isMe ? " (toi)" : ""}
          </Text>
          <Text style={styles.userStatus}>{statusLabel(item.status)}</Text>
        </View>
        <View
          style={[
            styles.statusDot,
            item.status === "online" && styles.statusOnline,
            item.status === "busy" && styles.statusBusy,
            item.status === "away" && styles.statusAway,
            item.status === "invisible" && styles.statusInvisible,
          ]}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          style={[styles.appContainer, { transform: [{ translateX: shakeAnim }] }]}
        >
          <View style={styles.inner}>
            {/* HEADER */}
            <View style={styles.header}>
              <Text style={styles.logo}>K-ssenger</Text>
              <View style={styles.nicknameArea}>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.inputSmall, styles.flex1, { maxWidth: 70 }]}
                    placeholder="😀"
                    placeholderTextColor="#9ca3af"
                    value={avatar}
                    onChangeText={setAvatar}
                  />
                  <TextInput
                    style={[styles.inputSmall, styles.flex3]}
                    placeholder="Pseudo"
                    placeholderTextColor="#9ca3af"
                    value={nickname}
                    onChangeText={setNickname}
                    autoCapitalize="none"
                  />
                </View>

                <View style={[styles.row, { marginTop: 4 }]}>
                  <View style={styles.statusPickerRow}>
                    {["online", "busy", "away", "invisible"].map((s) => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => handleStatusChange(s)}
                        style={[
                          styles.statusButton,
                          status === s && styles.statusButtonActive,
                        ]}
                      >
                        <Text style={styles.statusButtonText}>
                          {s === "online" && "✅"}
                          {s === "busy" && "⛔"}
                          {s === "away" && "⏳"}
                          {s === "invisible" && "👻"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.row, { marginTop: 4 }]}>
                  <TextInput
                    style={[styles.inputSmall, styles.flex3]}
                    placeholder="Clé secrète (même pour tes potes)"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry
                    value={passphrase}
                    onChangeText={setPassphrase}
                  />
                </View>

                <View style={[styles.row, { marginTop: 4 }]}>
                  <TouchableOpacity style={[styles.keyButton, styles.flex1]} onPress={handleSetKey}>
                    <Text style={styles.keyButtonText}>Chiffre</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.connectButton, styles.flex1]}
                    onPress={handleConnect}
                  >
                    <Text style={styles.connectButtonText}>
                      {meNickname ? "Connecté" : "Connexion"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* CONTACTS */}
            <View style={styles.contactsBlock}>
              <Text style={styles.sectionTitle}>Contacts en ligne</Text>
              <View style={styles.contactsListWrapper}>
                <FlatList
                  data={users}
                  keyExtractor={(item) => item.nickname}
                  renderItem={renderUserItem}
                />
              </View>
            </View>

            {/* CHAT GLOBAL */}
            <View style={styles.chatBlock}>
              <Text style={styles.sectionTitle}>Discussion générale</Text>
              <View style={styles.messagesWrapper}>
                <FlatList
                  data={messages}
                  keyExtractor={(_, i) => String(i)}
                  renderItem={renderMessageItem}
                />
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputChat}
                  placeholder="Écris un message..."
                  placeholderTextColor="#9ca3af"
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={styles.nudgeButton}
                  onPress={handleNudgeGlobal}
                >
                  <Text style={styles.nudgeButtonText}>Nudge</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
                  <Text style={styles.sendButtonText}>Env.</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Toast */}
          {toast ? (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#020617" },
  appContainer: {
    flex: 1,
    margin: 10,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  inner: {
    flex: 1,
  },

  header: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
    backgroundColor: "#111827",
  },
  logo: {
    color: "#e5e7eb",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  nicknameArea: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  flex1: { flex: 1 },
  flex3: { flex: 3 },
  inputSmall: {
    backgroundColor: "#1f2937",
    color: "#e5e7eb",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 6 : 4,
    fontSize: 12,
    marginLeft: 4,
  },
  statusPickerRow: {
    flexDirection: "row",
    backgroundColor: "#1f2937",
    borderRadius: 999,
    paddingHorizontal: 4,
    marginLeft: 4,
  },
  statusButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusButtonActive: {
    backgroundColor: "#0ea5e9",
  },
  statusButtonText: {
    fontSize: 12,
    color: "#e5e7eb",
  },
  keyButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#0ea5e9",
    marginLeft: 4,
  },
  keyButtonText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  connectButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#22c55e",
    marginLeft: 4,
  },
  connectButtonText: {
    color: "#052e16",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  // Contacts
  contactsBlock: {
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  sectionTitle: {
    color: "#e5e7eb",
    fontSize: 14,
    marginBottom: 4,
  },
  contactsListWrapper: {
    maxHeight: 90,
    borderRadius: 10,
    backgroundColor: "#020617",
    paddingVertical: 4,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 2,
  },
  userAvatar: { fontSize: 18, marginRight: 6 },
  userMain: { flex: 1 },
  userName: { fontSize: 13, fontWeight: "600" },
  userStatus: { fontSize: 11, color: "#9ca3af" },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  statusOnline: { backgroundColor: "#22c55e" },
  statusBusy: { backgroundColor: "#ef4444" },
  statusAway: { backgroundColor: "#eab308" },
  statusInvisible: { backgroundColor: "#6b7280" },

  // Chat
  chatBlock: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  messagesWrapper: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#020617",
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginBottom: 6,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  messageSystem: { borderLeftWidth: 0 },
  messageAuthor: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 4,
  },
  messageText: { flex: 1, fontSize: 13, color: "#e5e7eb" },
  messageTime: { fontSize: 11, color: "#9ca3af", marginLeft: 4 },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputChat: {
    flex: 1,
    backgroundColor: "#111827",
    color: "#e5e7eb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    fontSize: 13,
    marginRight: 4,
  },
  sendButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#0ea5e9",
    marginLeft: 2,
  },
  sendButtonText: {
    color: "#0f172a",
    fontWeight: "600",
    fontSize: 12,
  },
  nudgeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f97316",
    marginLeft: 2,
  },
  nudgeButtonText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 12,
  },

  // Toast
  toast: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  toastText: {
    backgroundColor: "#020617",
    color: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
  },
});
