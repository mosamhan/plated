import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { radius } from '@/theme/palettes';

interface Props extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  prefix?: string;
}

export function TextField({ label, icon, prefix, style, secureTextEntry, ...rest }: Props) {
  const { colors } = useTheme();
  // Only meaningful when the field actually asked to be masked — a plain
  // field never grows an eye button. Defaults to masked (matching plain
  // `secureTextEntry`'s own default behavior) whenever the caller passes it.
  const [revealed, setRevealed] = useState(false);
  const isPassword = secureTextEntry !== undefined;

  return (
    <View style={styles.wrap}>
      {label && <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>}
      <View
        style={[
          styles.field,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        {icon && <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: 8 }} />}
        {prefix && <Text style={[styles.prefix, { color: colors.textMuted }]}>{prefix}</Text>}
        <TextInput
          // iOS's UITextField bakes bullet-masking into already-typed
          // characters — flipping `secureTextEntry` alone doesn't redraw them.
          // Remounting on toggle forces a fresh native field that renders the
          // (controlled, so not lost) value under the new mode from scratch.
          key={isPassword ? String(revealed) : undefined}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }, style]}
          secureTextEntry={isPassword ? secureTextEntry && !revealed : secureTextEntry}
          {...rest}
        />
        {isPassword && (
          <Pressable onPress={() => setRevealed((v) => !v)} hitSlop={8} style={{ marginLeft: 8 }}>
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7, marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  prefix: { fontSize: 15, fontWeight: '600' },
  input: { flex: 1, fontSize: 15, fontWeight: '500', paddingVertical: 12 },
});
