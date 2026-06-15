import { Ionicons } from '@expo/vector-icons';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Order } from '@/data/types';
import { tapMedium } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The plate being ordered — hand-off records an attributed order on it. */
  order: Order;
  restaurantName: string;
  dishName: string;
  /** Handle of the person whose plate this is. */
  creatorHandle?: string;
  /** Whether ordering this plate pays commission to the creator. */
  supportsCreator?: boolean;
}

interface Provider {
  key: string;
  label: string;
  sub: string;
  action: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  url: (q: string) => string;
}

const PROVIDERS: Provider[] = [
  {
    key: 'doordash',
    label: 'DoorDash',
    sub: 'Delivery • ~25–40 min',
    action: 'Opens DoorDash',
    icon: 'bicycle',
    color: '#FF3008',
    url: (q) => `https://www.doordash.com/search/store/${q}`,
  },
  {
    key: 'ubereats',
    label: 'Uber Eats',
    sub: 'Delivery • ~20–35 min',
    action: 'Opens Uber Eats',
    icon: 'car',
    color: '#06C167',
    url: (q) => `https://www.ubereats.com/search?q=${q}`,
  },
  {
    key: 'pickup',
    label: 'Pickup',
    sub: 'Order ahead & grab it',
    action: 'Opens in browser',
    icon: 'bag-handle',
    color: '#3B82F6',
    url: (q) => `https://www.google.com/search?q=${q}+order+pickup`,
  },
];

export function OrderProviderSheet({
  visible,
  onClose,
  order,
  restaurantName,
  dishName,
  creatorHandle,
  supportsCreator,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { markReordered } = useData();

  const handlePick = (p: Provider) => {
    tapMedium();
    // Mock attribution: production appends subId1=creatorId, subId2=plateId,
    // subId3=sessionId for affiliate-network tracking.
    markReordered(order.id);
    const q = encodeURIComponent(restaurantName);
    Linking.openURL(p.url(q)).catch(() => {});
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>Order this exact plate</Text>
          <Text style={[styles.dish, { color: colors.textMuted }]} numberOfLines={1}>
            {dishName} · {restaurantName}
          </Text>

          {/* Dish-level emphasis — the thing restaurant-level apps can't do */}
          <View style={[styles.dishNote, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="restaurant" size={16} color={colors.accent} />
            <Text style={[styles.dishNoteText, { color: colors.text }]}>
              You&apos;re ordering the <Text style={{ fontWeight: '800' }}>specific dish</Text> that
              was rated — not just the restaurant.
            </Text>
          </View>

          {/* FTC: commission disclosure must come BEFORE the order action */}
          {supportsCreator && creatorHandle && (
            <View style={[styles.creatorNote, { borderColor: colors.border }]}>
              <Ionicons name="heart" size={15} color={colors.orderCta} />
              <Text style={[styles.creatorNoteText, { color: colors.textMuted }]}>
                Ordering through these links supports{' '}
                <Text style={{ color: colors.text, fontWeight: '800' }}>@{creatorHandle}</Text> —
                they earn a commission. Prices are the same for you.
              </Text>
            </View>
          )}

          <View style={{ marginTop: spacing.lg, gap: 10 }}>
            {PROVIDERS.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => handlePick(p)}
                style={({ pressed }) => [
                  styles.provider,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}>
                <View style={[styles.iconWrap, { backgroundColor: p.color }]}>
                  <Ionicons name={p.icon} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pLabel, { color: colors.text }]}>{p.label}</Text>
                  <Text style={[styles.pSub, { color: colors.textMuted }]}>{p.sub}</Text>
                </View>
                <View style={styles.actionCol}>
                  <Ionicons name="open-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.pAction, { color: colors.textMuted }]}>{p.action}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.note, { color: colors.textMuted }]}>
            We hand you off to the provider to complete your order. Orders are tracked for
            attribution and confirm in ~30 days.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  dish: { fontSize: 14, fontWeight: '500', marginTop: 3 },
  dishNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  dishNoteText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  creatorNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 2 },
  creatorNoteText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pLabel: { fontSize: 16, fontWeight: '700' },
  pSub: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  actionCol: { alignItems: 'center', gap: 2 },
  pAction: { fontSize: 10, fontWeight: '600' },
  note: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
