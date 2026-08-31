import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/ScreenHeader';
import { formatCount } from '@/components/StatPill';
import { creatorEligibilityCounts, evaluateCreatorEligibility } from '@/lib/creatorEligibility';
import { foodPlaceholder } from '@/data/images';
import { PREVIEW_ATTRIBUTIONS } from '@/data/social';
import { openInApp } from '@/lib/external';
import { buildInviteMessage, INVITE_LINK } from '@/lib/invite';
import { checkCreatorEligibility, requestCashout, startStripeOnboarding } from '@/lib/monetization';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PAYOUT_MINIMUM = 25;

/**
 * Creator earnings dashboard.
 *
 * Compliance notes (FTC 16 CFR 465):
 * - Earnings accrue on ATTRIBUTED ORDERS regardless of the rating given —
 *   never contingent on positive reviews.
 * - Confirmed/Estimated states mirror affiliate-network reality (orders
 *   confirm on ~30-day schedules); no real-time "you earned $X" at hand-off.
 */
export default function CreatorDashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { currentUser, orders, ordersByUser, attributions: liveAttributions, refreshAttributions, refresh } = useData();
  const { platos } = usePlatos();

  const eligible = currentUser.compensationEligible;
  const myPlates = ordersByUser(currentUser.id);
  const myPlatos = useMemo(() => platos.filter((p) => p.creatorId === currentUser.id), [platos, currentUser.id]);
  const counts = creatorEligibilityCounts({ followers: currentUser.followers, plates: myPlates, platos: myPlatos });
  const { criteria, meetsAll } = evaluateCreatorEligibility(counts);

  // Once the client sees all five thresholds met, ask the server to
  // re-verify and flip compensation_eligible for real — the client's own
  // math is never trusted for the actual write. Guarded so it only fires
  // once per mount even if this re-renders before the refresh lands.
  const checkedRef = useRef(false);
  useEffect(() => {
    if (eligible || !meetsAll || checkedRef.current) return;
    checkedRef.current = true;
    checkCreatorEligibility().then((flipped) => {
      if (flipped) refresh();
    });
  }, [eligible, meetsAll, refresh]);

  // Real numbers once there's a live account and eligibility to back them —
  // otherwise the same clearly-labeled preview this screen has always shown.
  // (Not "real but empty": an eligible live account with zero earnings so far
  // should see real zeros, not the preview's numbers.)
  const live = isSupabaseConfigured;
  const attributions = live && eligible ? liveAttributions : PREVIEW_ATTRIBUTIONS;
  const totals = attributions.reduce(
    (acc, a) => ({
      orders: acc.orders + a.attributedOrders,
      estimated: acc.estimated + a.estimated,
      confirmed: acc.confirmed + a.confirmed,
      paid: acc.paid + a.paid,
    }),
    { orders: 0, estimated: 0, confirmed: 0, paid: 0 },
  );
  // What's actually cash-out-able right now: confirmed minus what's already
  // been swept into a payout (confirmed includes paid — see mapAttributions).
  const availableToCashOut = totals.confirmed - totals.paid;

  const [stripeLoading, setStripeLoading] = useState(false);
  const [cashoutLoading, setCashoutLoading] = useState(false);

  const handleStripeSetup = async () => {
    if (stripeLoading) return;
    setStripeLoading(true);
    const url = await startStripeOnboarding();
    setStripeLoading(false);
    if (url) openInApp(url);
    else Alert.alert('Could not start payout setup', 'Try again in a moment.');
  };

  const handleCashout = async () => {
    if (cashoutLoading) return;
    setCashoutLoading(true);
    const result = await requestCashout();
    setCashoutLoading(false);
    if (result.ok) {
      Alert.alert('Cashout requested', `$${(result.amountCents / 100).toFixed(2)} is on its way.`);
      refreshAttributions();
    } else {
      Alert.alert('Could not request cashout', result.message);
    }
  };

  // Dashboard shares always carry the #ad disclosure — this is the screen
  // that promises "Shares include the required #ad disclosure automatically."
  const shareInvite = () =>
    Share.share({ message: buildInviteMessage({ earns: true }) }).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Creator dashboard" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Zone 1: balance hero */}
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={[styles.hero, { backgroundColor: colors.accentSoft }]}>
          {!eligible && (
            <View style={[styles.previewPill, { backgroundColor: colors.accent }]}>
              <Ionicons name="eye-outline" size={12} color={colors.accentText} />
              <Text style={[styles.previewPillText, { color: colors.accentText }]}>
                PREVIEW — become a Plated Creator to unlock
              </Text>
            </View>
          )}
          <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Confirmed earnings</Text>
          <Text style={[styles.heroAmount, { color: colors.text, fontFamily: displayFont }]}>
            ${totals.confirmed}
          </Text>
          <View style={styles.heroStates}>
            <HeroState label="Estimated" value={`$${totals.estimated}`} hint="confirms in ~30 days" />
            <HeroState label="Confirmed" value={`$${totals.confirmed}`} hint="ready for payout" />
            <HeroState label="Paid out" value={`$${totals.paid}`} hint="all time" />
          </View>
          <Text style={[styles.heroNext, { color: colors.textMuted }]}>
            ${PAYOUT_MINIMUM} minimum per payout · earnings accrue on attributed orders regardless
            of your ratings
          </Text>
          {eligible && availableToCashOut >= PAYOUT_MINIMUM && (
            <Pressable
              onPress={handleCashout}
              disabled={cashoutLoading}
              style={[styles.cashoutBtn, { backgroundColor: colors.accent, opacity: cashoutLoading ? 0.6 : 1 }]}>
              <Text style={[styles.cashoutText, { color: colors.accentText }]}>
                {cashoutLoading ? 'Requesting…' : `Request $${availableToCashOut} cashout`}
              </Text>
            </Pressable>
          )}
        </Animated.View>

        {/* Eligibility progress (pre-eligibility users) */}
        {!eligible && (
          <Animated.View
            entering={FadeInDown.delay(60).duration(300)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[typography.heading, { color: colors.text }]}>Become a Plated Creator</Text>
            <Text style={[styles.tip, { color: colors.textMuted, marginTop: 2 }]}>
              Meet all five to unlock payouts — this keeps the program for people actually making
              quality content, not just accounts with a lot of followers.
            </Text>
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {criteria.map((c) => (
                <View key={c.key}>
                  <View style={styles.progressRow}>
                    <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                      {c.label} · {formatCount(c.value)} / {formatCount(c.threshold)}
                    </Text>
                    {c.met && <Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.surface }]}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${c.progress * 100}%`, backgroundColor: colors.accent },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
            <Text style={[styles.tip, { color: colors.textMuted, marginTop: spacing.md }]}>
              Grow faster: drop your invite link on Instagram, TikTok &amp; YouTube. Every plate you
              post is a storefront.
            </Text>
          </Animated.View>
        )}

        {/* Zone 2: per-plate attribution */}
        <Animated.View entering={FadeInDown.delay(120).duration(300)}>
          <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl, marginBottom: 4 }]}>
            Earnings by plate
          </Text>
          <Text style={[styles.qualify, { color: colors.textMuted }]}>
            A qualifying event is a completed order started from your plate within 7 days of the tap.
          </Text>
          <View style={{ gap: 10, marginTop: spacing.md }}>
            {attributions.map((a) => {
              const plate = orders.find((o) => o.id === a.plateId);
              if (!plate) return null;
              return (
                <Pressable
                  key={a.plateId}
                  onPress={() => router.push(`/order/${plate.id}`)}
                  style={[styles.plateRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Image
                    source={{ uri: plate.photo }}
                    placeholder={foodPlaceholder(plate.id)}
                    style={[styles.plateImg, { backgroundColor: colors.surface }]}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>
                      {plate.dishName}
                    </Text>
                    <Text style={[styles.plateMeta, { color: colors.textMuted }]}>
                      {a.attributedOrders} attributed orders
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.plateEarn, { color: colors.text }]}>${a.confirmed}</Text>
                    <Text style={[styles.plateEst, { color: colors.textMuted }]}>
                      +${a.estimated - a.confirmed} pending
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Invite link */}
        <Animated.View
          entering={FadeInDown.delay(180).duration(300)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: spacing.xl }]}>
          <Text style={[typography.heading, { color: colors.text }]}>Your invite link</Text>
          <Pressable onPress={shareInvite} style={[styles.inviteRow, { backgroundColor: colors.surface }]}>
            <Ionicons name="link" size={16} color={colors.accent} />
            <Text style={[styles.inviteText, { color: colors.text }]} numberOfLines={1}>
              {INVITE_LINK}
            </Text>
            <View style={[styles.shareBtn, { backgroundColor: colors.accent }]}>
              <Text style={[styles.shareText, { color: colors.accentText }]}>Share</Text>
            </View>
          </Pressable>
          <Text style={[styles.tip, { color: colors.textMuted }]}>
            Shares include the required “#ad” disclosure automatically.
          </Text>
        </Animated.View>

        {/* Zone 3: housekeeping */}
        <Animated.View
          entering={FadeInDown.delay(240).duration(300)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: spacing.lg }]}>
          <HouseRow
            icon="card-outline"
            label="Payout method"
            value={stripeLoading ? 'Opening…' : 'Set up'}
            onPress={handleStripeSetup}
            disabled={stripeLoading}
          />
          <HouseRow icon="document-text-outline" label="Tax info (W-9)" value="Required before first payout" />
          <HouseRow icon="school-outline" label="Program rules & FTC disclosure guide" value="" last />
        </Animated.View>

        <Text style={[styles.legal, { color: colors.textMuted }]}>
          Creators must be 18+ with a valid tax ID. Earnings accrue on attributed orders regardless
          of rating — Plated never pays for positive reviews, and low ratings are never hidden.
        </Text>
      </ScrollView>
    </View>
  );
}

function HeroState({ label, value, hint }: { label: string; value: string; hint: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.heroState}>
      <Text style={[styles.heroStateValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.heroStateLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.heroStateHint, { color: colors.textMuted }]}>{hint}</Text>
    </View>
  );
}

function HouseRow({
  icon,
  label,
  value,
  last,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[styles.houseRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[styles.houseLabel, { color: colors.text }]}>{label}</Text>
      {!!value && <Text style={[styles.houseValue, { color: colors.textMuted }]}>{value}</Text>}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  previewPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  heroLabel: { fontSize: 13, fontWeight: '700' },
  heroAmount: { fontSize: 52, letterSpacing: -1, marginTop: 4 },
  heroStates: { flexDirection: 'row', marginTop: spacing.lg, alignSelf: 'stretch' },
  heroState: { flex: 1, alignItems: 'center' },
  heroStateValue: { fontSize: 17, fontWeight: '800' },
  heroStateLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  heroStateHint: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  heroNext: { fontSize: 11, fontWeight: '500', marginTop: spacing.lg, textAlign: 'center', lineHeight: 16 },
  cashoutBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.pill,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  cashoutText: { fontSize: 15, fontWeight: '800' },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  progressLabel: { fontSize: 13, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  tip: { fontSize: 12, fontWeight: '500', marginTop: spacing.md, lineHeight: 17 },
  qualify: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  plateImg: { width: 50, height: 50, borderRadius: radius.md },
  plateName: { fontSize: 14, fontWeight: '800' },
  plateMeta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  plateEarn: { fontSize: 16, fontWeight: '800' },
  plateEst: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  inviteText: { flex: 1, fontSize: 13, fontWeight: '600' },
  shareBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill },
  shareText: { fontSize: 13, fontWeight: '800' },
  houseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  houseLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  houseValue: { fontSize: 12, fontWeight: '500', maxWidth: 150, textAlign: 'right' },
  legal: { fontSize: 11, fontWeight: '500', lineHeight: 16, marginTop: spacing.xl, textAlign: 'center' },
});
