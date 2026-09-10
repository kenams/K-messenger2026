import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EMOJI_TRAY } from '../../lib/chatExtras';
import { palette, radius, spacing } from '../../theme/tokens';

export function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
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

const styles = StyleSheet.create({
  wrap: { backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.hairline },
  scroll: { maxHeight: 216 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.sm, gap: 2 },
  cell: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 26 },
});
