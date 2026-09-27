import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

/**
 * Stable link regardless of beta build number. Served straight from the same
 * web deployment (apps/mobile/public/kssenger-latest.apk) instead of a GitHub
 * Releases "latest" redirect: that redirect 404s whenever the newest release's
 * asset filename doesn't exactly match (it drifted to kssenger-preview-*.apk),
 * and GitHub's release-asset CDN is also flakier on mobile in-app browsers.
 * To ship a new build: copy the APK to apps/mobile/public/kssenger-latest.apk
 * before running `npm run ship:web` — no code change needed after that.
 */
export const APK_DOWNLOAD_URL = 'https://k-ssenger.expo.app/kssenger-latest.apk';

/** Web-only "scan to get the Android app" panel. Shown both on the sign-in screen
 * and, once logged in, from the Me screen — no need to sign out to find it again. */
export function MobileAppQr() {
  const { styles, colors } = useThemedStyles();
  return (
    <View style={styles.panel}>
      <View style={styles.codeShell}>
        <QRCode value={APK_DOWNLOAD_URL} size={104} backgroundColor={colors.surface} color={colors.ink} />
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

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  codeShell: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
  copy: { flex: 1, gap: 4 },
  title: { ...typo.meta, fontWeight: '800', color: palette.ink },
  text: { ...typo.micro, color: palette.inkSoft, lineHeight: 15 },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
