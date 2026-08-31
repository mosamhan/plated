import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tick } from '@/lib/haptics';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Everything that used to be scattered across Ranks — the Restaurants/Plates
 * chooser (a popup on every entry) and the Near/Global pill (its own row
 * under the filters) — gathered into one menu, opened from the location chip
 * up in the header. One place for "what am I ranking, and where".
 */
export function RankSettingsSheet({
  visible,
  onClose,
  kind,
  onChangeKind,
  scope,
  onChangeScope,
  nearLabel,
  onEditNearLocation,
}: {
  visible: boolean;
  onClose: () => void;
  kind: 'restaurants' | 'plates';
  onChangeKind: (kind: 'restaurants' | 'plates') => void;
  scope: 'near' | 'global';
  onChangeScope: (scope: 'near' | 'global') => void;
  /** The location "Near" is currently resolving to — device location, or a picked city. */
  nearLabel: string;
  onEditNearLocation: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const kindSeg = (val: 'restaurants' | 'plates', label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const on = kind === val;
    return (
      <Pressable
        onPress={() => {
          tick();
          onChangeKind(val);
        }}
        style={[styles.seg, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }]}>
        <Ionicons name={icon} size={16} color={on ? colors.accent : colors.textMuted} />
        <Text style={[styles.segText, { color: colors.text }]}>{label}</Text>
      </Pressable>
    );
  };

  const scopeSeg = (val: 'near' | 'global', label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const on = scope === val;
    return (
      <Pressable
        onPress={() => {
          tick();
          onChangeScope(val);
        }}
        style={[styles.seg, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }]}>
        <Ionicons name={icon} size={16} color={on ? colors.accent : colors.textMuted} />
        <Text style={[styles.segText, { color: colors.text }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>Ranks settings</Text>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RANK</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            {kindSeg('restaurants', 'Restaurants', 'storefront-outline')}
            {kindSeg('plates', 'Plates', 'restaurant-outline')}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LOCATION</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {scopeSeg('near', 'Near', 'location')}
            {scopeSeg('global', 'Global', 'earth')}
          </View>
          {scope === 'near' && (
            <Pressable
              onPress={() => {
                tick();
                onEditNearLocation();
              }}
              style={[styles.linkRow, { borderBottomColor: 'transparent' }]}>
              <Ionicons name="location-outline" size={20} color={colors.accent} />
              <Text style={[styles.linkLabel, { color: colors.text }]}>Ranking near</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted }} numberOfLines={1}>
                {nearLabel}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: 12 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segText: { fontWeight: '700', fontSize: 14 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    marginTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
});
