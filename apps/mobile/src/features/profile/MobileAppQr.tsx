import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';

/** Stable link regardless of beta build number — GitHub always resolves this to the latest release asset. */
export const APK_DOWNLOAD_URL = 'https://github.com/kenams/K-messenger2026/releases/latest/download/K-ssenger-latest.apk';

/** Web-only "scan to get the Android app" panel. Shown both on the sign-in screen
 * and, once logged in, from the Me screen — no need to sign out to find it again. */
export function MobileAppQr() {
  return (
    <View style={styles.panel}>
      <View style={styles.codeShell}>
        <QRCode value={APK_DOWNLOAD_URL} size={104} backgroundColor={palette.surface} color={palette.ink} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>📱 K-ssenger sur ton téléphone</Text>
        <Text style={styles.text}>
          Scanne avec l’appareil photo pour télécharger l’app Android. Connecte-toi avec le même e-mail et mot de passe pour retrouver tes conversations.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  codeShell: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
  copy: { flex: 1, gap: 4 },
  title: { ...typo.meta, fontWeight: '800', color: palette.ink },
  text: { ...typo.micro, color: palette.inkSoft, lineHeight: 15 },
});
