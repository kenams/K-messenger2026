import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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

  const handlePressIn = () => { cancelledRef.current = false; void recorder.start(); };

  const handlePressOut = async () => {
    if (cancelledRef.current) return;
    const result = await recorder.stopAndKeep();
    if (result) onRecorded(result);
  };

  const handleCancel = async () => {
    cancelledRef.current = true;
    await recorder.cancel();
  };

  if (recorder.isRecording || recorder.isBusy) {
    return (
      <View style={styles.recordingRow}>
        <Pressable onPress={() => void handleCancel()} accessibilityRole="button" accessibilityLabel="Annuler l’enregistrement vocal" style={styles.cancelPill}>
          <Text style={styles.cancelText}>✕ Annuler</Text>
        </Pressable>
        <View style={styles.timerRow}>
          <Animated.View style={[styles.recDot, { transform: [{ scale: pulse }] }]} />
          <Text style={styles.timerText}>{formatDuration(recorder.durationMs)}</Text>
        </View>
        <Pressable
          onPressOut={() => void handlePressOut()}
          accessibilityRole="button"
          accessibilityLabel="Relâcher pour envoyer le message vocal"
          style={[styles.mic, styles.micActive]}
        >
          <Text style={styles.micIcon}>🎙️</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPressIn={handlePressIn}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Maintenir pour enregistrer un message vocal"
      style={[styles.mic, disabled && styles.disabled]}
    >
      <Text style={styles.micIcon}>🎙️</Text>
    </Pressable>
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
