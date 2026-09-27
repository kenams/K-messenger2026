import { Platform, useWindowDimensions } from 'react-native';

/** Web viewport wide enough for the full-screen desktop (MSN-style) shell.
 * Native Android/iOS and narrow web never qualify. */
export const DESKTOP_MIN_WIDTH = 900;

export function useIsDesktopWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}
