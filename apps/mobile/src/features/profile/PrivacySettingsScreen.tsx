import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { ScreenHeader } from '../../theme/components';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';

type Visibility = 'everyone' | 'contacts' | 'nobody';
type KPulsePolicy = 'everyone' | 'contacts' | 'favorites' | 'nobody';
type LoginNotifications = 'all_contacts' | 'favorites' | 'nobody';
type BlockRow = { blocker_id: string; blocked_id: string; created_at?: string | null };

type PrivacySettings = {
  show_online: Visibility;
  show_music: Visibility;
  allow_wizz: KPulsePolicy;
  login_notifications: LoginNotifications;
  read_receipts: boolean;
};

const defaults: PrivacySettings = {
  show_online: 'contacts',
  show_music: 'contacts',
  allow_wizz: 'contacts',
  login_notifications: 'favorites',
  read_receipts: true,
};

const visibilityOptions: Array<{ value: Visibility; label: string }> = [
  { value: 'everyone', label: 'Tout le monde' },
  { value: 'contacts', label: 'Mes contacts' },
  { value: 'nobody', label: 'Personne' },
];

const pulseOptions: Array<{ value: KPulsePolicy; label: string }> = [
  { value: 'everyone', label: 'Tout le monde' },
  { value: 'contacts', label: 'Mes contacts' },
  { value: 'favorites', label: 'Favoris' },
  { value: 'nobody', label: 'Personne' },
];

const loginOptions: Array<{ value: LoginNotifications; label: string }> = [
  { value: 'all_contacts', label: 'Tous mes contacts' },
  { value: 'favorites', label: 'Favoris seulement' },
  { value: 'nobody', label: 'Aucune' },
];

export function PrivacySettingsScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [settings, setSettings] = useState<PrivacySettings>(defaults);
  const [exists, setExists] = useState(false);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const loadBlocks = async () => {
    const { data, error } = await getBackend()
      .from('blocks')
      .select('blocker_id,blocked_id,created_at')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error('BLOCKS_LOAD_FAILED');
    setBlocks((data ?? []) as BlockRow[]);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [{ data, error }] = await Promise.all([
          getBackend()
            .from('privacy_settings')
            .select('show_online,show_music,allow_wizz,login_notifications,read_receipts')
            .eq('user_id', userId)
            .maybeSingle(),
          loadBlocks(),
        ]);
        if (!active) return;
        if (error) {
          setNotice('Impossible de charger les réglages.');
          return;
        }
        if (data) {
          setSettings(data as PrivacySettings);
          setExists(true);
        }
      } catch {
        if (active) setNotice('Impossible de charger tous les réglages de confidentialité.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [userId]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setNotice('');
    try {
      const payload = { ...settings, updated_at: new Date().toISOString() };
      const result = exists
        ? await getBackend().from('privacy_settings').update(payload).eq('user_id', userId)
        : await getBackend().from('privacy_settings').insert({ user_id: userId, ...payload });
      if (result.error) {
        setNotice('Impossible d’enregistrer les réglages.');
        return;
      }
      setExists(true);
      setNotice('Confidentialité enregistrée.');
    } catch {
      setNotice('Impossible d’enregistrer les réglages.');
    } finally {
      setSaving(false);
    }
  };

  const unblock = async (blockedId: string) => {
    if (unblockingId) return;
    setUnblockingId(blockedId);
    setNotice('');
    try {
      const { error } = await getBackend()
        .from('blocks')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', blockedId);
      if (error) {
        setNotice('Impossible de débloquer cet utilisateur.');
        return;
      }
      await loadBlocks();
      setNotice('Utilisateur débloqué. Il ne redevient pas automatiquement un contact.');
    } catch {
      setNotice('Impossible de débloquer cet utilisateur.');
    } finally {
      setUnblockingId(null);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator /><Text style={styles.hint}>Chargement de ta confidentialité…</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScreenHeader title="Présence & confidentialité" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Garde le côté vivant des messageries d’époque sans perdre le contrôle sur ce que les autres voient.</Text>

        <ChoiceSection title="QUI VOIT QUE JE SUIS EN LIGNE ?" value={settings.show_online} options={visibilityOptions} onChange={(show_online) => setSettings((value) => ({ ...value, show_online }))} />
        <ChoiceSection title="QUI VOIT MA MUSIQUE ?" value={settings.show_music} options={visibilityOptions} onChange={(show_music) => setSettings((value) => ({ ...value, show_music }))} />
        <ChoiceSection title="QUI PEUT M’ENVOYER UN K-PULSE ?" value={settings.allow_wizz} options={pulseOptions} onChange={(allow_wizz) => setSettings((value) => ({ ...value, allow_wizz }))} />
        <ChoiceSection title="ALERTES DE CONNEXION" value={settings.login_notifications} options={loginOptions} onChange={(login_notifications) => setSettings((value) => ({ ...value, login_notifications }))} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCUSÉS DE LECTURE</Text>
          <TouchableOpacity style={styles.toggleRow} onPress={() => setSettings((value) => ({ ...value, read_receipts: !value.read_receipts }))}>
            <View style={styles.flex}><Text style={styles.optionLabel}>Afficher « lu » dans les chats</Text><Text style={styles.hint}>Désactivé, K-ssenger confirme seulement la réception ; le serveur applique ce choix aux chats directs et groupes.</Text></View>
            <Text style={styles.toggle}>{settings.read_receipts ? '🟢' : '⚪'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>UTILISATEURS BLOQUÉS</Text>
          <Text style={styles.hint}>Le blocage coupe les contacts, demandes, K-Pulse et les partages K-MAP concernés. Débloquer ne restaure jamais automatiquement la relation.</Text>
          {!blocks.length ? <Text style={styles.empty}>Aucun utilisateur bloqué.</Text> : blocks.map((block) => (
            <View key={block.blocked_id} style={styles.blockRow}>
              <View style={styles.flex}>
                <Text style={styles.blockLabel}>Utilisateur bloqué</Text>
                <Text style={styles.blockId}>ID {block.blocked_id.slice(0, 8)}…</Text>
              </View>
              <TouchableOpacity disabled={!!unblockingId} style={styles.unblock} onPress={() => void unblock(block.blocked_id)}>
                {unblockingId === block.blocked_id ? <ActivityIndicator /> : <Text style={styles.unblockText}>Débloquer</Text>}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        <TouchableOpacity disabled={saving} style={[styles.primary, saving && styles.disabled]} onPress={() => void save()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Enregistrer</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceSection<T extends string>({ title, value, options, onChange }: { title: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.options}>
        {options.map((option) => (
          <TouchableOpacity key={option.value} style={[styles.option, value === option.value && styles.optionActive]} onPress={() => onChange(option.value)}>
            <Text style={[styles.optionLabel, value === option.value && styles.optionLabelActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky }, flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl }, intro: { color: palette.inkSoft, lineHeight: 19, marginBottom: spacing.xs }, section: { marginTop: spacing.lg, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.lg, padding: spacing.md }, sectionTitle: { ...typo.label, textTransform: 'uppercase' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }, option: { borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: palette.sky }, optionActive: { borderColor: palette.azure, backgroundColor: palette.azureSoft }, optionLabel: { color: palette.inkSoft, fontSize: 11, fontWeight: '800' }, optionLabelActive: { color: palette.azureDeep }, toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm }, toggle: { fontSize: 22 }, hint: { ...typo.micro, fontWeight: '500', lineHeight: 14, marginTop: 3 }, notice: { color: palette.azureDeep, marginTop: spacing.lg, fontWeight: '800' }, primary: { minHeight: 48, marginTop: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure, borderRadius: radius.lg }, primaryText: { color: palette.white, fontWeight: '900' }, disabled: { opacity: 0.5 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: palette.hairlineSoft, paddingVertical: spacing.sm, marginTop: spacing.sm }, blockLabel: { color: palette.ink, fontWeight: '800', fontSize: 12 }, blockId: { ...typo.micro, fontWeight: '500', marginTop: 2 }, unblock: { borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.sky, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 82, alignItems: 'center' }, unblockText: { color: palette.azureDeep, fontSize: 10, fontWeight: '900' }, empty: { color: palette.inkFaint, fontSize: 11, marginTop: spacing.sm },
});