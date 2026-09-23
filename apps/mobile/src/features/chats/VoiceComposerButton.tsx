import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, type Palette } from '../../theme/tokens';
import { useVoiceRecorder, type VoiceRecordingResult } from '../../lib/voiceRecording';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Hold-to-record mic button, WhatsApp/Snap-style. Press and hold starts
 * recording with a live running timer; release sends the clip; the "Annuler"
 * pill that appears alongside the timer cancels it. (A drag-to-cancel gesture
 * would need react-native-gesture-handler, not in this app's dependency
 * tree — tap-to-cancel is the honest, dependency-free equivalent.)
 *
 * The mic itself is a SINGLE element for the whole gesture: it never
 * unmounts between "idle" and "recording", it just restyles — swapping to a
 * different element mid-gesture would drop the browser's pointer capture.
 * On web this binds real DOM `pointerdown`/`pointerup`/`pointercancel`
 * listeners directly (react-native-web's Pressable onPressIn/onPressOut
 * proved unreliable for a *held* gesture — release could fire before the
 * async permission/prepare chain even set "recording", stranding the UI).
 * Native keeps Pressable's onPressIn/onPressOut, which is the normal,
 * reliable path there.
 */
export function VoiceComposerButton({ colors, disabled, onRecorded, onRecordingStateChange }: {
  colors: Palette;
  disabled?: boolean;
  onRecorded: (result: VoiceRecordingResult) => void;
  onRecordingStateChange?: (recording: boolean) => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recorder = useVoiceRecorder();
  const pulse = useRef(new Animated.Value(1)).current;
  const cancelledRef = useRef(false);
  const activeRef = useRef(false);
  const micRef = useRef<View>(null);

  useEffect(() => {
    const active = recorder.isRecording || recorder.isBusy;
    if (active === activeRef.current) return;
    activeRef.current = active;
    onRecordingStateChange?.(active);
  }, [recorder.isRecording, recorder.isBusy, onRecordingStateChange]);

  useEffect(() => {
    if (!recorder.isRecording) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.25, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [recorder.isRecording, pulse]);

  const handleGrant = () => { cancelledRef.current = false; void recorder.start(); };

  const handleRelease = async () => {
    if (cancelledRef.current) return;
    const result = await recorder.stopAndKeep();
    if (result) onRecorded(result);
  };

  const handleCancel = async () => {
    cancelledRef.current = true;
    await recorder.cancel();
  };

  // The web pointer listeners below are wired up ONCE (empty deps — they
  // must survive this row's own layout changing shape mid-gesture, see
  // comment on `onUp`) but always need this render's `recorder`-bound
  // handlers (recorder.start/stopAndKeep/cancel change identity with
  // `phase`), not the ones captured when the effect first ran — otherwise
  // release() keeps checking a permanently stale "idle" phase and the
  // recording it started can never be stopped. Refs bridge that gap.
  const handleGrantRef = useRef(handleGrant);
  const handleReleaseRef = useRef(handleRelease);
  const handleCancelRef = useRef(handleCancel);
  const disabledRef = useRef(disabled);
  handleGrantRef.current = handleGrant;
  handleReleaseRef.current = handleRelease;
  handleCancelRef.current = handleCancel;
  disabledRef.current = disabled;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = micRef.current as unknown as HTMLElement | null;
    if (!node) return;
    let held = false;
    // Listening at `document`, capture phase, ahead of react-native-web's
    // own root-level event delegation (which calls stopPropagation on its
    // way down, so a listener on the button node itself — even in capture
    // phase — never sees the event). Filtering by `node.contains(target)`
    // keeps this scoped to just this button.
    const onDown = (e: PointerEvent) => {
      if (disabledRef.current || held || !node.contains(e.target as Node)) return;
      held = true;
      handleGrantRef.current();
    };
    // Once held, release/cancel fire regardless of the current pointer
    // target: starting the recording changes this row's layout (the mic
    // button shifts next to the new "Annuler"/timer pill), so the pointer
    // that went down over the button can end up over a sibling by the time
    // it comes back up — release-anywhere is also just the standard,
    // forgiving behaviour for a hold gesture.
    const onUp = () => { if (!held) return; held = false; void handleReleaseRef.current(); };
    const onCancelEvt = () => { if (!held) return; held = false; void handleCancelRef.current(); };
    document.addEventListener('pointerdown', onDown, { capture: true });
    document.addEventListener('pointerup', onUp, { capture: true });
    document.addEventListener('pointercancel', onCancelEvt, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', onDown, { capture: true });
      document.removeEventListener('pointerup', onUp, { capture: true });
      document.removeEventListener('pointercancel', onCancelEvt, { capture: true });
    };
  }, []);

  const active = recorder.isRecording || recorder.isBusy;

  return (
    <View style={active ? styles.recordingRow : undefined}>
      {active && (
        <Pressable onPress={() => void handleCancel()} accessibilityRole="button" accessibilityLabel="Annuler l’enregistrement vocal" style={styles.cancelPill}>
          <Text style={styles.cancelText}>✕ Annuler</Text>
        </Pressable>
      )}
      {active && (
        <View style={styles.timerRow}>
          <Animated.View style={[styles.recDot, { transform: [{ scale: pulse }] }]} />
          <Text style={styles.timerText}>{formatDuration(recorder.durationMs)}</Text>
        </View>
      )}
      <Pressable
        ref={micRef}
        onPressIn={Platform.OS === 'web' ? undefined : handleGrant}
        onPressOut={Platform.OS === 'web' ? undefined : () => void handleRelease()}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Relâcher pour envoyer le message vocal' : 'Maintenir pour enregistrer un message vocal'}
        style={[styles.mic, active && styles.micActive, disabled && styles.disabled]}
      >
        <Text style={styles.micIcon}>🎙️</Text>
      </Pressable>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    mic: { width: 46, height: 46, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline },
    micActive: { backgroundColor: palette.dangerSoft, borderColor: palette.danger },
    micIcon: { fontSize: 19 },
    disabled: { opacity: 0.4 },
    recordingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    cancelPill: { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline },
    cancelText: { fontSize: 12, fontWeight: '800', color: palette.inkFaint },
    timerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' },
    recDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: palette.danger },
    timerText: { fontSize: 14, fontWeight: '800', color: palette.ink, fontVariant: ['tabular-nums'] },
  });
}
