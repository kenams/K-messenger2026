import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/** Shared vertical resize behavior for the message composer text box on
 * desktop web (DMs and groups both use this) — mirrors the sidebar's
 * horizontal drag handle in App.tsx: mousedown on a handle above the input
 * tracks window mousemove/mouseup so the drag survives leaving the thin
 * handle strip, height is clamped, and the chosen height is persisted. */

export const COMPOSER_MIN_HEIGHT = 46;
export const COMPOSER_MAX_HEIGHT = 320;
export const COMPOSER_DEFAULT_HEIGHT = 46;
const COMPOSER_HEIGHT_STORAGE_KEY = 'kssenger.desktop.composerHeight';

function clamp(height: number): number {
  return Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, height));
}

function loadStoredComposerHeight(): number {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return COMPOSER_DEFAULT_HEIGHT;
  try {
    const raw = window.localStorage.getItem(COMPOSER_HEIGHT_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return COMPOSER_DEFAULT_HEIGHT;
    return clamp(parsed);
  } catch {
    return COMPOSER_DEFAULT_HEIGHT;
  }
}

function persistComposerHeight(height: number) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPOSER_HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // storage unavailable (private mode, quota) — height just won't persist
  }
}

/** Returns the current composer height plus a stable resize-handle callback
 * pair to wire onto a drag handle rendered above the TextInput. Height only
 * ever changes on desktop web; native/narrow web callers can ignore the
 * returned handlers (they're no-ops there since nothing mounts the handle). */
export function useResizableComposerHeight() {
  const [height, setHeight] = useState(loadStoredComposerHeight);
  const heightRef = useRef(height);
  heightRef.current = height;

  const handleResize = useCallback((deltaY: number) => {
    setHeight((prev) => clamp(prev - deltaY));
  }, []);
  const handleResizeEnd = useCallback(() => {
    persistComposerHeight(heightRef.current);
  }, []);

  return { height, handleResize, handleResizeEnd };
}

/** Hook backing the drag handle itself: tracks the active/dragging state and
 * wires window mousemove/mouseup while active, matching SidebarResizeHandle. */
export function useComposerResizeHandleDrag(onResize: (deltaY: number) => void, onResizeEnd: () => void) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    let lastY: number | null = null;
    const handleMove = (e: MouseEvent) => {
      if (lastY === null) { lastY = e.clientY; return; }
      const deltaY = e.clientY - lastY;
      lastY = e.clientY;
      onResize(deltaY);
    };
    const handleUp = () => { setActive(false); onResizeEnd(); };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onResize, onResizeEnd]);

  return { active, setActive };
}
