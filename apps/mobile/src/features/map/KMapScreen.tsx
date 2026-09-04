import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getBackend } from '../../lib/backend';
import { getAuthenticatedUserId } from '../../lib/realtime';

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

type VisibleShare = LocationShare & {
  point: SafePoint | null;
};

export function KMapScreen() {
  const [mine, setMine] = useState<LocationShare[]>([]);
  const [received, setReceived] = useState<VisibleShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const me = await getAuthenticatedUserId();
      const now = new Date().toISOString();
      const { data, error } = await getBackend()
        .from('location_shares')
        .select('id,owner_id,recipient_user_id,conversation_id,precision,mode,expires_at,revoked_at,created_at')
        .gt('expires_at', now)
        .is('revoked_at', null)
        .order('expires_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      const shares = (data ?? []) as LocationShare[];
      const owned = shares.filter((share) => share.owner_id === me);
      const incoming = shares.filter((share) => share.owner_id !== me);
      const hydrated = await Promise.all(incoming.map(async (share) => {
        try {
          const response = await getBackend().rpc('location_point_for_viewer', { p_share_id: share.id });
          if (response.error || !Array.isArray(response.data) || !response.data[0]) return { ...share, point: null };
          const point = response.data[0] as SafePoint;
          return { ...share, point };
        } catch {
          return { ...share, point: null };
        }
      }));
      setMine(owned);
      setReceived(hydrated);
      setNotice('');
    } catch {
      setMine([]);
      setReceived([]);
      setNotice('K‑MAP réel indisponible tant que le schéma social K-ssenger n’est pas activé sur Neon.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

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

  if (loading) return <View style={styles.loading}><ActivityIndicator /><Text style={styles.muted}>Chargement de K‑MAP…</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
      <View style={styles.hero}>
        <Text style={styles.pin}>📍</Text>
        <Text style={styles.title}>K‑MAP</Text>
        <Text style={styles.subtitle}>La position n’est visible que via un partage explicite. Les partages approximatifs sont réduits côté serveur avant d’arriver sur ton téléphone.</Text>
        <TouchableOpacity disabled={mutating || mine.length === 0} style={[styles.ghost, (mutating || mine.length === 0) && styles.disabled]} onPress={() => void ghostMode()}>
          <Text style={styles.ghostText}>👻 Ghost Mode · Tout révoquer</Text>
        </TouchableOpacity>
      </View>

      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MES PARTAGES ACTIFS</Text>
        {!mine.length ? <Text style={styles.empty}>Aucun partage actif.</Text> : mine.map((share) => (
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
        <Text style={styles.sectionTitle}>PARTAGÉ AVEC MOI</Text>
        {!received.length ? <Text style={styles.empty}>Aucun contact ne partage sa position avec toi actuellement.</Text> : received.map((share) => (
          <View key={share.id} style={styles.card}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{share.precision === 'precise' ? '📍 Position précise' : '⭕ Zone approximative'}</Text>
              {share.point ? (
                <>
                  <Text style={styles.coords}>{share.point.latitude.toFixed(share.point.precision_level === 'precise' ? 5 : 2)}, {share.point.longitude.toFixed(share.point.precision_level === 'precise' ? 5 : 2)}</Text>
                  <Text style={styles.meta}>{share.point.precision_level === 'approximate' ? 'Coordonnées volontairement dégradées par Neon avant lecture.' : `Précision déclarée : ${Math.round(share.point.accuracy_meters ?? 0)} m`}</Text>
                </>
              ) : <Text style={styles.meta}>Point indisponible ou partage expiré/révoqué.</Text>}
              <Text style={styles.meta}>Expire {new Date(share.expires_at).toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.info}><Text style={styles.infoTitle}>Création de partage</Text><Text style={styles.infoText}>Le bouton “partager ma position” restera verrouillé jusqu’à l’intégration de la permission GPS native et à sa validation sur appareil. K-ssenger ne demande pas une localisation qu’il ne sait pas encore protéger de bout en bout.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef6fb' }, content: { padding: 16, paddingBottom: 36 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: '#668293' }, flex: { flex: 1 },
  hero: { alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2', borderRadius: 20, padding: 20 }, pin: { fontSize: 48 }, title: { color: '#173448', fontSize: 27, fontWeight: '900', marginTop: 4 }, subtitle: { color: '#688493', textAlign: 'center', marginTop: 7, lineHeight: 19, maxWidth: 420 }, ghost: { marginTop: 15, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: '#173448' }, ghostText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: 0.45 }, notice: { color: '#326e94', fontWeight: '700', textAlign: 'center', marginTop: 12 },
  section: { marginTop: 16 }, sectionTitle: { color: '#4d86aa', fontWeight: '900', fontSize: 11, letterSpacing: 1.2, marginBottom: 8 }, empty: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0ebf1', borderRadius: 15, padding: 16, color: '#7893a3', textAlign: 'center' }, card: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2', borderRadius: 16, padding: 13, marginBottom: 8 }, cardTitle: { color: '#173448', fontWeight: '900' }, meta: { color: '#7893a3', fontSize: 10, marginTop: 4, lineHeight: 15 }, coords: { color: '#326e94', fontWeight: '900', marginTop: 5 }, revoke: { paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#fff0ef', borderRadius: 10 }, revokeText: { color: '#b42318', fontWeight: '900', fontSize: 10 },
  info: { marginTop: 16, padding: 15, backgroundColor: '#e8f7ff', borderWidth: 1, borderColor: '#b8dcf0', borderRadius: 17 }, infoTitle: { color: '#2f7199', fontWeight: '900' }, infoText: { color: '#5f8093', fontSize: 11, lineHeight: 17, marginTop: 5 },
});
