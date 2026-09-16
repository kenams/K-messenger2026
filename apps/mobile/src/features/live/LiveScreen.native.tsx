// K-Live's native video module (@livekit/react-native + react-native-webrtc)
// is temporarily pulled from Android/iOS builds: it broke unrelated
// networking (profile/auth fetches over plain fetch/OkHttp) on real devices,
// reproducibly, even without ever opening this screen — installing the
// native module was enough. App.tsx's onLive handler shows an alert instead
// of navigating here on native, so this stub should be unreachable; it
// exists only so the file still resolves for Metro/TypeScript. Re-add
// @livekit/react-native, @livekit/react-native-webrtc, and the two config
// plugins in app.json once that native networking conflict is root-caused.
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

export function LiveScreen({ onClose }: { broadcasterId: string | null; onClose: () => void }) {
  const { styles, scheme } = useThemedStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.centre}>
        <Text style={styles.title}>K-Live arrive bientôt sur mobile</Text>
        <Text style={styles.lede}>Le live vidéo est disponible dès maintenant sur la version web de K-ssenger.</Text>
        <TouchableOpacity style={styles.cta} onPress={onClose} accessibilityRole="button">
          <Text style={styles.ctaText}>Retour</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surface },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { ...typo.title, color: palette.ink, textAlign: 'center' },
  lede: { ...typo.body, color: palette.inkSoft, textAlign: 'center' },
  cta: { backgroundColor: palette.azure, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minWidth: 220, alignItems: 'center' },
  ctaText: { color: palette.white, fontWeight: '900', fontSize: 15 },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
