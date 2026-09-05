import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import { reauthenticateNeonPassword, changeNeonPassword } from '../../lib/neonAuth';
import { disconnectRealtimeSocket, emitAck, getRealtimeSocket } from '../../lib/realtime';
import type { MyProfile } from './useMyProfile';

type ExportRow = Record<string, unknown>;
type DeleteAck = { ok: boolean; error?: string };

async function readTable(table: string, select = '*'): Promise<ExportRow[]> {
  const { data, error } = await getBackend().from(table).select(select);
  if (error) throw new Error(`EXPORT_${table.toUpperCase()}_FAILED`);
  return ((data ?? []) as unknown) as ExportRow[];
}

async function readOwnedTable(table: string, ownerColumn: string, userId: string, select = '*'): Promise<ExportRow[]> {
  const { data, error } = await getBackend().from(table).select(select).eq(ownerColumn, userId);
  if (error) throw new Error(`EXPORT_${table.toUpperCase()}_FAILED`);
  return ((data ?? []) as unknown) as ExportRow[];
}

async function readRowsForIds(table: string, column: string, ids: string[], select = '*'): Promise<ExportRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getBackend().from(table).select(select).in(column, ids);
  if (error) throw new Error(`EXPORT_${table.toUpperCase()}_FAILED`);
  return ((data ?? []) as unknown) as ExportRow[];
}

export function AccountDataScreen({ profile, onBack }: { profile: MyProfile; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [deleteNotice, setDeleteNotice] = useState('');

  const exportData = async () => {
    setBusy(true);
    setNotice('');
    try {
      const [profiles, privacy, contacts, requests, blocks, devices, pushSubscriptions, conversations, members, messages, receipts, ageProfile, videos, videoReports, moments, momentViews, momentReactions, momentReports, locationShares] = await Promise.all([
        readOwnedTable('profiles', 'id', profile.id),
        readOwnedTable('privacy_settings', 'user_id', profile.id),
        readOwnedTable('contacts', 'owner_id', profile.id),
        readTable('contact_requests'),
        readTable('blocks'),
        readOwnedTable('devices', 'user_id', profile.id),
        readOwnedTable('push_subscriptions', 'user_id', profile.id, 'id,device_id,platform,enabled,last_seen_at,created_at,updated_at'),
        readTable('conversations'),
        readTable('conversation_members'),
        readTable('messages'),
        readTable('message_receipts'),
        readOwnedTable('user_age_profile', 'user_id', profile.id),
        readOwnedTable('public_videos', 'owner_id', profile.id),
        readOwnedTable('video_reports', 'reporter_id', profile.id),
        readOwnedTable('moments', 'author_id', profile.id),
        readOwnedTable('moment_views', 'viewer_id', profile.id),
        readOwnedTable('moment_reactions', 'user_id', profile.id),
        readOwnedTable('moment_reports', 'reporter_id', profile.id),
        readOwnedTable('location_shares', 'owner_id', profile.id),
      ]);

      const ownedShareIds = locationShares.map((share) => share.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
      const locationPoints = await readRowsForIds('location_points', 'share_id', ownedShareIds);

      const payload = {
        format: 'k-ssenger-account-export-v3',
        exported_at: new Date().toISOString(),
        user_id: profile.id,
        note: 'Private message bodies remain encrypted envelopes. Push provider tokens are intentionally excluded from this portable export. Relationship and conversation rows are limited by K-ssenger RLS; public profile directory rows for other users are intentionally excluded.',
        profile: profiles[0] ?? null,
        privacy_settings: privacy,
        contacts,
        contact_requests: requests,
        blocks,
        devices,
        push_subscriptions: pushSubscriptions,
        conversations,
        conversation_members: members,
        encrypted_messages: messages,
        message_receipts: receipts,
        age_profile: ageProfile,
        k_feed: { owned_videos: videos, reports_submitted: videoReports },
        moments: { owned: moments, views_made: momentViews, reactions_made: momentReactions, reports_submitted: momentReports },
        k_map: { owned_shares: locationShares, owned_share_points: locationPoints },
      };

      await Share.share({ title: `K-ssenger export ${new Date().toISOString().slice(0, 10)}`, message: JSON.stringify(payload, null, 2) });
      setNotice('Export complet généré avec les données autorisées par ton compte.');
    } catch {
      setNotice('Export impossible pour le moment. Aucune donnée partielle n’a été partagée.');
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (passwordBusy) return;
    setPasswordNotice('');
    if (currentPassword.length < 8) return setPasswordNotice('Entre ton mot de passe actuel.');
    if (newPassword.length < 8) return setPasswordNotice('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    if (newPassword !== confirmPassword) return setPasswordNotice('La confirmation du nouveau mot de passe ne correspond pas.');
    if (newPassword === currentPassword) return setPasswordNotice('Choisis un nouveau mot de passe différent de l’ancien.');

    setPasswordBusy(true);
    try {
      const result = await changeNeonPassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (result.error) throw result.error;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('Mot de passe modifié. Les autres sessions ont été révoquées.');
    } catch {
      setPasswordNotice('Modification refusée. Vérifie ton mot de passe actuel et réessaie.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteBusy) return;
    setDeleteNotice('');
    if (deletePassword.length < 8) return setDeleteNotice('Entre ton mot de passe actuel.');
    if (deleteConfirmation !== 'DELETE') return setDeleteNotice('Tape exactement DELETE pour confirmer la suppression définitive.');

    setDeleteBusy(true);
    try {
      const freshAccessToken = await reauthenticateNeonPassword(deletePassword);
      const socket = await getRealtimeSocket();
      const response = await emitAck<DeleteAck>(socket, 'account:delete', { freshAccessToken, confirmation: 'DELETE' });
      if (!response.ok) throw new Error(response.error ?? 'ACCOUNT_DELETE_REJECTED');

      setDeletePassword('');
      setDeleteConfirmation('');
      disconnectRealtimeSocket();
      await getBackend().auth.signOut();
      setDeleteNotice('Compte supprimé définitivement.');
    } catch {
      setDeleteNotice('Suppression refusée. Vérifie ton mot de passe et réessaie. Si le service sécurisé de suppression n’est pas configuré côté serveur, aucune donnée n’est effacée.');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View><Text style={styles.brand}>K-SSENGER</Text><Text style={styles.title}>Compte & données</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔑 Changer mon mot de passe</Text>
          <Text style={styles.copy}>Le changement est vérifié par Neon Auth. Les autres sessions sont révoquées après succès.</Text>
          <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Mot de passe actuel" style={styles.input} />
          <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} value={newPassword} onChangeText={setNewPassword} placeholder="Nouveau mot de passe" style={styles.input} />
          <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirmer le nouveau mot de passe" style={styles.input} onSubmitEditing={() => void changePassword()} />
          <TouchableOpacity style={[styles.primary, passwordBusy && styles.buttonDisabled]} disabled={passwordBusy} onPress={() => void changePassword()}>
            {passwordBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Modifier mon mot de passe</Text>}
          </TouchableOpacity>
          {!!passwordNotice && <Text style={styles.notice}>{passwordNotice}</Text>}
        </View>

        <View style={[styles.card, styles.sectionGap]}>
          <Text style={styles.cardTitle}>📦 Exporter mon compte</Text>
          <Text style={styles.copy}>Génère un export JSON de ton profil, paramètres, relations, conversations autorisées, appareils, K-Feed, Moments et partages K-MAP. Les messages privés restent chiffrés et les jetons push ne sont jamais exportés.</Text>
          <TouchableOpacity style={[styles.primary, busy && styles.buttonDisabled]} disabled={busy} onPress={() => void exportData()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Créer mon export</Text>}
          </TouchableOpacity>
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
        </View>

        <View style={styles.warningCard}>
          <Text style={styles.cardTitle}>🗑️ Supprimer mon compte</Text>
          <Text style={styles.copy}>Action définitive. K-ssenger demande ton mot de passe, obtient un jeton Neon Auth fraîchement émis puis exige la confirmation DELETE. Le serveur ne peut cibler que le projet Neon K-ssenger dédié.</Text>
          <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} value={deletePassword} onChangeText={setDeletePassword} placeholder="Mot de passe actuel" style={styles.input} />
          <TextInput autoCapitalize="characters" autoCorrect={false} value={deleteConfirmation} onChangeText={setDeleteConfirmation} placeholder="Tape DELETE" style={styles.input} />
          <TouchableOpacity style={[styles.danger, deleteBusy && styles.buttonDisabled]} disabled={deleteBusy} onPress={() => void deleteAccount()}>
            {deleteBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Supprimer définitivement mon compte</Text>}
          </TouchableOpacity>
          {!!deleteNotice && <Text style={styles.deleteNotice}>{deleteNotice}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#d7e9f3' },
  back: { fontSize: 39, color: '#2189c5' }, brand: { color: '#3784b5', fontSize: 9, letterSpacing: 2, fontWeight: '900' }, title: { color: '#173448', fontSize: 18, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 40 }, card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 18, padding: 16 }, sectionGap: { marginTop: 14 }, warningCard: { marginTop: 14, backgroundColor: '#fff6f4', borderWidth: 1, borderColor: '#efb8ad', borderRadius: 18, padding: 16 },
  cardTitle: { color: '#173448', fontSize: 16, fontWeight: '900' }, copy: { color: '#6e8796', lineHeight: 19, marginTop: 8 }, input: { minHeight: 48, marginTop: 10, paddingHorizontal: 13, backgroundColor: '#f7fafc', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 13 },
  primary: { minHeight: 48, marginTop: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5', borderRadius: 15 }, danger: { minHeight: 48, marginTop: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b42318', borderRadius: 15 }, buttonDisabled: { opacity: 0.55 }, primaryText: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  notice: { marginTop: 12, color: '#326e94', fontWeight: '700' }, deleteNotice: { marginTop: 12, color: '#9d281d', fontWeight: '700' },
});
