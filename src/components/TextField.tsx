import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { radius } from '@/theme/palettes';

interface Props extends TextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  prefix?: string;
}

export function TextField({ label, icon, prefix, style, ...rest }: Props) {
  const { colors } = useTheme();
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
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }, style]}
          {...rest}
        />
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
