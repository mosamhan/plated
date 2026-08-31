import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { SavedAccount } from '@/lib/accountStore';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * One row in the Account Center. Deliberately its own individually-rounded
 * card rather than a merged SettingsRow list — matching the reference
 * screenshots' layout — while still using Plated's own color/radius tokens
 * instead of copying Instagram/Meta's literal palette.
 */
export function AccountRow({
  account,
  active,
  onPress,
  onLongPress,
  onRemove,
}: {
  account: SavedAccount;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** A visible, explicit remove control (trailing trash icon) — long-press alone isn't discoverable. Never shown for the active account. */
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Avatar uri={account.avatar} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {account.name || account.email}
        </Text>
        {!!account.handle && (
          <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
            @{account.handle}
          </Text>
        )}
      </View>
      {!active && onRemove && (
        <Pressable onPress={onRemove} hitSlop={10} style={{ padding: 2 }}>
          <Ionicons name="trash-outline" size={19} color={colors.ratingLow} />
        </Pressable>
      )}
      {active ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: '700' },
  handle: { fontSize: 13, fontWeight: '500', marginTop: 1 },
});
