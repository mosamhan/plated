import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { radius } from '@/theme/palettes';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'md' | 'lg';
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  size = 'md',
}: Props) {
  const { colors } = useTheme();

  const bg =
    variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.surface : 'transparent';
  const fg =
    variant === 'primary' ? colors.accentText : variant === 'ghost' ? colors.accent : colors.text;
  const border = variant === 'secondary' ? colors.border : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          paddingVertical: size === 'lg' ? 16 : 12,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} />}
          <Text style={[styles.label, { color: fg, fontSize: size === 'lg' ? 16 : 15 }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  label: { fontWeight: '700', letterSpacing: -0.2 },
});
