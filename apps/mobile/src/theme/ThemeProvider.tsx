import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  brandGradient,
  buildType,
  darkPalette,
  elevation,
  layout,
  lightPalette,
  motion,
  presenceColorFor,
  presenceDot,
  presenceLabel,
  radius,
  spacing,
  type Palette,
  type TypeTokens,
} from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

const STORAGE_KEY = 'kssenger_theme_mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Same on-device storage split used across K-ssenger: localStorage on web,
// SecureStore on native. Best-effort — a failed read/write just falls back
// to "system", it never blocks the app.
async function readStoredMode(): Promise<ThemeMode | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(STORAGE_KEY) ?? null : await SecureStore.getItemAsync(STORAGE_KEY);
    return isThemeMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function writeStoredMode(mode: ThemeMode): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(STORAGE_KEY, mode);
    else await SecureStore.setItemAsync(STORAGE_KEY, mode);
  } catch {
    /* best effort — the toggle still works for the rest of this session */
  }
}

export type ThemeContextValue = {
  /** The user's stored preference — may be 'system'. */
  mode: ThemeMode;
  /** The actual scheme currently applied (system resolved to light/dark). */
  scheme: ResolvedScheme;
  colors: Palette;
  type: TypeTokens;
  elevation: typeof elevation;
  spacing: typeof spacing;
  radius: typeof radius;
  motion: typeof motion;
  layout: typeof layout;
  brandGradient: typeof brandGradient;
  presenceColor: Record<string, string>;
  presenceLabel: typeof presenceLabel;
  presenceDot: typeof presenceDot;
  setMode: (mode: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let active = true;
    void readStoredMode().then((stored) => {
      if (active && stored) setModeState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void writeStoredMode(next);
  }, []);

  const scheme: ResolvedScheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = scheme === 'dark' ? darkPalette : lightPalette;
  const typeTokens = useMemo(() => buildType(colors), [colors]);
  const presence = useMemo(() => presenceColorFor(colors), [colors]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      colors,
      type: typeTokens,
      elevation,
      spacing,
      radius,
      motion,
      layout,
      brandGradient,
      presenceColor: presence,
      presenceLabel,
      presenceDot,
      setMode,
    }),
    [mode, scheme, colors, typeTokens, presence, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read the active theme tokens + a setter to change mode. Must be used under `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
