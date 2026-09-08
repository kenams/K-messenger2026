import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { getBackend } from '../../lib/backend';
import { getAuthenticatedUserId } from '../../lib/realtime';
import { EmptyState, ScreenHeader, SectionLabel } from '../../theme/components';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';

type SharePrecision = 'precise' | 'approximate';
type ShareMode = 'one_time' | 'live' | 'meet' | 'route';

type LocationShare = {
  id: string;
  owner_id: string;
  recipient_user_id: string | null;
  conversation_id: string | null;
  precision: SharePrecision;
  mode: ShareMode;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type SafePoint = {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  captured_at: string;
  precision_level: SharePrecision;
};

type VisibleShare = LocationShare & { point: SafePoint | null };
type ContactOption = { id: string; label: string };

export function KMapScreen() {
  const [mine, setMine] = useState<LocationShare[]>([]);
  const [received, setReceived] = useState<VisibleShare[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [precision, setPrecision] = useState<SharePrecision>('approximate');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const me = await getAuthenticatedUserId();
      const now = new Date().toISOString();
      const [shareResponse, contactResponse] = await Promise.all([
        getBackend()
          .from('location_shares')
          .select('id,owner_id,recipient_user_id,conversation_id,precision,mode,expires_at,revoked_at,created_at')
          .gt('expires_at', now)
          .is('revoked_at', null)
          .order('expires_at', { ascending: true })
          .limit(100),
        getBackend().from('contacts').select('contact_id').eq('owner_id', me).limit(100),
      ]);
      if (shareResponse.error) throw shareResponse.error;
      if (contactResponse.error) throw contactResponse.error;

      const shares = ((shareResponse.data ?? []) as unknown) as LocationShare[];
      const incoming = shares.filter((share) => share.owner_id !== me);
      const hydrated = await Promise.all(incoming.map(async (share) => {
        try {
          const response = await getBackend().rpc('location_point_for_viewer', { p_share_id: share.id });
          if (response.error || !Array.isArray(response.data) || !response.data[0]) return { ...share, point: null };
          return { ...share, point: response.data[0] as SafePoint };
        } catch {
          return { ...share, point: null };
        }
      }));

      const contactRows = ((contactResponse.data ?? []) as unknown) as Array<{ contact_id?: string }>;
      const ids = contactRows.map((row) => row.contact_id).filter((id): id is string => typeof id === 'string');
      const options: ContactOption[] = [];
      if (ids.length) {
        const profiles = await getBackend().from('profiles').select('id,display_name,username').in('id', ids);
        if (!profiles.error) {
          for (const row of ((profiles.data ?? []) as unknown) as Array<{ id?: string; display_name?: string; username?: string }>) {
            if (!row.id) continue;
            options.push({ id: row.id, label: row.display_name || (row.username ? `@${row.username}` : 'Contact') });
          }
        }
      }

      setMine(shares.filter((share) => share.owner_id === me));
      setReceived(hydrated);
      setContacts(options);
      if (!selectedRecipient && options[0]?.id) setSelectedRecipient(options[0].id);
      setNotice('');
    } catch {
      setMine([]);
      setReceived([]);
      setContacts([]);
      setNotice('K‑Map est momentanément indisponible.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const createOneTimeShare = async () => {
    if (mutating || !selectedRecipient) return;
    setMutating(true);
    setNotice('');
    let shareId = '';
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setNotice('Permission de localisation refusée. Aucun partage n’a été créé.');
        return;
      }

      const me = await getAuthenticatedUserId();
      const position = await Location.getCurrentPositionAsync({
        accuracy: precision === 'precise' ? Location.Accuracy.High : Location.Accuracy.Balanced,
      });
      const capturedAt = new Date(position.timestamp).toISOString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const share = await getBackend().from('location_shares').insert({
        owner_id: me,
        recipient_user_id: selectedRecipient,
        conversation_id: null,
        precision,
        mode: 'one_time',
        expires_at: expiresAt,
      }).select('id').single();
      if (share.error || !share.data?.id) throw share.error ?? new Error('KMAP_SHARE_ID_MISSING');
      shareId = String(share.data.id);

      const latitude = precision === 'approximate' ? Math.round(position.coords.latitude * 1000) / 1000 : position.coords.latitude;
      const longitude = precision === 'approximate' ? Math.round(position.coords.longitude * 1000) / 1000 : position.coords.longitude;
      const accuracy = precision === 'approximate' ? Math.max(position.coords.accuracy ?? 0, 150) : position.coords.accuracy;

      const point = await getBackend().from('location_points').insert({
        share_id: shareId,
        latitude,
        longitude,
        accuracy_meters: accuracy,
        captured_at: capturedAt,
      });
      if (point.error) throw point.error;

      setNotice(precision === 'approximate'
        ? 'Zone approximative partagée pour 30 min. Les coordonnées sont encore dégradées côté serveur pour le destinataire.'
        : 'Position précise partagée pour 30 min. Tu peux la révoquer à tout moment.');
      await load();
    } catch {
      if (shareId) {
        try {
          await getBackend().from('location_shares').delete().eq('id', shareId);
        } catch {
          // Best-effort cleanup: RLS/expiry still protects an incomplete share.
        }
      }
      setNotice('Impossible de créer ce partage. Aucune position incomplète n’est conservée.');
    } finally {
      setMutating(false);
    }
  };

  const revoke = async (shareId: string) => {
    if (mutating) return;
    setMutating(true);
    try {
      const me = await getAuthenticatedUserId();
      const { error } = await getBackend()
        .from('location_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', shareId)
        .eq('owner_id', me);
      if (error) throw error;
      setMine((current) => current.filter((share) => share.id !== shareId));
      setNotice('Partage de position révoqué immédiatement.');
    } catch {
      setNotice('Impossible de révoquer ce partage.');
    } finally {
      setMutating(false);
    }
  };

  const ghostMode = async () => {
    if (mutating) return;
    setMutating(true);
    try {
      const me = await getAuthenticatedUserId();
      const { error } = await getBackend()
        .from('location_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('owner_id', me)
        .is('revoked_at', null);
      if (error) throw error;
      setMine([]);
      setNotice('Ghost Mode activé : tous tes partages actifs ont été révoqués.');
    } catch {
      setNotice('Ghost Mode impossible pour le moment.');
    } finally {
      setMutating(false);
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={palette.azure} /><Text style={styles.muted}>Chargement de K‑Map…</Text></View>;

  return (
    <View style={styles.page}>
      <ScreenHeader title="K-Map" subtitle="Partage ponctuel · foreground uniquement" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.azure} />}>
        <View style={styles.hero}>
          <Text style={styles.pin}>📍</Text>
          <Text style={styles.subtitle}>Aucun tracking caché : K-ssenger demande ta position seulement quand tu appuies sur Partager. Chaque partage ponctuel expire après 30 minutes.</Text>
          <TouchableOpacity disabled={mutating || mine.length === 0} style={[styles.ghost, (mutating || mine.length === 0) && styles.disabled]} onPress={() => void ghostMode()}>
            <Text style={styles.ghostText}>👻 Ghost Mode · Tout révoquer</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <SectionLabel>Nouveau partage ponctuel</SectionLabel>
          {!contacts.length ? <EmptyState icon="👥" title="Aucun contact" hint="Ajoute d’abord un contact pour partager ta position." /> : (
            <View style={styles.shareComposer}>
              <Text style={styles.composerLabel}>Destinataire</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {contacts.map((contact) => (
                  <TouchableOpacity key={contact.id} onPress={() => setSelectedRecipient(contact.id)} style={[styles.chip, selectedRecipient === contact.id && styles.chipActive]}>
                    <Text style={[styles.chipText, selectedRecipient === contact.id && styles.chipTextActive]}>{contact.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.composerLabel}>Précision</Text>
              <View style={styles.precisionRow}>
                <TouchableOpacity onPress={() => setPrecision('approximate')} style={[styles.chip, precision === 'approximate' && styles.chipActive]}><Text style={[styles.chipText, precision === 'approximate' && styles.chipTextActive]}>⭕ Approximative</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setPrecision('precise')} style={[styles.chip, precision === 'precise' && styles.chipPrecise]}><Text style={[styles.chipText, precision === 'precise' && styles.chipTextActive]}>📍 Précise</Text></TouchableOpacity>
              </View>
              <Text style={styles.privacyCopy}>{precision === 'approximate' ? 'Recommandé : précision réduite avant stockage puis encore dégradée par Neon pour le destinataire.' : 'La position exacte sera stockée pour ce partage. Utilise-la seulement avec une personne de confiance.'}</Text>
              <TouchableOpacity disabled={mutating || !selectedRecipient} onPress={() => void createOneTimeShare()} style={[styles.shareButton, (mutating || !selectedRecipient) && styles.disabled]}>
                {mutating ? <ActivityIndicator color={palette.white} /> : <Text style={styles.shareButtonText}>Partager ma position · 30 min</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        <View style={styles.section}>
          <SectionLabel>Mes partages actifs</SectionLabel>
          {!mine.length ? <EmptyState icon="📌" title="Aucun partage actif" /> : mine.map((share) => (
            <View key={share.id} style={styles.card}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{share.mode === 'live' ? '🔴 Position en direct' : share.mode === 'meet' ? '🤝 Point de rencontre' : share.mode === 'route' ? '🧭 Trajet' : '📌 Position ponctuelle'}</Text>
                <Text style={styles.meta}>{share.precision === 'precise' ? 'Position précise' : 'Zone approximative'} · expire {new Date(share.expires_at).toLocaleString()}</Text>
                <Text style={styles.meta}>{share.recipient_user_id ? 'Partage individuel' : 'Partage dans un groupe'}</Text>
              </View>
              <TouchableOpacity disabled={mutating} style={styles.revoke} onPress={() => void revoke(share.id)}><Text style={styles.revokeText}>Révoquer</Text></TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <SectionLabel>Partagé avec moi</SectionLabel>
          {!received.length ? <EmptyState icon="🛰️" title="Personne ne partage sa position" /> : received.map((share) => (
            <View key={share.id} style={styles.card}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{share.precision === 'precise' ? '📍 Position précise' : '⭕ Zone approximative'}</Text>
                {share.point ? <>
                  <Text style={styles.coords}>{share.point.latitude.toFixed(share.point.precision_level === 'precise' ? 5 : 2)}, {share.point.longitude.toFixed(share.point.precision_level === 'precise' ? 5 : 2)}</Text>
                  <Text style={styles.meta}>{share.point.precision_level === 'approximate' ? 'Coordonnées volontairement dégradées par Neon avant lecture.' : `Précision déclarée : ${Math.round(share.point.accuracy_meters ?? 0)} m`}</Text>
                </> : <Text style={styles.meta}>Point indisponible ou partage expiré/révoqué.</Text>}
                <Text style={styles.meta}>Expire {new Date(share.expires_at).toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.sky },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: palette.sky },
  muted: { ...typo.meta },
  flex: { flex: 1 },
  hero: { alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.xl, padding: spacing.xl },
  pin: { fontSize: 44 },
  subtitle: { color: palette.inkSoft, textAlign: 'center', marginTop: spacing.sm, lineHeight: 19, maxWidth: 420 },
  ghost: { marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: palette.ink },
  ghostText: { color: palette.white, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  notice: { color: palette.azureDeep, fontWeight: '700', textAlign: 'center', marginTop: spacing.md },
  section: { marginTop: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  cardTitle: { ...typo.name },
  meta: { ...typo.micro, fontWeight: '500', marginTop: 3, lineHeight: 15 },
  coords: { color: palette.azureDeep, fontWeight: '900', marginTop: 5 },
  revoke: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: palette.dangerSoft, borderRadius: radius.sm },
  revokeText: { color: palette.danger, fontWeight: '900', fontSize: 10 },
  shareComposer: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.lg, padding: spacing.md },
  composerLabel: { ...typo.label, textTransform: 'uppercase', marginTop: spacing.xs, marginBottom: spacing.sm },
  chips: { gap: spacing.xs, paddingBottom: spacing.xs },
  precisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: palette.azureSoft },
  chipActive: { backgroundColor: palette.azure },
  chipPrecise: { backgroundColor: palette.busy },
  chipText: { color: palette.inkSoft, fontWeight: '800', fontSize: 11 },
  chipTextActive: { color: palette.white },
  privacyCopy: { color: palette.inkFaint, fontSize: 10, lineHeight: 15, marginTop: spacing.sm },
  shareButton: { minHeight: 48, backgroundColor: palette.azure, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  shareButtonText: { color: palette.white, fontWeight: '900' },
});
