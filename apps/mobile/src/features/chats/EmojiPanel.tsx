import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EMOJI_TRAY } from '../../lib/chatExtras';
import { radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

export function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const { styles } = useThemedStyles();
  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
        {EMOJI_TRAY.map((emoji, i) => (
          <TouchableOpacity
            key={`${emoji}-${i}`}
            style={styles.cell}
            onPress={() => onPick(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`Emoji ${emoji}`}
          >
            <Text style={styles.emoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  wrap: { backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.hairline },
  scroll: { maxHeight: 216 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm, gap: 2 },
  cell: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 26 },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
