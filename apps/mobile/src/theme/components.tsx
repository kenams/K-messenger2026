import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { palette, presenceColor, radius, spacing, type as typo } from './tokens';

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
  const bg = tone === 'music' ? palette.music : palette.azure;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.primary, { backgroundColor: bg }, (disabled || busy) && styles.disabled]}
    >
      {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryText}>{label}</Text>}
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

const styles = StyleSheet.create({
  sky: { flex: 1, backgroundColor: palette.sky },
  skyBand: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, backgroundColor: palette.skyTop },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionLabel: { ...typo.label, textTransform: 'uppercase' },
  primary: {
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primaryText: { color: palette.white, fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },
  disabled: { opacity: 0.45 },
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
});
