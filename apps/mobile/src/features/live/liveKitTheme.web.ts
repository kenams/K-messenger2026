// Overrides for @livekit/components-styles' default theme so K-Live's control
// bar (mic/camera/share/chat/leave) reads with K-ssenger's own brand colours
// instead of LiveKit's unstyled defaults (which is what shipped: LiveKitRoom
// never got a `data-lk-theme` attribute, so none of the library's own CSS
// variables applied and every control fell back to browser-default text on
// a transparent background — the near-black-on-black toolbar Kenams flagged).
//
// Injected once into <head> from LiveScreen.tsx (web only). Kept as a plain
// CSS string, not StyleSheet.create, because these are real CSS custom
// properties consumed by LiveKit's own stylesheet — React Native's style
// system has no equivalent.
export const LIVEKIT_THEME_STYLE_ID = 'kssenger-livekit-theme';

export function buildLiveKitThemeCss(dark: boolean): string {
  // Pulled straight from theme/tokens.ts (darkPalette / lightPalette) so this
  // never drifts from the app's own KAH Digital palette.
  const c = dark
    ? {
        bg: '#090C14', // navyDeep
        bg2: '#0F1420', // navy
        bg3: 'rgba(214,179,106,0.14)',
        bg4: 'rgba(214,179,106,0.24)',
        bg5: 'rgba(214,179,106,0.34)',
        fg: '#F5F1E8', // ink (dark theme)
        fg2: '#E9E2D4',
        fg3: '#B7B1A5', // inkSoft
        border: 'rgba(214,179,106,0.28)',
        accentBg: '#D6B36A', // brass/azure (dark)
        accentFg: '#090C14',
        danger: '#F0645C',
        dangerFg: '#FFF8EC',
      }
    : {
        bg: '#1C140B',
        bg2: '#0F1420', // navy card colour, same in both themes
        bg3: 'rgba(214,179,106,0.20)',
        bg4: 'rgba(214,179,106,0.32)',
        bg5: 'rgba(214,179,106,0.42)',
        fg: '#FFF8EC', // inkOnAzure — ivory text on the navy control bar
        fg2: '#F6EBD6',
        fg3: '#D9CBAE',
        border: 'rgba(214,179,106,0.35)',
        accentBg: '#A67C3D', // azure (light)
        accentFg: '#FFF8EC',
        danger: '#C6362C',
        dangerFg: '#FFFFFF',
      };

  return `
.kssenger-live[data-lk-theme='default'] {
  --lk-bg: ${c.bg};
  --lk-bg2: ${c.bg2};
  --lk-bg3: ${c.bg3};
  --lk-bg4: ${c.bg4};
  --lk-bg5: ${c.bg5};
  --lk-fg: ${c.fg};
  --lk-fg2: ${c.fg2};
  --lk-fg3: ${c.fg3};
  --lk-fg4: ${c.fg3};
  --lk-fg5: ${c.fg3};
  --lk-border-color: ${c.border};
  --lk-accent-fg: ${c.accentFg};
  --lk-accent-bg: ${c.accentBg};
  --lk-danger: ${c.danger};
  --lk-danger-fg: ${c.dangerFg};
  --lk-control-fg: ${c.fg};
  --lk-control-bg: ${c.bg2};
  --lk-control-hover-bg: ${c.bg3};
  --lk-control-active-bg: ${c.bg4};
  --lk-control-active-hover-bg: ${c.bg5};
  --lk-border-radius: 14px;
  --lk-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.kssenger-live .lk-control-bar {
  background: ${c.bg};
  border-top: 1px solid ${c.border};
  gap: 10px;
  padding: 12px 16px;
}
.kssenger-live .lk-button, .kssenger-live .lk-disconnect-button, .kssenger-live .lk-chat-toggle {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.1px;
}
.kssenger-live .lk-disconnect-button {
  border: 1px solid ${c.danger};
  color: ${c.danger};
}
.kssenger-live .lk-chat, .kssenger-live .lk-device-menu {
  background: ${c.bg2};
  color: ${c.fg};
  border-color: ${c.border};
}
`;
}

/** Injects (or updates) the override stylesheet once per page. Web only. */
export function ensureLiveKitTheme(dark: boolean) {
  if (typeof document === 'undefined') return;
  let tag = document.getElementById(LIVEKIT_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = LIVEKIT_THEME_STYLE_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = buildLiveKitThemeCss(dark);
}
