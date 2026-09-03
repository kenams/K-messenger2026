import React, { useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getBackend } from '../../lib/backend';
import type { MyProfile } from './useMyProfile';

async function readTable(table: string, select = '*') {
  const { data, error } = await getBackend().from(table).select(select);
  if (error) throw new Error(`EXPORT_${table.toUpperCase()}_FAILED`);
  return data ?? [];
}

export function AccountDataScreen({ profile, onBack }: { profile: MyProfile; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const exportData = async () => {
    setBusy(true);
    setNotice('');
    try {
      const [profiles, privacy, contacts, requests, blocks, devices, conversations, members, messages, receipts] = await Promise.all([
        readTable('profiles'),
        readTable('privacy_settings'),
        readTable('contacts'),
        readTable('contact_requests'),
        readTable('blocks'),
        readTable('devices'),
        readTable('conversations'),
        readTable('conversation_members'),
        readTable('messages'),
        readTable('message_receipts'),
      ]);

      const payload = {
        format: 'k-ssenger-account-export-v1',
        exported_at: new Date().toISOString(),
        user_id: profile.id,
        note: 'Private message bodies remain encrypted envelopes. This export does not decrypt server-side ciphertext.',
        profiles,
        privacy_settings: privacy,
        contacts,
        contact_requests: requests,
        blocks,
        devices,
        conversations,
        conversation_members: members,
        encrypted_messages: messages,
        message_receipts: receipts,
      };

      await Share.share({
        title: `K-ssenger export ${new Date().toISOString().slice(0, 10)}`,
        message: JSON.stringify(payload, null, 2),
      });
      setNotice('Export généré avec les données autorisées par ton compte.');
    } catch {
      setNotice('Export impossible pour le moment. Aucune donnée partielle n’a été partagée.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View><Text style={styles.brand}>K-SSENGER</Text><Text style={styles.title}>Mes données</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📦 Exporter mon compte</Text>
          <Text style={styles.copy}>Génère un export JSON des données accessibles à ton identité via les politiques RLS K-ssenger. Les messages privés restent sous forme chiffrée.</Text>
          <TouchableOpacity style={styles.primary} disabled={busy} onPress={() => void exportData()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Créer mon export</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.warningCard}>
          <Text style={styles.cardTitle}>🗑️ Supprimer mon compte</Text>
          <Text style={styles.copy}>La suppression totale n’est pas proposée tant que le self-delete Neon Auth avec vérification de mot de passe/session récente n’est pas activé. K-ssenger ne supprimera jamais seulement le profil en laissant l’identité Auth active.</Text>
          <View style={styles.disabled}><Text style={styles.disabledText}>Suppression sécurisée en attente de configuration Auth</Text></View>
        </View>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#d7e9f3' }, back: { fontSize: 39, color: '#2189c5' }, brand: { color: '#3784b5', fontSize: 9, letterSpacing: 2, fontWeight: '900' }, title: { color: '#173448', fontSize: 18, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 40 }, card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 18, padding: 16 }, warningCard: { marginTop: 14, backgroundColor: '#fffaf0', borderWidth: 1, borderColor: '#ead9ad', borderRadius: 18, padding: 16 }, cardTitle: { color: '#173448', fontSize: 16, fontWeight: '900' }, copy: { color: '#6e8796', lineHeight: 19, marginTop: 8 }, primary: { minHeight: 48, marginTop: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5', borderRadius: 15 }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: '#ede9df', alignItems: 'center' }, disabledText: { color: '#8b8067', fontSize: 11, fontWeight: '800', textAlign: 'center' }, notice: { marginTop: 16, color: '#326e94', fontWeight: '700' },
});
