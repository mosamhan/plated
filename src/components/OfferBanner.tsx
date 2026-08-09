import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { showAlert } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import { RestaurantOffer } from '@/data/types';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * One coupon row. `general` copies its code to the clipboard right here —
 * it's good anywhere, so there's nothing further to hand off to.
 * `plated_exclusive` instead opens the countdown redeem screen: it only means
 * something in front of the restaurant's own staff.
 */
export function OfferBanner({ offer }: { offer: RestaurantOffer }) {
  const { colors } = useTheme();
  const router = useRouter();
  const exclusive = offer.offerType === 'plated_exclusive';

  const onPress = async () => {
    tapLight();
    if (exclusive) {
      router.push(`/offer/${offer.id}`);
      return;
    }
    if (offer.promoCode) {
      await Clipboard.setStringAsync(offer.promoCode);
      showAlert('Code copied', `${offer.promoCode} — paste it at checkout.`);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
      <Ionicons name={exclusive ? 'ticket' : 'pricetag'} size={18} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {offer.title}
        </Text>
        {!!offer.description && (
          <Text style={[styles.desc, { color: colors.textMuted }]} numberOfLines={1}>
            {offer.description}
          </Text>
        )}
      </View>
      <Text style={[styles.cta, { color: colors.accent }]}>
        {exclusive ? 'Redeem' : offer.promoCode ? 'Copy code' : 'Details'}
      </Text>
    </Pressable>
  );
}

/** Stacks every active offer for a restaurant — usually one, occasionally a couple. */
export function OfferBannerList({ offers }: { offers: RestaurantOffer[] }) {
  if (offers.length === 0) return null;
  return (
    <View style={styles.list}>
      {offers.map((o) => (
        <OfferBanner key={o.id} offer={o} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 13, fontWeight: '800' },
  desc: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  cta: { fontSize: 12, fontWeight: '800' },
});
