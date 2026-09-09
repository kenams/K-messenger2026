import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { brandGradient, elevation, palette, presenceColor, radius, spacing, type as typo } from './tokens';

/** Respect the OS "reduce motion" setting for every decorative animation. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setReduced(value));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * Route the Android hardware back button to an in-app handler while a screen
 * is mounted, so "back" navigates within K-ssenger instead of leaving the app.
 * No-op on web / iOS. Pass `undefined` to disable.
 */
export function useAndroidBack(handler?: () => void): void {
  useEffect(() => {
    if (Platform.OS !== 'android' || !handler) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handler();
      return true;
    });
    return () => sub.remove();
  }, [handler]);
}

/** Soft vertical sky wash used behind buddy-list style screens. */
export function SkyBackground({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.sky, style]}>
      <View style={styles.skyBand} pointerEvents="none" />
      {children}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {right}
    </View>
  );
}

/** Presence indicator with a gentle breathing pulse when online. */
export function PresenceBadge({
  presence,
  size = 14,
  ring = true,
}: {
  presence: string;
  size?: number;
  ring?: boolean;
}) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || presence !== 'online') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, presence, pulse]);

  const color = presenceColor[presence] ?? palette.offline;
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {presence === 'online' && !reduced && (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            transform: [{ scale: haloScale }],
            opacity: haloOpacity,
          }}
        />
      )}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: ring ? 2.5 : 0,
          borderColor: palette.white,
        }}
      />
    </View>
  );
}

/** Animated equalizer — the live "now playing" signature. */
export function Equalizer({ color = palette.music, bars = 4, size = 14 }: { color?: string; bars?: number; size?: number }) {
  const reduced = useReducedMotion();
  const values = useRef(Array.from({ length: bars }, () => new Animated.Value(0.35))).current;

  useEffect(() => {
    if (reduced) {
      values.forEach((v) => v.setValue(0.6));
      return;
    }
    const anims = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(v, { toValue: 1, duration: 300 + i * 70, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0.25, duration: 260 + i * 60, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [reduced, values]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: size, gap: 2 }}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 2.5,
            borderRadius: 2,
            backgroundColor: color,
            height: v.interpolate({ inputRange: [0, 1], outputRange: [size * 0.25, size] }),
          }}
        />
      ))}
    </View>
  );
}

/** Full-screen shake used for an incoming K-Pulse (MSN "nudge"). */
export function useNudgeShake(): { style: { transform: { translateX: Animated.AnimatedInterpolation<number> }[] }; trigger: () => void } {
  const reduced = useReducedMotion();
  const shake = useRef(new Animated.Value(0)).current;
  const trigger = useMemo(
    () => () => {
      if (reduced) return;
      shake.setValue(0);
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -0.4, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    },
    [reduced, shake],
  );
  const style = {
    transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }) }],
  };
  return { style, trigger };
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  tone = 'azure',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'azure' | 'music';
}) {
  const off = disabled || busy;
  const gradient = tone === 'music'
    ? ([palette.music, '#5F3EEA'] as const)
    : brandGradient;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.9}
      disabled={off}
      onPress={onPress}
      style={[styles.primaryShell, off && styles.disabled]}
    >
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary} pointerEvents="none">
        {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryText}>{label}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** Quick inline sheet to set / clear the live "now playing" track. */
export function NowPlayingSheet({
  visible,
  initialTitle,
  initialArtist,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initialTitle: string;
  initialArtist: string;
  onClose: () => void;
  onSubmit: (title: string, artist: string) => Promise<void> | void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState(initialArtist);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setArtist(initialArtist);
      setBusy(false);
    }
  }, [visible, initialTitle, initialArtist]);

  const submit = async (nextTitle: string, nextArtist: string) => {
    setBusy(true);
    try {
      await onSubmit(nextTitle.trim().slice(0, 120), nextArtist.trim().slice(0, 120));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetTitleRow}>
            <Equalizer size={16} />
            <Text style={styles.sheetTitle}>J'écoute en ce moment</Text>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Titre du morceau"
            placeholderTextColor={palette.inkFaint}
            style={styles.sheetInput}
            maxLength={120}
            autoFocus
          />
          <TextInput
            value={artist}
            onChangeText={setArtist}
            placeholder="Artiste"
            placeholderTextColor={palette.inkFaint}
            style={styles.sheetInput}
            maxLength={120}
          />
          <PrimaryButton
            label={busy ? 'Diffusion…' : 'Partager à mes contacts'}
            tone="music"
            busy={busy}
            disabled={!title.trim()}
            onPress={() => void submit(title, artist)}
          />
          <TouchableOpacity style={styles.sheetClear} disabled={busy} onPress={() => void submit('', '')}>
            <Text style={styles.sheetClearText}>Arrêter le partage</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Buddy-list style top bar with an optional back affordance and trailing slot. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Retour" style={styles.headerBack}>
          <Text style={styles.headerBackText}>‹</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.headerBrand}>K-SSENGER</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

/** Glass panel used for every list row / grouped block. */
export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Circular / rounded avatar built from an initial, with optional presence badge. */
export function Avatar({
  label,
  uri,
  size = 48,
  presence,
}: {
  label: string;
  uri?: string | null;
  size?: number;
  presence?: string;
}) {
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.32 }]} />
      ) : (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.32 }]}>
          <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{label?.[0]?.toUpperCase() ?? 'K'}</Text>
        </View>
      )}
      {presence ? (
        <View style={styles.avatarBadge}>
          <PresenceBadge presence={presence} size={Math.max(12, size * 0.28)} />
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon = '💬', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'danger' }) {
  return (
    <View style={[styles.notice, tone === 'danger' && styles.noticeDanger]}>
      <Text style={[styles.noticeText, tone === 'danger' && styles.noticeTextDanger]}>{children}</Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={palette.inkFaint} {...input} style={[styles.fieldInput, input.style]} />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sky: { flex: 1, backgroundColor: palette.sky },
  skyBand: { position: 'absolute', top: 0, left: 0, right: 0, height: 260, backgroundColor: palette.skyTop },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionLabel: { ...typo.label, textTransform: 'uppercase' },
  primaryShell: { borderRadius: radius.md, overflow: 'hidden', ...elevation.card },
  primary: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primaryText: { color: palette.white, fontWeight: '900', fontSize: 14.5, letterSpacing: 0.3 },
  disabled: { opacity: 0.4 },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(11,33,46,0.42)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: palette.hairline, marginBottom: spacing.xs },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetTitle: { ...typo.heading },
  sheetInput: {
    backgroundColor: palette.sky,
    borderWidth: 1,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: palette.ink,
    fontSize: 15,
  },
  sheetClear: { alignItems: 'center', paddingVertical: spacing.sm },
  sheetClearText: { color: palette.inkSoft, fontWeight: '800', fontSize: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  headerBack: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.xs, backgroundColor: palette.surfaceSunken },
  headerBackText: { fontSize: 26, lineHeight: 26, color: palette.azureDeep, fontWeight: '900', marginTop: -2 },
  headerText: { flex: 1 },
  headerBrand: { ...typo.brand, fontSize: 9.5, letterSpacing: 2.4 },
  headerTitle: { ...typo.title, fontSize: 20, marginTop: 2 },
  headerSubtitle: { ...typo.meta, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.hairline,
    padding: spacing.md,
    ...elevation.card,
  },

  avatar: { backgroundColor: palette.azure, borderWidth: 2, borderColor: palette.white, alignItems: 'center', justifyContent: 'center', ...elevation.hairline },
  avatarText: { color: palette.white, fontWeight: '900' },
  avatarBadge: { position: 'absolute', right: -3, bottom: -3 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.xs },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { ...typo.name, textAlign: 'center' },
  emptyHint: { ...typo.meta, textAlign: 'center', maxWidth: 300 },

  notice: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: palette.azureSoft },
  noticeDanger: { backgroundColor: palette.dangerSoft },
  noticeText: { color: palette.azureDeep, fontSize: 12, fontWeight: '700' },
  noticeTextDanger: { color: palette.danger },

  field: { gap: spacing.xs },
  fieldLabel: { ...typo.label, textTransform: 'uppercase' },
  fieldInput: {
    backgroundColor: palette.surfaceSunken,
    borderWidth: 1.5,
    borderColor: palette.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 50,
    color: palette.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  fieldHint: { ...typo.micro, fontWeight: '500' },

  segment: { flexDirection: 'row', margin: spacing.lg, padding: 4, borderRadius: radius.lg, backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline },
  segmentItem: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center' },
  segmentItemActive: { backgroundColor: palette.surface, ...elevation.hairline },
  segmentText: { color: palette.inkSoft, fontWeight: '800', fontSize: 13 },
  segmentTextActive: { color: palette.azureDeep },
});
