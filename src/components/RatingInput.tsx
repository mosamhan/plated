import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { radius, ratingColor } from '@/theme/palettes';

interface Props {
  value: number;
  onChange: (value: number) => void;
}

const clamp = (n: number) => Math.max(0, Math.min(10, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Dish rating selector (the core Plated action). Supports three ways to set a
 * precise 0–10.0 score: type an exact value, tap a block for a whole number,
 * or nudge by 0.1 with the steppers.
 */
export function RatingInput({ value, onChange }: Props) {
  const { colors } = useTheme();
  const color = ratingColor(colors, value);
  const [text, setText] = useState(value.toFixed(1));

  // Type an exact value — accept partial input like "8." while editing.
  const onType = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    setText(cleaned);
    const n = parseFloat(cleaned);
    if (!isNaN(n) && n >= 0 && n <= 10) onChange(round1(n));
  };

  // Normalize on blur (empty / out-of-range → snap back).
  const onBlur = () => {
    const n = parseFloat(text);
    const v = isNaN(n) ? value : round1(clamp(n));
    onChange(v);
    setText(v.toFixed(1));
  };

  // Set from a block tap or a stepper — keeps the text field in sync.
  const setVal = (n: number) => {
    const v = round1(clamp(n));
    onChange(v);
    setText(v.toFixed(1));
  };

  return (
    <View>
      <View style={styles.headerRow}>
        <TextInput
          value={text}
          onChangeText={onType}
          onBlur={onBlur}
          keyboardType="decimal-pad"
          returnKeyType="done"
          maxLength={4}
          selectTextOnFocus
          style={[styles.big, { color }]}
        />
        <Text style={[styles.outOf, { color: colors.textMuted }]}>/ 10</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setVal(value - 0.1)}
          style={[styles.step, { borderColor: colors.border, backgroundColor: colors.surface }]}
          hitSlop={6}>
          <Text style={[styles.stepTxt, { color: colors.text }]}>−</Text>
        </Pressable>
        <Pressable
          onPress={() => setVal(value + 0.1)}
          style={[styles.step, { borderColor: colors.border, backgroundColor: colors.surface, marginLeft: 8 }]}
          hitSlop={6}>
          <Text style={[styles.stepTxt, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>

      <View style={styles.segments}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const filled = n <= value;
          return (
            <Pressable
              key={n}
              onPress={() => setVal(n)}
              style={[styles.segment, { backgroundColor: filled ? color : colors.surface, borderColor: colors.border }]}
            />
          );
        })}
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Type an exact score, tap a block, or nudge with − / +
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  big: { fontSize: 44, fontWeight: '900', letterSpacing: -1, minWidth: 96, padding: 0 },
  outOf: { fontSize: 18, fontWeight: '700', marginLeft: 6, marginBottom: 7 },
  step: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  segments: { flexDirection: 'row', gap: 5 },
  segment: {
    flex: 1,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: { fontSize: 12, fontWeight: '600', marginTop: 10 },
});
