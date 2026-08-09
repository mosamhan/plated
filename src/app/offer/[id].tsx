import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { tick } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** "4:32" — always mm:ss, never bare seconds past a minute. */
function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * "Show this screen to your server" — a Plated-exclusive offer's redeem
 * screen. The countdown is deterrence, not the enforcement: the real
 * anti-abuse rule is the one-time `offer_redemptions` row (0029_restaurant_offers.sql),
 * written the instant this screen opens, so a screenshot only ever proves the
 * one redemption that already happened, not a fresh one on demand.
 */
export default function RedeemOffer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { offerFor, restaurantFor, isOfferRedeemed, redeemOffer } = useData();

  const offer = offerFor(id);
  const restaurant = offer ? restaurantFor(offer.restaurantId) : undefined;

  // Captured once, before this visit's redeemOffer() call below can flip it —
  // this is what tells a revisit apart from the first, real redemption.
  const [alreadyRedeemed] = useState(() => (offer ? isOfferRedeemed(offer.id) : false));

  useEffect(() => {
    if (offer && !alreadyRedeemed) redeemOffer(offer.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id, alreadyRedeemed]);

  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(() => Date.now());
  useEffect(() => {
    if (alreadyRedeemed) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [alreadyRedeemed]);

  const windowMs = (offer?.redeemWindowSeconds ?? 300) * 1000;
  const remainingMs = Math.max(0, windowMs - (now - startedAt));
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const expired = !alreadyRedeemed && remainingMs <= 0;

  useEffect(() => {
    if (remainingSeconds <= 10 && remainingSeconds > 0) tick();
  }, [remainingSeconds]);

  if (!offer) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader closeMode title="Offer" />
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textMuted }]}>This offer isn&apos;t available anymore.</Text>
        </View>
      </View>
    );
  }

  const done = alreadyRedeemed || expired;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader closeMode title="Redeem" />
      <View style={styles.center}>
        {!done ? (
          <>
            <Text style={[styles.countdown, { color: colors.accent, fontFamily: displayFont }]}>
              {formatCountdown(remainingSeconds)}
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Show this screen to your server</Text>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={56} color={colors.accent} />
            <Text style={[styles.hint, { color: colors.textMuted, marginTop: spacing.md }]}>
              {expired ? 'This redemption has expired' : 'Already redeemed'}
            </Text>
          </>
        )}

        <View style={[styles.card, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Text style={[styles.title, { color: colors.text }]}>{offer.title}</Text>
          {!!offer.description && (
            <Text style={[styles.desc, { color: colors.textMuted }]}>{offer.description}</Text>
          )}
          {!!restaurant && (
            <Text style={[styles.restaurant, { color: colors.textMuted }]}>{restaurant.name}</Text>
          )}
        </View>

        <Text style={[styles.legal, { color: colors.textMuted }]}>
          Redeemable once per account · Plated-exclusive
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  countdown: { fontSize: 64, letterSpacing: -1 },
  hint: { fontSize: 14, fontWeight: '600', marginTop: spacing.sm },
  body: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  desc: { fontSize: 13, fontWeight: '500', marginTop: 4, textAlign: 'center' },
  restaurant: { fontSize: 12, fontWeight: '700', marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  legal: { fontSize: 11, fontWeight: '500', marginTop: spacing.xl, textAlign: 'center' },
});
