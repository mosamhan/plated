import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { SponsoredPlacement } from '@/data/types';
import { confirmAction } from '@/lib/dialog';
import { openInApp } from '@/lib/external';
import { tapLight } from '@/lib/haptics';
import { RestaurantTier, startRestaurantCheckout } from '@/lib/monetization';
import { supabase } from '@/lib/supabase';
import { mapSponsoredPlacement } from '@/store/mappers';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

// Mirrors TIER_PRICES_CENTS in supabase/functions/stripe-restaurant-checkout —
// TEST-MODE PLACEHOLDERS, swap in real numbers before going live. Different
// runtimes, no shared module, so kept in sync by hand.
const TIER_LABEL: Record<RestaurantTier, string> = { starter: 'Starter', growth: 'Growth' };
const TIER_PRICE_LABEL: Record<RestaurantTier, string> = { starter: '$49/mo', growth: '$149/mo' };
const MIN_COMMISSION_PERCENT = 5;
const MAX_COMMISSION_PERCENT = 30;

const PLACEMENT_LABEL: Record<SponsoredPlacement['placementType'], string> = {
  reel_ad: 'Reel ad',
  map_pin: 'Map pin',
  local_favorite: 'Local Favorites rail',
};

interface Billing {
  status: 'incomplete' | 'active' | 'past_due' | 'canceled';
  tier: string;
  monthlyRateCents: number | null;
  billingNote: string | null;
  feedBumpsRemaining: number;
  commissionPercent: number | null;
  commissionLockedAt: string | null;
}

const STATUS_LABEL: Record<Billing['status'], string> = {
  incomplete: 'Setting up',
  active: 'Active',
  past_due: 'Payment past due',
  canceled: 'Canceled',
};

interface TaggingCreator {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  blocked: boolean;
  /** Commission confirmed or paid so far from orders/Platos tagging this restaurant. */
  earnedCents: number;
}

interface OfferStat {
  id: string;
  title: string;
  redemptions: number;
}

interface Analytics {
  /** "Order this" taps on content tagging this restaurant — the reach signal that actually exists. */
  attributedClicks: number;
  estimatedCents: number;
  confirmedCents: number;
  paidCents: number;
}

interface MenuItem {
  id: string;
  name: string;
  priceCents: number | null;
}

/**
 * A claimed restaurant's own status screen. Self-serve tiers (starter,
 * growth) subscribe through stripe-restaurant-checkout right here; custom
 * pricing and which placements exist are still negotiated with an admin
 * outside the app (see 0032_restaurant_claims.sql). Once subscribed, an
 * owner can also pause/resume a placement they've already bought.
 */
export default function BusinessDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { restaurantFor, ownedRestaurantIds } = useData();
  const { userId } = useAuth();
  const restaurant = restaurantFor(id);
  const owns = ownedRestaurantIds.has(id);

  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [placements, setPlacements] = useState<SponsoredPlacement[]>([]);
  const [placementStatuses, setPlacementStatuses] = useState<Record<string, string>>({});
  const [creators, setCreators] = useState<TaggingCreator[]>([]);
  const [offerStats, setOfferStats] = useState<OfferStat[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics>({
    attributedClicks: 0,
    estimatedCents: 0,
    confirmedCents: 0,
    paidCents: 0,
  });
  const [selectedTier, setSelectedTier] = useState<RestaurantTier>('starter');
  const [commissionInput, setCommissionInput] = useState('15');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [editingPlacementId, setEditingPlacementId] = useState<string | null>(null);
  const [draftHeadline, setDraftHeadline] = useState('');
  const [draftMediaUrl, setDraftMediaUrl] = useState('');
  const [draftZips, setDraftZips] = useState('');
  const [savingPlacement, setSavingPlacement] = useState(false);

  useEffect(() => {
    if (!owns) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [subRes, placementsRes, orderCreatorsRes, platoCreatorsRes, blocksRes, earningsRes, clicksRes, offersRes, menuRes] =
        await Promise.all([
          supabase
            .from('restaurant_subscriptions')
            .select('status, tier, monthly_rate_cents, billing_note, feed_bumps_remaining, commission_percent, commission_locked_at')
            .eq('restaurant_id', id)
            .maybeSingle(),
          supabase.from('sponsored_placements').select('*').eq('restaurant_id', id),
          supabase.from('orders').select('user_id').eq('restaurant_id', id),
          supabase.from('plato_videos').select('user_id').eq('restaurant_id', id),
          supabase.from('restaurant_creator_blocks').select('creator_id').eq('restaurant_id', id),
          supabase.from('creator_earnings').select('creator_id, amount_cents, status').eq('restaurant_id', id),
          supabase.from('affiliate_clicks').select('id', { count: 'exact', head: true }).eq('restaurant_id', id),
          supabase.from('restaurant_offers').select('id, title').eq('restaurant_id', id),
          supabase.from('restaurant_menu_items').select('id, name, price_cents').eq('restaurant_id', id).order('position'),
        ]);
      if (!cancelled) {
        setMenuItems((menuRes.data ?? []).map((r) => ({ id: r.id, name: r.name, priceCents: r.price_cents })));
      }
      if (cancelled) return;
      if (subRes.data) {
        setBilling({
          status: subRes.data.status,
          tier: subRes.data.tier,
          monthlyRateCents: subRes.data.monthly_rate_cents,
          billingNote: subRes.data.billing_note,
          feedBumpsRemaining: subRes.data.feed_bumps_remaining,
          commissionPercent: subRes.data.commission_percent,
          commissionLockedAt: subRes.data.commission_locked_at,
        });
      }
      const rows = (placementsRes.data ?? []).map(mapSponsoredPlacement);
      setPlacements(rows);
      setPlacementStatuses(
        Object.fromEntries((placementsRes.data ?? []).map((r: any) => [r.id, r.status])),
      );

      // Earnings only count confirmed/paid — a pending affiliate-network
      // postback isn't real money yet, same rule the creator's own dashboard
      // uses (see mapAttributions).
      const earningsByCreator = new Map<string, number>();
      let estimatedCents = 0;
      let confirmedCents = 0;
      let paidCents = 0;
      for (const row of earningsRes.data ?? []) {
        if (row.status === 'voided') continue;
        estimatedCents += row.amount_cents;
        if (row.status === 'confirmed' || row.status === 'paid') {
          confirmedCents += row.amount_cents;
          earningsByCreator.set(row.creator_id, (earningsByCreator.get(row.creator_id) ?? 0) + row.amount_cents);
        }
        if (row.status === 'paid') paidCents += row.amount_cents;
      }
      if (!cancelled) {
        setAnalytics({ attributedClicks: clicksRes.count ?? 0, estimatedCents, confirmedCents, paidCents });
      }

      const offers = offersRes.data ?? [];
      if (offers.length > 0) {
        const offerIds = offers.map((o) => o.id);
        const redemptionsRes = await supabase.from('offer_redemptions').select('offer_id').in('offer_id', offerIds);
        const counts = new Map<string, number>();
        for (const r of redemptionsRes.data ?? []) counts.set(r.offer_id, (counts.get(r.offer_id) ?? 0) + 1);
        if (!cancelled) {
          setOfferStats(offers.map((o) => ({ id: o.id, title: o.title, redemptions: counts.get(o.id) ?? 0 })));
        }
      }

      const creatorIds = [
        ...new Set([
          ...(orderCreatorsRes.data ?? []).map((r) => r.user_id as string),
          ...(platoCreatorsRes.data ?? []).map((r) => r.user_id as string),
        ]),
      ];
      const blockedIds = new Set((blocksRes.data ?? []).map((r) => r.creator_id as string));
      if (creatorIds.length > 0) {
        const profilesRes = await supabase.from('profiles').select('id, name, handle, avatar_url').in('id', creatorIds);
        if (!cancelled) {
          setCreators(
            (profilesRes.data ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              handle: p.handle,
              avatarUrl: p.avatar_url,
              blocked: blockedIds.has(p.id),
              earnedCents: earningsByCreator.get(p.id) ?? 0,
            })),
          );
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, owns]);

  const toggleBlock = async (creatorId: string, block: boolean) => {
    if (!userId) return;
    if (block) {
      confirmAction({
        title: 'Block this creator?',
        message: "They'll no longer be able to earn commission on plates or Platos tagging you. This doesn't remove anything they've already posted.",
        confirmLabel: 'Block',
        destructive: true,
        onConfirm: async () => {
          setCreators((prev) => prev.map((c) => (c.id === creatorId ? { ...c, blocked: true } : c)));
          const { error } = await supabase
            .from('restaurant_creator_blocks')
            .insert({ restaurant_id: id, creator_id: creatorId, blocked_by: userId });
          if (error) setCreators((prev) => prev.map((c) => (c.id === creatorId ? { ...c, blocked: false } : c)));
        },
      });
      return;
    }
    tapLight();
    setCreators((prev) => prev.map((c) => (c.id === creatorId ? { ...c, blocked: false } : c)));
    const { error } = await supabase
      .from('restaurant_creator_blocks')
      .delete()
      .eq('restaurant_id', id)
      .eq('creator_id', creatorId);
    if (error) setCreators((prev) => prev.map((c) => (c.id === creatorId ? { ...c, blocked: true } : c)));
  };

  const subscribe = async () => {
    if (checkoutLoading) return;
    const commissionPercent = Number(commissionInput);
    if (!Number.isFinite(commissionPercent) || commissionPercent < MIN_COMMISSION_PERCENT || commissionPercent > MAX_COMMISSION_PERCENT) {
      Alert.alert('Invalid commission rate', `Enter a whole number between ${MIN_COMMISSION_PERCENT} and ${MAX_COMMISSION_PERCENT}.`);
      return;
    }
    setCheckoutLoading(true);
    const result = await startRestaurantCheckout(id, selectedTier, commissionPercent);
    setCheckoutLoading(false);
    if (result.ok) openInApp(result.url);
    else Alert.alert('Could not start checkout', result.message);
  };

  const togglePlacement = async (placementId: string, next: boolean) => {
    const nextStatus = next ? 'active' : 'paused';
    // Optimistic — this is the owner's own restaurant and a two-value toggle,
    // low stakes if it needs to snap back on a failed write.
    setPlacementStatuses((prev) => ({ ...prev, [placementId]: nextStatus }));
    tapLight();
    const { error } = await supabase
      .from('sponsored_placements')
      .update({ status: nextStatus })
      .eq('id', placementId);
    if (error) {
      setPlacementStatuses((prev) => ({ ...prev, [placementId]: next ? 'paused' : 'active' }));
    }
  };

  const startEditingPlacement = (p: SponsoredPlacement) => {
    tapLight();
    setEditingPlacementId(p.id);
    setDraftHeadline(p.headline ?? '');
    setDraftMediaUrl(p.mediaUrl ?? '');
    setDraftZips(p.targetZipCodes.join(', '));
  };

  const saveEditingPlacement = async () => {
    if (!editingPlacementId || savingPlacement) return;
    const targetZipCodes = draftZips
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean);
    setSavingPlacement(true);
    const { error } = await supabase
      .from('sponsored_placements')
      .update({
        headline: draftHeadline.trim() || null,
        media_url: draftMediaUrl.trim() || null,
        target_zip_codes: targetZipCodes,
      })
      .eq('id', editingPlacementId);
    setSavingPlacement(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setPlacements((prev) =>
      prev.map((p) =>
        p.id === editingPlacementId
          ? { ...p, headline: draftHeadline.trim() || undefined, mediaUrl: draftMediaUrl.trim() || undefined, targetZipCodes }
          : p,
      ),
    );
    setEditingPlacementId(null);
  };

  const addMenuItem = async () => {
    const name = newItemName.trim();
    if (!name || addingItem) return;
    const priceCents = newItemPrice.trim() ? Math.round(Number(newItemPrice) * 100) : null;
    setAddingItem(true);
    const { data, error } = await supabase
      .from('restaurant_menu_items')
      .insert({ restaurant_id: id, name, price_cents: priceCents, position: menuItems.length })
      .select('id, name, price_cents')
      .single();
    setAddingItem(false);
    if (error || !data) {
      Alert.alert('Could not add item', error?.message ?? 'Try again.');
      return;
    }
    setMenuItems((prev) => [...prev, { id: data.id, name: data.name, priceCents: data.price_cents }]);
    setNewItemName('');
    setNewItemPrice('');
  };

  const deleteMenuItem = async (item: MenuItem) => {
    tapLight();
    setMenuItems((prev) => prev.filter((m) => m.id !== item.id));
    const { error } = await supabase.from('restaurant_menu_items').delete().eq('id', item.id);
    if (error) {
      setMenuItems((prev) => [...prev, item]);
      Alert.alert('Could not remove item', error.message);
    }
  };

  if (!owns) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Business dashboard" />
        <Text style={[styles.blank, { color: colors.textMuted }]}>
          You don&apos;t manage this restaurant on Plated yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={restaurant?.name ?? 'Business dashboard'}
        rightLabel="Edit page"
        onRight={() => router.push(`/business/edit/${id}`)}
      />
      {loading ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textMuted }}>Loading…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          <SettingsSection title="Your page">
            <SettingsRow
              icon="storefront-outline"
              label="Name, photos & ordering"
              value="Edit"
              onPress={() => router.push(`/business/edit/${id}`)}
            />
          </SettingsSection>

          <SettingsSection title="Billing">
            <SettingsRow
              icon="ribbon-outline"
              label="Tier"
              value={billing?.tier ? billing.tier.replace('_', ' ') : '—'}
            />
            <SettingsRow
              icon="pricetag-outline"
              label="Your rate"
              value={
                billing?.monthlyRateCents != null
                  ? `$${(billing.monthlyRateCents / 100).toFixed(0)}/mo`
                  : 'Not set yet'
              }
            />
            <SettingsRow
              icon="cash-outline"
              label="Commission rate"
              value={billing?.commissionPercent != null ? `${billing.commissionPercent}%` : 'Not set yet'}
              description={billing?.commissionLockedAt ? 'Locked — email support to request a change' : undefined}
            />
            <SettingsRow
              icon="checkmark-circle-outline"
              label="Status"
              value={billing ? STATUS_LABEL[billing.status] : '—'}
            />
            <SettingsRow
              icon="megaphone-outline"
              label="Feed bumps remaining"
              value={billing ? String(billing.feedBumpsRemaining) : '0'}
              last
            />
          </SettingsSection>
          {!!billing?.billingNote && (
            <Text style={[styles.note, { color: colors.textMuted }]}>{billing.billingNote}</Text>
          )}

          {!billing?.commissionLockedAt && (
            <SettingsSection
              title="Subscribe"
              footer="Choose a tier and set your commission rate on reorders — this is locked in once your subscription activates, and can only be changed later through a manual request.">
              <View style={styles.tierRow}>
                {(['starter', 'growth'] as const).map((t) => {
                  const active = selectedTier === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        tapLight();
                        setSelectedTier(t);
                      }}
                      style={[
                        styles.tierPill,
                        { borderColor: colors.border, backgroundColor: active ? colors.accent : colors.card },
                      ]}>
                      <Text style={[styles.tierPillLabel, { color: active ? colors.accentText : colors.text }]}>
                        {TIER_LABEL[t]}
                      </Text>
                      <Text style={[styles.tierPillPrice, { color: active ? colors.accentText : colors.textMuted }]}>
                        {TIER_PRICE_LABEL[t]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.commissionInputWrap}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
                  Commission on reorders ({MIN_COMMISSION_PERCENT}–{MAX_COMMISSION_PERCENT}%)
                </Text>
                <TextInput
                  value={commissionInput}
                  onChangeText={setCommissionInput}
                  keyboardType="number-pad"
                  placeholder="15"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                />
              </View>
              <Pressable
                onPress={subscribe}
                disabled={checkoutLoading}
                style={[styles.subscribeBtn, { backgroundColor: colors.accent, opacity: checkoutLoading ? 0.6 : 1 }]}>
                <Text style={[styles.subscribeBtnText, { color: colors.accentText }]}>
                  {checkoutLoading ? 'Opening checkout…' : `Subscribe — ${TIER_PRICE_LABEL[selectedTier]}`}
                </Text>
              </Pressable>
            </SettingsSection>
          )}

          <SettingsSection title="Your placements" footer={
            placements.length === 0
              ? 'Nothing running yet — reach out to set up promotion.'
              : restaurant?.verified
                ? 'Pause a placement any time. Tap one to edit its headline, image, or which zip codes see it — leave zip codes blank to show it everywhere.'
                : 'Pause a placement any time; resuming picks up where it left off.'
          }>
            {placements.length === 0 ? (
              <SettingsRow icon="ellipse-outline" label="No active placements" last />
            ) : (
              placements.map((p, i) => (
                <View key={p.id}>
                  <Pressable
                    onPress={() => restaurant?.verified && startEditingPlacement(p)}
                    style={[
                      styles.placementRow,
                      i < placements.length - 1 && editingPlacementId !== p.id && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                    ]}>
                    <Ionicons name="pricetag" size={20} color={colors.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.placementLabel, { color: colors.text }]}>
                        {PLACEMENT_LABEL[p.placementType]}
                      </Text>
                      {!!p.headline && (
                        <Text style={[styles.placementHeadline, { color: colors.textMuted }]} numberOfLines={1}>
                          {p.headline}
                        </Text>
                      )}
                      <Text style={[styles.placementHeadline, { color: colors.textMuted }]} numberOfLines={1}>
                        {p.targetZipCodes.length === 0 ? 'Everywhere' : `Zips: ${p.targetZipCodes.join(', ')}`}
                      </Text>
                    </View>
                    <Switch
                      value={placementStatuses[p.id] === 'active'}
                      onValueChange={(v) => togglePlacement(p.id, v)}
                      disabled={!['active', 'paused'].includes(placementStatuses[p.id])}
                      trackColor={{ true: colors.accent, false: colors.border }}
                      thumbColor="#FFFFFF"
                    />
                  </Pressable>
                  {editingPlacementId === p.id && (
                    <View
                      style={[
                        styles.placementEdit,
                        i < placements.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}>
                      <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Headline</Text>
                      <TextInput
                        value={draftHeadline}
                        onChangeText={setDraftHeadline}
                        placeholder="e.g. 20% off this week"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      />
                      <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: spacing.md }]}>Image URL</Text>
                      <TextInput
                        value={draftMediaUrl}
                        onChangeText={setDraftMediaUrl}
                        placeholder="https://…"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      />
                      <Text style={[styles.inputLabel, { color: colors.textMuted, marginTop: spacing.md }]}>
                        Zip codes (comma-separated, blank = everywhere)
                      </Text>
                      <TextInput
                        value={draftZips}
                        onChangeText={setDraftZips}
                        placeholder="10001, 10002"
                        placeholderTextColor={colors.textMuted}
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                        <Pressable
                          onPress={() => setEditingPlacementId(null)}
                          style={[styles.editBtn, { backgroundColor: colors.surface }]}>
                          <Text style={[styles.editBtnText, { color: colors.text }]}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={saveEditingPlacement}
                          disabled={savingPlacement}
                          style={[styles.editBtn, { backgroundColor: colors.accent, opacity: savingPlacement ? 0.6 : 1 }]}>
                          <Text style={[styles.editBtnText, { color: colors.accentText }]}>
                            {savingPlacement ? 'Saving…' : 'Save'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </SettingsSection>

          <SettingsSection
            title="Analytics"
            footer="Commission accrues when a creator's tagged plate leads to a confirmed order — estimated until the network confirms it (~30 days), same as the creator's own dashboard.">
            <SettingsRow
              icon="navigate-outline"
              label="Order taps from creator content"
              value={String(analytics.attributedClicks)}
            />
            <SettingsRow
              icon="hourglass-outline"
              label="Estimated commission"
              value={`$${(analytics.estimatedCents / 100).toFixed(2)}`}
            />
            <SettingsRow
              icon="checkmark-done-outline"
              label="Confirmed commission"
              value={`$${(analytics.confirmedCents / 100).toFixed(2)}`}
            />
            <SettingsRow
              icon="card-outline"
              label="Paid out to creators"
              value={`$${(analytics.paidCents / 100).toFixed(2)}`}
              last={offerStats.length === 0}
            />
            {offerStats.map((o, i) => (
              <SettingsRow
                key={o.id}
                icon="ticket-outline"
                label={o.title}
                value={`${o.redemptions} redeemed`}
                last={i === offerStats.length - 1}
              />
            ))}
          </SettingsSection>

          {restaurant?.verified && (
            <SettingsSection
              title="Menu"
              footer="Add dishes here to seed your menu before anyone's rated them — items people actually rate on Plated always take priority over these.">
              {menuItems.length === 0 ? (
                <SettingsRow icon="restaurant-outline" label="No items added yet" />
              ) : (
                menuItems.map((m) => (
                  <View key={m.id} style={styles.menuItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.creatorName, { color: colors.text }]} numberOfLines={1}>
                        {m.name}
                      </Text>
                      {m.priceCents != null && (
                        <Text style={[styles.creatorHandle, { color: colors.textMuted }]}>
                          ${(m.priceCents / 100).toFixed(2)}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={() => deleteMenuItem(m)} hitSlop={8}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ))
              )}
              <View style={styles.menuAddRow}>
                <TextInput
                  value={newItemName}
                  onChangeText={setNewItemName}
                  placeholder="Dish name"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border }]}
                />
                <TextInput
                  value={newItemPrice}
                  onChangeText={setNewItemPrice}
                  placeholder="$"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  style={[styles.input, { width: 70, color: colors.text, borderColor: colors.border }]}
                />
                <Pressable
                  onPress={addMenuItem}
                  disabled={addingItem || !newItemName.trim()}
                  style={[
                    styles.editBtn,
                    { flex: 0, backgroundColor: colors.accent, opacity: addingItem || !newItemName.trim() ? 0.5 : 1, paddingHorizontal: spacing.lg },
                  ]}>
                  <Text style={[styles.editBtnText, { color: colors.accentText }]}>Add</Text>
                </Pressable>
              </View>
            </SettingsSection>
          )}

          <SettingsSection
            title="Creators"
            footer="Anyone who meets Plated's creator bar can tag you and earn your set commission by default — block a specific creator here if you don't want to be associated with them. This doesn't remove anything they've already posted.">
            {creators.length === 0 ? (
              <SettingsRow icon="people-outline" label="No creators have tagged you yet" last />
            ) : (
              creators.map((c, i) => (
                <View
                  key={c.id}
                  style={[
                    styles.creatorRow,
                    i < creators.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}>
                  {c.avatarUrl ? (
                    <Image source={{ uri: c.avatarUrl }} style={styles.creatorAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.creatorAvatar, { backgroundColor: colors.surface }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.creatorName, { color: colors.text }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={[styles.creatorHandle, { color: colors.textMuted }]} numberOfLines={1}>
                      @{c.handle}
                      {c.earnedCents > 0 ? ` · $${(c.earnedCents / 100).toFixed(2)} earned` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleBlock(c.id, !c.blocked)}
                    style={[
                      styles.blockBtn,
                      { backgroundColor: c.blocked ? colors.surface : colors.accentSoft, borderColor: colors.border },
                    ]}>
                    <Text style={[styles.blockBtnText, { color: c.blocked ? colors.textMuted : colors.accent }]}>
                      {c.blocked ? 'Unblock' : 'Block'}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </SettingsSection>

          <Text style={[styles.footer, { color: colors.textMuted }]}>
            Custom pricing and new placements are still set up directly with the Plated team —
            reach out any time to change what&apos;s running.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  blank: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500', paddingHorizontal: spacing.lg },
  note: { fontSize: 12, fontWeight: '500', marginTop: -spacing.md, marginBottom: spacing.lg, lineHeight: 17 },
  placementRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  placementLabel: { fontSize: 14, fontWeight: '700' },
  placementHeadline: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  placementEdit: { paddingHorizontal: 4, paddingBottom: spacing.md },
  editBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  editBtnText: { fontSize: 13, fontWeight: '800' },
  menuItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: spacing.lg },
  menuAddRow: { flexDirection: 'row', gap: 8, padding: spacing.lg, alignItems: 'center' },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  creatorAvatar: { width: 36, height: 36, borderRadius: 18 },
  creatorName: { fontSize: 14, fontWeight: '700' },
  creatorHandle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  blockBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  blockBtnText: { fontSize: 12, fontWeight: '800' },
  footer: { fontSize: 12, fontWeight: '500', lineHeight: 17, textAlign: 'center', marginTop: spacing.md },
  tierRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  tierPill: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  tierPillLabel: { fontSize: 14, fontWeight: '800' },
  tierPillPrice: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  commissionInputWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
  },
  subscribeBtn: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center' },
  subscribeBtnText: { fontSize: 14, fontWeight: '800' },
});
