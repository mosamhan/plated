import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RatingBadge } from '@/components/RatingBadge';
import { openDirections, openReservation } from '@/lib/external';
import { tapMedium } from '@/lib/haptics';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  name: string;
  cuisine?: string;
  location?: string;
  lat?: number;
  lng?: number;
  /** Plated's Rating, if this restaurant is already on Plated. */
  rating?: number;
  primaryLabel: string;
  primaryIcon?: keyof typeof Ionicons.glyphMap;
  onPrimary: () => void;
}

export function RestaurantActionSheet({
  visible,
  onClose,
  name,
  cuisine,
  location,
  lat,
  lng,
  rating,
  primaryLabel,
  primaryIcon = 'arrow-forward',
  onPrimary,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const place = { name, location, lat, lng };

  const Action = ({
    icon,
    color,
    label,
    sub,
    onPress,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    label: string;
    sub: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.aLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.aSub, { color: colors.textMuted }]}>{sub}</Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                {cuisine}{location ? ` · ${location}` : ''}
              </Text>
            </View>
            {rating != null && rating > 0 && <RatingBadge score={rating} size="md" />}
          </View>

          <Pressable
            onPress={() => {
              tapMedium();
              onClose();
              setTimeout(onPrimary, 120);
            }}
            style={[styles.primary, { backgroundColor: colors.accent }]}>
            <Ionicons name={primaryIcon} size={18} color={colors.accentText} />
            <Text style={[styles.primaryText, { color: colors.accentText }]}>{primaryLabel}</Text>
          </Pressable>

          <Text style={[styles.group, { color: colors.textMuted }]}>DIRECTIONS</Text>
          <View style={{ gap: 8 }}>
            <Action icon="navigate" color="#4285F4" label="Google Maps" sub="Directions" onPress={() => openDirections('google', place)} />
            <Action icon="map" color="#34A853" label="Apple Maps" sub="Directions" onPress={() => openDirections('apple', place)} />
          </View>

          <Text style={[styles.group, { color: colors.textMuted }]}>RESERVE A TABLE</Text>
          <View style={{ gap: 8 }}>
            <Action icon="restaurant" color="#DA3743" label="OpenTable" sub="Find a reservation" onPress={() => openReservation('opentable', place)} />
            <Action icon="search" color="#6B7280" label="Search reservations" sub="Resy, Tock & more" onPress={() => openReservation('search', place)} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: 12 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  meta: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
  },
  primaryText: { fontSize: 15, fontWeight: '800' },
  group: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  aLabel: { fontSize: 15, fontWeight: '700' },
  aSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
});
