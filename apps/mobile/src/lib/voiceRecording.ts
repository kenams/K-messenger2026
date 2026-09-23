import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { SupportedMediaMime } from './media';

/** Same recorder mime `expo-audio`'s web MediaRecorder actually produces (see RecordingConstants). */
export const VOICE_MIME: SupportedMediaMime = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';

export const VOICE_MAX_DURATION_MS = 120_000;

export type VoiceRecordingResult = { uri: string; durationMs: number };

type RecorderPhase = 'idle' | 'requesting' | 'recording' | 'finishing';

/**
 * Hold-to-record voice note lifecycle, backed by `expo-audio`'s single
 * `AudioRecorder`/`MediaRecorder` abstraction — same API surface on native
 * and web (web internally uses `MediaRecorder`, output `audio/webm`).
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const startedAtRef = useRef(0);

  useEffect(() => () => { if (recorder.isRecording) void recorder.stop().catch(() => undefined); }, [recorder]);

  const start = useCallback(async (): Promise<boolean> => {
    if (phase !== 'idle') return false;
    setPhase('requesting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { setPhase('idle'); return false; }
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAtRef.current = Date.now();
      setPhase('recording');
      return true;
    } catch {
      setPhase('idle');
      return false;
    }
  }, [phase, recorder]);

  /** Stops and returns the recorded clip, or null if it was too short to be worth sending. */
  const stopAndKeep = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    if (phase !== 'recording') return null;
    setPhase('finishing');
    try {
      await recorder.stop();
      const durationMs = Math.round(Date.now() - startedAtRef.current);
      const uri = recorder.uri;
      if (!uri || durationMs < 500) return null;
      return { uri, durationMs: Math.min(durationMs, VOICE_MAX_DURATION_MS) };
    } finally {
      setPhase('idle');
    }
  }, [phase, recorder]);

  const cancel = useCallback(async (): Promise<void> => {
    if (phase !== 'recording') return;
    setPhase('finishing');
    try {
      await recorder.stop();
    } finally {
      setPhase('idle');
    }
  }, [phase, recorder]);

  return {
    isRecording: phase === 'recording',
    isBusy: phase === 'requesting' || phase === 'finishing',
    durationMs: state.durationMillis ?? 0,
    start,
    stopAndKeep,
    cancel,
  };
}
