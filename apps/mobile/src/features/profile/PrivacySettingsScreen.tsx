import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';

type Visibility = 'everyone' | 'contacts' | 'nobody';
type KPulsePolicy = 'everyone' | 'contacts' | 'favorites' | 'nobody';
type LoginNotifications = 'all_contacts' | 'favorites' | 'nobody';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void getBackend()
      .from('privacy_settings')
      .select('show_online,show_music,allow_wizz,login_notifications,read_receipts')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data) {
          setSettings(data as PrivacySettings);
          setExists(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setNotice('Impossible de charger les réglages.');
          setLoading(false);
        }
      });
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
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator /><Text style={styles.hint}>Chargement de ta confidentialité…</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View><Text style={styles.brand}>K-SSENGER</Text><Text style={styles.title}>Présence & confidentialité</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Garde le côté vivant des messageries d’époque sans perdre le contrôle sur ce que les autres voient.</Text>

        <ChoiceSection title="QUI VOIT QUE JE SUIS EN LIGNE ?" value={settings.show_online} options={visibilityOptions} onChange={(show_online) => setSettings((value) => ({ ...value, show_online }))} />
        <ChoiceSection title="QUI VOIT MA MUSIQUE ?" value={settings.show_music} options={visibilityOptions} onChange={(show_music) => setSettings((value) => ({ ...value, show_music }))} />
        <ChoiceSection title="QUI PEUT M’ENVOYER UN K-PULSE ?" value={settings.allow_wizz} options={pulseOptions} onChange={(allow_wizz) => setSettings((value) => ({ ...value, allow_wizz }))} />
        <ChoiceSection title="ALERTES DE CONNEXION" value={settings.login_notifications} options={loginOptions} onChange={(login_notifications) => setSettings((value) => ({ ...value, login_notifications }))} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCUSÉS DE LECTURE</Text>
          <TouchableOpacity style={styles.toggleRow} onPress={() => setSettings((value) => ({ ...value, read_receipts: !value.read_receipts }))}>
            <View style={styles.flex}><Text style={styles.optionLabel}>Afficher « lu »</Text><Text style={styles.hint}>Tu peux désactiver cette préférence sans modifier la sécurité des messages.</Text></View>
            <Text style={styles.toggle}>{settings.read_receipts ? '🟢' : '⚪'}</Text>
          </TouchableOpacity>
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
  safe: { flex: 1, backgroundColor: '#edf7fc' }, flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, back: { fontSize: 39, color: '#2189c5' }, brand: { color: '#3784b5', fontSize: 9, letterSpacing: 2, fontWeight: '900' }, title: { color: '#173448', fontSize: 18, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 42 }, intro: { color: '#607f90', lineHeight: 19, marginBottom: 4 }, section: { marginTop: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e9f2', borderRadius: 17, padding: 13 }, sectionTitle: { color: '#4f7388', fontSize: 10, letterSpacing: 1, fontWeight: '900' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }, option: { borderWidth: 1, borderColor: '#cbdfe9', borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#f8fcfe' }, optionActive: { borderColor: '#2189c5', backgroundColor: '#e1f3fc' }, optionLabel: { color: '#52768a', fontSize: 11, fontWeight: '800' }, optionLabelActive: { color: '#1675ad' }, toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }, toggle: { fontSize: 22 }, hint: { color: '#8197a4', fontSize: 10, lineHeight: 14, marginTop: 3 }, notice: { color: '#326e94', marginTop: 16, fontWeight: '800' }, primary: { minHeight: 48, marginTop: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5', borderRadius: 16 }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: 0.5 },
});
