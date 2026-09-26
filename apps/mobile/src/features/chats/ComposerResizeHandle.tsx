import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { radius } from '../../theme/tokens';
import { useComposerResizeHandleDrag } from '../../lib/composerResize';

/** Drag handle rendered above the message TextInput to resize its height —
 * vertical counterpart to App.tsx's SidebarResizeHandle. Desktop web only:
 * DirectConversationScreen and GroupEncryptedChat both mount it only when
 * `Platform.OS === 'web'`, matching the rest of the desktop-only chrome. */
export function ComposerResizeHandle({
  onResize,
  onResizeEnd,
  accentColor,
  gripColor,
}: {
  onResize: (deltaY: number) => void;
  onResizeEnd: () => void;
  accentColor: string;
  gripColor: string;
}) {
  const { active, setActive } = useComposerResizeHandleDrag(onResize, onResizeEnd);

  return (
    <View
      testID="desktop-composer-resize-handle"
      accessibilityRole="none"
      style={[
        styles.handle,
        active && { backgroundColor: accentColor + '22' },
        Platform.OS === 'web' ? ({ cursor: 'row-resize' } as any) : null,
      ]}
      // @ts-expect-error web-only DOM mouse handler, harmless no-op on native
      onMouseDown={(e: any) => { e.preventDefault?.(); setActive(true); }}
    >
      <View style={[styles.grip, { backgroundColor: gripColor }, active && { backgroundColor: accentColor, width: 56 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  handle: {
    height: 8, marginVertical: -3, zIndex: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', width: '100%',
  },
  grip: { height: 3, width: 36, borderRadius: radius.pill },
});
