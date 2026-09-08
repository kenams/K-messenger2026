import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Contact } from '../contacts/MsnContactsScreen';
import type { RelayChatMessage } from '../../lib/deviceLink';
import type { UseWebLink } from '../../lib/deviceLinkClient';
import { presenceLabel } from '../../theme/tokens';
import { elevation, layout, palette, radius, spacing, type as typo } from '../../theme/tokens';

type Row = RelayChatMessage & { mine: boolean; pending?: boolean };

/**
 * Web conversation that runs entirely through the linked phone. This screen
 * never touches Signal keys: it hands plaintext to the phone over the device
 * tunnel and renders what the phone relays back.
 */
export function WebRelayConversationScreen({
  contact,
  webLink,
  currentUserId,
  onBack,
}: {
  contact: Contact;
  webLink: UseWebLink;
  currentUserId: string;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotice('');
    void webLink.fetchHistory(contact.id)
      .then((messages) => {
        if (!active) return;
        setRows(messages.map((m) => ({ ...m, mine: m.senderUserId === currentUserId })));
      })
      .catch(() => { if (active) setNotice('Téléphone injoignable — impossible de charger l’historique.'); })
      .finally(() => { if (active) setLoading(false); });

    const off = webLink.onIncoming((contactId, message) => {
      if (contactId !== contact.id) return;
      setRows((prev) => (prev.some((r) => r.id === message.id) ? prev : [...prev, { ...message, mine: message.senderUserId === currentUserId }]));
    });
    return () => { active = false; off(); };
  }, [contact.id, currentUserId, webLink]);

  const send = async () => {
    const text = composer.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice('');
    const tempId = `tmp-${Date.now()}`;
    setRows((prev) => [...prev, { id: tempId, senderUserId: currentUserId, createdAt: new Date().toISOString(), text, mine: true, pending: true }]);
    setComposer('');
    try {
      const sent = await webLink.sendText(contact.id, text);
      setRows((prev) => prev.map((r) => (r.id === tempId ? { ...r, id: sent.id, createdAt: sent.createdAt, pending: false } : r)));
    } catch {
      setRows((prev) => prev.filter((r) => r.id !== tempId));
      setNotice('Envoi impossible. Le message n’a pas quitté ton téléphone.');
      setComposer(text);
    } finally {
      setSending(false);
    }
  };

  const disabled = !webLink.phoneReachable || sending;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View style={styles.avatar}><Text style={styles.avatarText}>{contact.displayName[0] ?? '?'}</Text></View>
        <View style={styles.flex}>
          <Text style={styles.name}>{contact.nickname}</Text>
          <Text style={styles.sub}>{contact.handle} · {presenceLabel[contact.presence] ?? contact.presence}</Text>
        </View>
      </View>
      <View style={[styles.relayBar, webLink.phoneReachable ? styles.relayOk : styles.relayWait]}>
        <Text style={styles.relayText}>
          {webLink.phoneReachable
            ? '🔗 Relayé et chiffré par ton téléphone (Signal). Le web ne voit aucune clé.'
            : '⏳ En attente de ton téléphone… garde l’app K-ssenger ouverte dessus.'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={palette.azure} /><Text style={styles.muted}>Chargement depuis le téléphone…</Text></View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          contentContainerStyle={styles.content}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          {!rows.length ? (
            <View style={styles.empty}><Text style={styles.emptyIcon}>💬</Text><Text style={styles.emptyTitle}>Conversation prête</Text><Text style={styles.muted}>Ton premier message partira chiffré via le téléphone.</Text></View>
          ) : rows.map((row) => (
            <View key={row.id} style={[styles.bubble, row.mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleText, row.mine && styles.bubbleTextMine]}>{row.text}</Text>
              <Text style={[styles.meta, row.mine && styles.metaMine]}>
                {new Date(row.createdAt).toLocaleTimeString()}{row.pending ? ' · …' : ''}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={composer}
          onChangeText={setComposer}
          placeholder={webLink.phoneReachable ? 'Écrire un message…' : 'Téléphone hors ligne'}
          placeholderTextColor={palette.inkFaint}
          maxLength={12000}
          multiline
          editable={!disabled}
          onSubmitEditing={() => void send()}
        />
        <TouchableOpacity disabled={disabled || !composer.trim()} onPress={() => void send()} style={[styles.send, (disabled || !composer.trim()) && styles.sendOff]}>
          {sending ? <ActivityIndicator color={palette.white} /> : <Text style={styles.sendText}>➤</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky }, flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  back: { fontSize: 30, lineHeight: 30, color: palette.azureDeep, fontWeight: '900', width: 30, textAlign: 'center' },
  avatar: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: palette.azureSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.azureDeep, fontSize: 17, fontWeight: '900' },
  name: { ...typo.name }, sub: { ...typo.micro, color: palette.inkSoft, marginTop: 2 },
  relayBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  relayOk: { backgroundColor: palette.successSoft }, relayWait: { backgroundColor: palette.wizzSoft },
  relayText: { ...typo.micro, color: palette.inkSoft, textAlign: 'center', lineHeight: 14 },
  body: { flex: 1 }, content: { padding: spacing.lg, paddingBottom: spacing.xl, maxWidth: layout.maxReading, alignSelf: 'center', width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  notice: { color: palette.danger, fontWeight: '700', marginBottom: spacing.sm, textAlign: 'center', fontSize: 12 },
  empty: { alignItems: 'center', marginTop: 70, gap: spacing.xs }, emptyIcon: { fontSize: 40 }, emptyTitle: { ...typo.heading }, muted: { ...typo.meta, color: palette.inkFaint },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginBottom: spacing.sm },
  mine: { backgroundColor: palette.azure, alignSelf: 'flex-end', borderBottomRightRadius: 6, ...elevation.hairline },
  theirs: { backgroundColor: palette.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 6, borderWidth: 1, borderColor: palette.hairline, ...elevation.hairline },
  bubbleText: { ...typo.body }, bubbleTextMine: { color: palette.inkOnAzure },
  meta: { fontSize: 9.5, marginTop: 5, textAlign: 'right', color: palette.inkFaint, fontWeight: '600' },
  metaMine: { color: 'rgba(244,248,255,0.75)' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.sm + 2, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.hairline },
  input: { flex: 1, maxHeight: 120, minHeight: 46, backgroundColor: palette.surfaceSunken, borderWidth: 1.5, borderColor: palette.hairline, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: palette.ink, fontSize: 15, fontWeight: '500', ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null) },
  send: { width: 46, height: 46, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure, ...elevation.hairline },
  sendOff: { opacity: 0.4 }, sendText: { color: palette.white, fontWeight: '900', fontSize: 18 },
});
