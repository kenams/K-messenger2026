import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  brandGradient,
  buildType,
  elevation,
  layout,
  motion,
  presenceColorFor,
  presenceDot,
  presenceLabel,
  radius,
  skinLabel,
  skinPalettes,
  skinSwatch,
  spacing,
  type Palette,
  type ThemeSkin,
  type TypeTokens,
} from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';
export type { ThemeSkin };

const STORAGE_KEY = 'kssenger_theme_mode';
const SKIN_STORAGE_KEY = 'kssenger_theme_skin';

const SKIN_VALUES: ThemeSkin[] = ['classic', 'pro', 'douceur', 'sport', 'aurora', 'anthracite'];

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isThemeSkin(value: string | null): value is ThemeSkin {
  return !!value && (SKIN_VALUES as string[]).includes(value);
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

async function readStoredSkin(): Promise<ThemeSkin | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(SKIN_STORAGE_KEY) ?? null : await SecureStore.getItemAsync(SKIN_STORAGE_KEY);
    return isThemeSkin(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function writeStoredSkin(skin: ThemeSkin): Promise<void> {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(SKIN_STORAGE_KEY, skin);
    else await SecureStore.setItemAsync(SKIN_STORAGE_KEY, skin);
  } catch {
    /* best effort */
  }
}

export type ThemeContextValue = {
  /** The user's stored preference — may be 'system'. */
  mode: ThemeMode;
  /** The actual scheme currently applied (system resolved to light/dark). */
  scheme: ResolvedScheme;
  /** Visual skin, orthogonal to light/dark — Classique/Pro/Douceur/Sport/Aurora. */
  skin: ThemeSkin;
  skinLabel: typeof skinLabel;
  skinSwatch: typeof skinSwatch;
  setSkin: (skin: ThemeSkin) => void;
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
  const [skin, setSkinState] = useState<ThemeSkin>('classic');

  useEffect(() => {
    let active = true;
    void readStoredMode().then((stored) => {
      if (active && stored) setModeState(stored);
    });
    void readStoredSkin().then((stored) => {
      if (active && stored) setSkinState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void writeStoredMode(next);
  }, []);

  const setSkin = useCallback((next: ThemeSkin) => {
    setSkinState(next);
    void writeStoredSkin(next);
  }, []);

  const scheme: ResolvedScheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = skinPalettes[skin][scheme];
  const typeTokens = useMemo(() => buildType(colors), [colors]);
  const presence = useMemo(() => presenceColorFor(colors), [colors]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      skin,
      skinLabel,
      skinSwatch,
      setSkin,
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
    [mode, scheme, skin, setSkin, colors, typeTokens, presence, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read the active theme tokens + a setter to change mode. Must be used under `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
