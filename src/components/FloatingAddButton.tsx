import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { radius } from '@/theme/palettes';

interface Props {
  onPress: () => void;
  label?: string;
}

export function FloatingAddButton({ onPress, label }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: colors.accent,
            shadowColor: colors.shadow,
            opacity: pressed ? 0.9 : 1,
            paddingHorizontal: label ? 20 : 0,
            width: label ? undefined : 58,
          },
        ]}>
        <Ionicons name="add" size={28} color={colors.accentText} />
        {label && <Text style={[styles.label, { color: colors.accentText }]}>{label}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 18, bottom: 28 },
  btn: {
    height: 58,
    minWidth: 58,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { fontSize: 15, fontWeight: '800', marginLeft: 4 },
});
