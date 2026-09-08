import React from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import type { UseWebLink } from '../../lib/deviceLinkClient';
import { brandGradient, elevation, layout, palette, radius, spacing, type as typo } from '../../theme/tokens';

/**
 * Web-side pairing screen. The web session stays logged in with its own
 * account; linking only unlocks *chat* by pairing with the phone that holds
 * the Signal keys.
 */
export function WebLinkScreen({ webLink, onBack }: { webLink: UseWebLink; onBack?: () => void }) {
  const pairing = webLink.status === 'pairing';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.wash} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.mark}><Text style={styles.markText}>🔗</Text></View>
          <Text style={styles.kicker}>CHAT SUR LE WEB</Text>
          <Text style={styles.title}>Lie ce navigateur à ton téléphone</Text>
          <Text style={styles.lede}>
            Le chiffrement de bout en bout tourne uniquement sur ton téléphone. Une fois lié, il chiffre
            et envoie tes messages pour ce navigateur — aucune clé n’est copiée ici.
          </Text>

          {!!webLink.error && <View style={styles.banner}><Text style={styles.bannerText}>{webLink.error}</Text></View>}

          {pairing ? (
            <>
              <Text style={styles.step}>Sur ton téléphone : <Text style={styles.stepBold}>Moi → Appareils liés → Lier un navigateur</Text>, puis valide ce code.</Text>
              <View style={styles.codeBox}>
                {(webLink.code ?? '------').split('').map((d, i) => (
                  <View key={i} style={styles.codeCell}><Text style={styles.codeDigit}>{d}</Text></View>
                ))}
              </View>
              <View style={styles.waiting}><ActivityIndicator color={palette.azure} /><Text style={styles.waitingText}>En attente de la validation du téléphone…</Text></View>
              <TouchableOpacity onPress={webLink.cancelPairing}><Text style={styles.link}>Annuler</Text></TouchableOpacity>
            </>
          ) : webLink.status === 'linked' ? (
            <>
              <View style={styles.doneBadge}><Text style={styles.doneText}>✓ Navigateur lié</Text></View>
              <Text style={styles.step}>
                {webLink.phoneReachable
                  ? 'Ton téléphone est joignable. Tu peux discuter depuis n’importe quelle conversation.'
                  : 'Garde l’app K-ssenger ouverte sur ton téléphone pour envoyer et recevoir.'}
              </Text>
              {onBack && <TouchableOpacity onPress={onBack}><Text style={styles.link}>Continuer</Text></TouchableOpacity>}
              <TouchableOpacity onPress={() => void webLink.unlink()}><Text style={styles.unlink}>Délier ce navigateur</Text></TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity activeOpacity={0.9} onPress={() => void webLink.startPairing()} style={styles.ctaShell}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta} pointerEvents="none">
                <Text style={styles.ctaText}>Lier mon téléphone</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          <View style={styles.trust}>
            <Text style={styles.trustLock}>🔐</Text>
            <Text style={styles.trustText}>Le serveur ne relaie que des blobs chiffrés entre tes appareils. Rien en clair ne le traverse.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 300, backgroundColor: palette.skyTop },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, paddingVertical: spacing.xxxl },
  card: { width: '100%', maxWidth: layout.maxContent, backgroundColor: palette.surface, borderRadius: radius.xxl, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, alignItems: 'center', ...elevation.floating },
  mark: { width: 68, height: 68, borderRadius: radius.xl, backgroundColor: palette.azureSoft, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 30 },
  kicker: { marginTop: spacing.md, ...typo.brand },
  title: { marginTop: spacing.sm, ...typo.display, fontSize: 24, lineHeight: 28, textAlign: 'center' },
  lede: { marginTop: spacing.sm, ...typo.body, color: palette.inkSoft, textAlign: 'center', maxWidth: 380 },
  banner: { marginTop: spacing.lg, backgroundColor: palette.dangerSoft, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignSelf: 'stretch' },
  bannerText: { color: palette.danger, fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  step: { marginTop: spacing.lg, ...typo.meta, color: palette.inkSoft, textAlign: 'center', maxWidth: 400 },
  stepBold: { fontWeight: '900', color: palette.ink },
  codeBox: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  codeCell: { width: 44, height: 56, borderRadius: radius.sm, backgroundColor: palette.surfaceSunken, borderWidth: 1.5, borderColor: palette.hairline, alignItems: 'center', justifyContent: 'center' },
  codeDigit: { ...typo.display, fontSize: 26, color: palette.azureDeep },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  waitingText: { ...typo.meta, color: palette.inkSoft },
  doneBadge: { marginTop: spacing.lg, backgroundColor: palette.successSoft, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  doneText: { color: palette.success, fontWeight: '900', fontSize: 13 },
  ctaShell: { marginTop: spacing.xl, borderRadius: radius.md, overflow: 'hidden', alignSelf: 'stretch', ...elevation.card },
  cta: { minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: palette.white, fontWeight: '900', fontSize: 15, letterSpacing: 0.3 },
  link: { marginTop: spacing.lg, color: palette.azureDeep, fontWeight: '800', fontSize: 13 },
  unlink: { marginTop: spacing.md, color: palette.danger, fontWeight: '800', fontSize: 12 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: palette.hairline, alignSelf: 'stretch' },
  trustLock: { fontSize: 15 },
  trustText: { flex: 1, ...typo.micro, fontWeight: '600', lineHeight: 15 },
});
