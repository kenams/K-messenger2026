import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { emitAck, getRealtimeSocket } from '../../lib/realtime';
import { approvePendingLink, linkConfirmationCode } from '../../lib/deviceLinkClient';
import { elevation, layout, palette, radius, spacing, type as typo } from '../../theme/tokens';

type LinkRow = { id: string; status: 'pending' | 'approved' | 'revoked'; created_at: string; approved_at: string | null };

export function LinkedDevicesScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [codeInput, setCodeInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await getBackend()
      .from('device_links')
      .select('id,status,created_at,approved_at')
      .eq('user_id', userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false });
    if (!error) setRows(((data ?? []) as unknown) as LinkRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
    let sock: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;
    void getRealtimeSocket().then((s) => {
      sock = s;
      s.on('link:pending', () => void load());
      s.on('link:approved', () => void load());
      s.on('link:revoked', () => void load());
    }).catch(() => undefined);
    return () => {
      sock?.off('link:pending');
      sock?.off('link:approved');
      sock?.off('link:revoked');
    };
  }, [load]);

  const approve = async () => {
    const code = codeInput.trim();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const match = rows.find((r) => r.status === 'pending' && linkConfirmationCode(r.id) === code);
      if (!match) throw new Error('NO_MATCH');
      await approvePendingLink(match.id);
      setCodeInput('');
      setNotice('Navigateur lié. Il peut maintenant discuter via ce téléphone.');
      await load();
    } catch (e) {
      setNotice((e as Error).message === 'NO_MATCH'
        ? 'Aucune demande ne correspond à ce code. Relance l’appairage sur le navigateur.'
        : 'Impossible de lier ce navigateur. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (linkId: string) => {
    try {
      const sock = await getRealtimeSocket();
      await emitAck(sock, 'link:revoke', { linkId });
      await load();
    } catch { setNotice('Révocation impossible hors ligne.'); }
  };

  const approved = rows.filter((r) => r.status === 'approved');
  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <TouchableOpacity style={styles.back} onPress={onBack} accessibilityRole="button"><Text style={styles.backText}>‹ Retour au profil</Text></TouchableOpacity>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>APPAREILS LIÉS</Text>
        <Text style={styles.title}>K-ssenger sur le web</Text>
        <Text style={styles.lede}>Ton téléphone reste le seul à détenir les clés de chiffrement. Un navigateur lié te laisse discuter depuis un ordinateur ; il passe par ce téléphone pour tout chiffrer.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lier un navigateur</Text>
          <Text style={styles.cardHint}>Ouvre k-ssenger.expo.app, va sur « Lier mon téléphone », puis entre le code à 6 chiffres affiché.</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={(v) => setCodeInput(v.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={palette.inkFaint}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TouchableOpacity onPress={() => void approve()} disabled={codeInput.length !== 6 || busy} style={[styles.approve, (codeInput.length !== 6 || busy) && styles.approveOff]}>
              {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.approveText}>Lier</Text>}
            </TouchableOpacity>
          </View>
          {pending.length > 0 && <Text style={styles.pendingHint}>{pending.length} demande(s) en attente.</Text>}
        </View>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        <Text style={styles.sectionLabel}>Navigateurs actifs</Text>
        {loading ? <ActivityIndicator color={palette.azure} style={{ marginTop: spacing.md }} /> : approved.length === 0 ? (
          <Text style={styles.empty}>Aucun navigateur lié.</Text>
        ) : approved.map((row) => (
          <View key={row.id} style={styles.linkRow}>
            <View style={styles.flex}>
              <Text style={styles.linkName}>🖥️ Navigateur web</Text>
              <Text style={styles.linkMeta}>Lié le {row.approved_at ? new Date(row.approved_at).toLocaleDateString() : '—'}</Text>
            </View>
            <TouchableOpacity onPress={() => void revoke(row.id)} style={styles.revoke}><Text style={styles.revokeText}>Délier</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky },
  back: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  backText: { color: palette.azureDeep, fontWeight: '900' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, maxWidth: layout.maxContent, alignSelf: 'center', width: '100%' },
  kicker: { ...typo.brand },
  title: { marginTop: spacing.xs, ...typo.title },
  lede: { marginTop: spacing.sm, ...typo.body, color: palette.inkSoft },
  card: { marginTop: spacing.xl, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.hairline, padding: spacing.lg, ...elevation.card },
  cardTitle: { ...typo.heading },
  cardHint: { marginTop: spacing.xs, ...typo.meta, color: palette.inkSoft },
  codeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  codeInput: { flex: 1, backgroundColor: palette.surfaceSunken, borderWidth: 1.5, borderColor: palette.hairline, borderRadius: radius.md, paddingVertical: spacing.md, textAlign: 'center', fontSize: 22, fontWeight: '900', letterSpacing: 6, color: palette.ink },
  approve: { paddingHorizontal: spacing.xl, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure },
  approveOff: { opacity: 0.4 },
  approveText: { color: palette.white, fontWeight: '900' },
  pendingHint: { marginTop: spacing.sm, ...typo.micro, color: palette.azureDeep },
  notice: { marginTop: spacing.md, ...typo.meta, color: palette.inkSoft, textAlign: 'center' },
  sectionLabel: { marginTop: spacing.xl, ...typo.label, textTransform: 'uppercase' },
  empty: { marginTop: spacing.sm, ...typo.meta, color: palette.inkFaint },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.hairline, padding: spacing.md },
  flex: { flex: 1 },
  linkName: { ...typo.name },
  linkMeta: { ...typo.micro, color: palette.inkFaint, marginTop: 2 },
  revoke: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.danger, backgroundColor: palette.dangerSoft },
  revokeText: { color: palette.danger, fontWeight: '900', fontSize: 11 },
});
