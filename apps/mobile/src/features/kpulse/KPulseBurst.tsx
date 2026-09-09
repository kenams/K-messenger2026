import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { brandGradient, palette, radius, spacing, type as typo } from '../../theme/tokens';
import { useReducedMotion } from '../../theme/components';
import { playKPulseSound, vibrateKPulse } from '../../lib/kpulse';

const BURST_MS = 1450;

type BurstState = { id: number; from?: string } | null;

/**
 * The K-Pulse "wizz" — K-ssenger's signature interrupt. An incoming pulse
 * takes over the screen: a sonar shockwave rings out, the K monogram slams
 * in with a brass halo, the frame jolts, and a two-note ping fires. It is a
 * deliberate, one-off intrusion — short, loud, unmistakably K-ssenger.
 *
 * `fire(fromName?)` plays it; `node` is the overlay to mount once at the root.
 */
export function useKPulse(): { fire: (from?: string) => void; node: React.ReactNode } {
  const [burst, setBurst] = useState<BurstState>(null);
  const seq = useRef(0);

  const fire = useCallback((from?: string) => {
    seq.current += 1;
    setBurst({ id: seq.current, from });
  }, []);

  const node = burst ? (
    <KPulseBurstView
      key={burst.id}
      from={burst.from}
      onDone={() => setBurst((current) => (current?.id === burst.id ? null : current))}
    />
  ) : null;

  return { fire, node };
}

function KPulseBurstView({ from, onDone }: { from?: string; onDone: () => void }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const monogram = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    playKPulseSound();
    vibrateKPulse();

    const flashHit = reduced
      ? Animated.delay(0)
      : Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]);

    const backdropIn = Animated.sequence([
      Animated.timing(backdrop, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(BURST_MS - 520),
      Animated.timing(backdrop, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]);

    const monogramIn = Animated.sequence([
      Animated.timing(monogram, { toValue: 1.16, duration: 190, easing: Easing.out(Easing.back(2.6)), useNativeDriver: true }),
      Animated.spring(monogram, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.delay(BURST_MS - 900),
      Animated.timing(monogram, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);

    const rings = Animated.timing(progress, {
      toValue: 1,
      duration: BURST_MS - 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    const jolt = reduced
      ? Animated.delay(0)
      : Animated.sequence(
          [12, -11, 9, -7, 5, -3, 0].map((to) =>
            Animated.timing(shake, { toValue: to, duration: 55, useNativeDriver: true }),
          ),
        );

    const run = Animated.parallel([backdropIn, monogramIn, rings, jolt, flashHit]);
    run.start(() => onDone());
    return () => run.stop();
  }, [reduced, backdrop, monogram, progress, shake, flash, onDone]);

  const ringData = useMemo(() => [0, 0.16, 0.32], []);

  return (
    <Modal transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      <Animated.View
        testID="kpulse-burst"
        style={[
          styles.fill,
          styles.center,
          { transform: reduced ? [] : [{ translateX: shake }] },
        ]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.backdrop, { opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.82] }) }]} />
        <Animated.View style={[styles.flash, { opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]} />

        {!reduced &&
          ringData.map((offset, i) => {
            const local = Animated.subtract(progress, offset);
            return (
              <Animated.View
                key={i}
                style={[
                  styles.ring,
                  {
                    opacity: local.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 0.55, 0.08, 0], extrapolate: 'clamp' }),
                    transform: [
                      { scale: local.interpolate({ inputRange: [0, 1], outputRange: [0.2, 3.4], extrapolate: 'clamp' }) },
                    ],
                    borderColor: i === 1 ? palette.brass : palette.azure,
                  },
                ]}
              />
            );
          })}

        <Animated.View
          style={[
            styles.monoWrap,
            {
              opacity: monogram.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
              transform: [{ scale: monogram }],
            },
          ]}
        >
          <View style={styles.halo} />
          <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mono}>
            <Text style={styles.monoText}>K</Text>
          </LinearGradient>
          <Text style={styles.label}>⚡ K-Pulse</Text>
          {from ? <Text style={styles.from}>de {from}</Text> : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const RING = 220;

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  center: { alignItems: 'center', justifyContent: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#06121F' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#EAF2FF' },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
  },
  monoWrap: { alignItems: 'center', gap: spacing.sm },
  halo: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    top: -22,
    backgroundColor: palette.brass,
    opacity: 0.28,
  },
  mono: {
    width: 124,
    height: 124,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  monoText: { color: palette.white, fontWeight: '900', fontSize: 66, letterSpacing: -2 },
  label: { ...typo.brand, color: palette.white, fontSize: 13, letterSpacing: 3, marginTop: spacing.md },
  from: { color: 'rgba(255,255,255,0.75)', fontWeight: '800', fontSize: 13 },
});
