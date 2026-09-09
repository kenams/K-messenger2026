import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { getBackend, isBackendConfigured } from '../../lib/backend';
import { brandGradient, elevation, layout, palette, radius, spacing, type as typo } from '../../theme/tokens';

type Mode = 'login' | 'signup';

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

function BrandMark({ size = 76 }: { size?: number }) {
  return (
    <View style={[styles.markWrap, { width: size + 20, height: size + 20 }]}>
      <View style={[styles.markGlow, { borderRadius: (size + 20) / 2 }]} />
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.mark, { width: size, height: size, borderRadius: size * 0.32 }]}
      >
        <Text style={[styles.markText, { fontSize: size * 0.46 }]}>K</Text>
      </LinearGradient>
    </View>
  );
}

function AuthField(props: React.ComponentProps<typeof TextInput> & { icon?: string }) {
  const { icon, style, ...input } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.fieldRow, focused && styles.fieldRowFocused]}>
      {icon ? <Text style={styles.fieldIcon}>{icon}</Text> : null}
      <TextInput
        placeholderTextColor={palette.inkFaint}
        {...input}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        style={[styles.fieldInput, style]}
      />
    </View>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const normalizedUsername = normalizeUsername(username);
  const signupIdentityValid = mode === 'login' || (normalizedUsername.length >= 3 && displayName.trim().length >= 1);
  const canSubmit = !!email.trim() && password.length >= 8 && signupIdentityValid && !busy && isBackendConfigured;

  const setModeSafe = (next: Mode) => { setMode(next); setError(''); setNotice(''); };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!canSubmit || !normalizedEmail) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const backend = getBackend();
      if (mode === 'login') {
        const { data, error: authError } = await backend.auth.signInWithPassword({ email: normalizedEmail, password });
        if (authError) setError('Connexion impossible. Vérifie ton e-mail et ton mot de passe.');
        else if (data.session && Platform.OS === 'web' && typeof window !== 'undefined') {
          // The web auth adapter doesn't reliably emit onAuthStateChange; reload to enter the app.
          window.location.reload();
          return;
        }
      } else {
        const { data, error: authError } = await backend.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { username: normalizedUsername, display_name: displayName.trim().slice(0, 64) } },
        });
        if (authError) setError('Création du compte impossible. Essaie un autre pseudo ou réessaie dans un instant.');
        else if (!data.session) setNotice('Compte créé. Confirme ton e-mail pour te connecter.');
        else if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.reload();
          return;
        }
      }
    } catch {
      setError(mode === 'login'
        ? 'K-ssenger ne peut pas joindre le service de connexion pour le moment.'
        : 'K-ssenger ne peut pas créer le compte pour le moment. Réessaie quand la connexion est rétablie.');
    } finally {
      setBusy(false);
    }
  };

  if (!isBackendConfigured) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.wash} pointerEvents="none" />
        <View style={styles.centre}>
          <View style={styles.card}>
            <BrandMark />
            <Text style={styles.kicker}>K · SSENGER</Text>
            <Text style={styles.title}>Backend non configuré</Text>
            <Text style={styles.lede}>L’app attend uniquement les endpoints publics du backend Neon dédié à K-ssenger.</Text>
            <View style={styles.codeBlock}>
              <Text style={styles.code}>EXPO_PUBLIC_NEON_AUTH_URL</Text>
              <Text style={styles.code}>EXPO_PUBLIC_NEON_DATA_API_URL</Text>
            </View>
            <Text style={styles.warning}>Aucune base d’un autre projet ne sera utilisée.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.wash} pointerEvents="none" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <BrandMark />
            <Text style={styles.kicker}>K · SSENGER</Text>
            <Text style={styles.title}>{mode === 'login' ? 'Content de te revoir' : 'Rejoins K-ssenger'}</Text>
            <Text style={styles.lede}>La messagerie qui remet tes contacts au centre. Présence en direct, wizz, moments — chiffré de bout en bout.</Text>

            <View style={styles.segment}>
              {(['login', 'signup'] as Mode[]).map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === m }}
                  onPress={() => setModeSafe(m)}
                  style={[styles.segmentItem, mode === m && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                    {m === 'login' ? 'Connexion' : 'Créer un compte'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.form}>
              {mode === 'signup' && (
                <>
                  <AuthField
                    icon="@"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="pseudo (3 caractères min.)"
                    value={username}
                    onChangeText={(value) => setUsername(normalizeUsername(value))}
                    maxLength={24}
                  />
                  <AuthField
                    icon="🙂"
                    autoCorrect={false}
                    placeholder="Nom affiché / surnom"
                    value={displayName}
                    onChangeText={setDisplayName}
                    maxLength={64}
                  />
                </>
              )}

              <AuthField
                icon="✉️"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="E-mail"
                value={email}
                onChangeText={setEmail}
              />
              <AuthField
                icon="🔒"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                placeholder="Mot de passe (8 caractères min.)"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => void submit()}
                returnKeyType="go"
              />

              {mode === 'signup' && normalizedUsername.length > 0 && normalizedUsername.length < 3 && (
                <Text style={styles.hint}>Le pseudo doit contenir au moins 3 caractères.</Text>
              )}
              {!!error && <View style={styles.banner}><Text style={styles.bannerText}>{error}</Text></View>}
              {!!notice && <View style={[styles.banner, styles.bannerOk]}><Text style={[styles.bannerText, styles.bannerTextOk]}>{notice}</Text></View>}

              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.9}
                disabled={!canSubmit}
                onPress={() => void submit()}
                style={[styles.ctaShell, !canSubmit && styles.ctaDisabled]}
              >
                <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta} pointerEvents="none">
                  {busy ? (
                    <ActivityIndicator color={palette.white} />
                  ) : (
                    <Text style={styles.ctaText}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.trust}>
              <Text style={styles.trustLock}>🔐</Text>
              <Text style={styles.trustText}>
                Chiffrement de bout en bout (Signal). Aucun secret serveur n’est embarqué dans l’app.
              </Text>
            </View>
          </View>

          <Text style={styles.foot}>K-ssenger — édition Lumière</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky },
  flex: { flex: 1 },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 320, backgroundColor: palette.skyTop },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, paddingVertical: spacing.xxxl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  card: {
    width: '100%',
    maxWidth: layout.maxContent,
    backgroundColor: palette.surface,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: palette.hairline,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    ...elevation.floating,
  },

  markWrap: { alignItems: 'center', justifyContent: 'center' },
  markGlow: { position: 'absolute', width: '100%', height: '100%', backgroundColor: palette.azureHalo },
  mark: { alignItems: 'center', justifyContent: 'center', ...elevation.card },
  markText: { color: palette.white, fontWeight: '900', letterSpacing: -1 },

  kicker: { marginTop: spacing.md, ...typo.brand },
  title: { marginTop: spacing.sm, ...typo.display, textAlign: 'center' },
  lede: { marginTop: spacing.sm, ...typo.body, color: palette.inkSoft, textAlign: 'center', maxWidth: 380 },

  segment: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceSunken,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  segmentItem: { flex: 1, paddingVertical: 11, borderRadius: radius.md, alignItems: 'center' },
  segmentItemActive: { backgroundColor: palette.surface, ...elevation.hairline },
  segmentText: { ...typo.meta, fontWeight: '800', color: palette.inkSoft },
  segmentTextActive: { color: palette.azureDeep },

  form: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surfaceSunken,
    borderWidth: 1.5,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  fieldRowFocused: { borderColor: palette.azure, backgroundColor: palette.surface },
  fieldIcon: { fontSize: 15, width: 20, textAlign: 'center', color: palette.inkFaint },
  fieldInput: { flex: 1, paddingVertical: spacing.md, color: palette.ink, fontSize: 15, fontWeight: '600', ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null) },

  hint: { ...typo.micro, color: palette.away, fontWeight: '700', marginLeft: spacing.xs },
  banner: { backgroundColor: palette.dangerSoft, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  bannerOk: { backgroundColor: palette.successSoft },
  bannerText: { color: palette.danger, fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  bannerTextOk: { color: palette.success },

  ctaShell: { marginTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden', ...elevation.card },
  ctaDisabled: { opacity: 0.45 },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  cta: { minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  ctaText: { color: palette.white, fontWeight: '900', fontSize: 15, letterSpacing: 0.3 },

  trust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: palette.hairline,
    alignSelf: 'stretch',
  },
  trustLock: { fontSize: 15 },
  trustText: { flex: 1, ...typo.micro, fontWeight: '600', lineHeight: 15 },

  foot: { marginTop: spacing.xl, ...typo.micro, color: palette.inkFaint },

  codeBlock: { marginTop: spacing.lg, gap: spacing.xs, alignItems: 'center' },
  code: { color: palette.azureDeep, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  warning: { marginTop: spacing.lg, color: palette.away, fontWeight: '800', textAlign: 'center', fontSize: 12 },
});
