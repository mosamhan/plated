import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { RatingBadge } from '@/components/RatingBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SocialLinks } from '@/components/SocialLinks';
import { formatCount, StatPill } from '@/components/StatPill';
import { User } from '@/data/types';
import { confirmAction } from '@/lib/dialog';
import { buildInviteMessage, INVITE_LINK } from '@/lib/invite';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PADDING = spacing.lg;
const GAP = spacing.md;

const COMP_THRESHOLD = 10000;

export function ProfileView({ user, isCurrent }: { user: User; isCurrent: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { ordersByUser, isFollowing, toggleFollow, blockUser, isBlocked, restaurantFor } = useData();
  const { platos } = usePlatos();
  const [tab, setTab] = useState<'plates' | 'reviews' | 'platos'>('plates');
  const [actionsOpen, setActionsOpen] = useState(false);

  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const orders = ordersByUser(user.id);
  const userPlatos = platos.filter((p) => p.creatorId === user.id);
  const following = isFollowing(user.id);
  const blocked = isBlocked(user.id);

  const onInvite = () =>
    Share.share({ message: buildInviteMessage({ earns: user.compensationEligible }) }).catch(
      () => {},
    );

  const onBlock = () =>
    confirmAction({
      title: `Block @${user.handle}?`,
      message:
        'Their plates, comments, and ratings disappear from your feeds. They won’t be notified.',
      confirmLabel: 'Block',
      destructive: true,
      onConfirm: () => blockUser(user.id),
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {isCurrent ? (
        <View style={[styles.topbar, { paddingTop: insets.top + 8 }]}>
          <Text style={[styles.handleTitle, { color: colors.text }]}>@{user.handle}</Text>
          <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={23} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <ScreenHeader
          title={`@${user.handle}`}
          rightIcon="ellipsis-horizontal"
          onRight={() => setActionsOpen(true)}
        />
      )}

      {/* Apple 1.2: report & block must be reachable from every profile */}
      <ActionSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title={`@${user.handle}`}
        actions={[
          {
            label: 'Report user',
            icon: 'flag-outline',
            onPress: () => router.push(`/report?targetType=user&targetId=${user.id}`),
          },
          {
            label: `Block @${user.handle}`,
            icon: 'hand-left-outline',
            destructive: true,
            onPress: onBlock,
          },
        ]}
      />

      {blocked && !isCurrent ? (
        <View style={styles.blockedWrap}>
          <Ionicons name="hand-left" size={42} color={colors.textMuted} />
          <Text style={[styles.blockedTitle, { color: colors.text }]}>@{user.handle} is blocked</Text>
          <Text style={[styles.blockedBody, { color: colors.textMuted }]}>
            Their content is hidden from your feeds. You can unblock them in Settings → Blocked users.
          </Text>
        </View>
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Identity */}
        <View style={styles.identity}>
          <Avatar uri={user.avatar} size={86} verified={user.verified} ring />
          <Text style={[typography.title, { color: colors.text, marginTop: 12 }]}>{user.name}</Text>
          <Text style={[styles.handle, { color: colors.textMuted }]}>@{user.handle}</Text>
          {!!user.bio && (
            <Text style={[styles.bio, { color: colors.text }]}>{user.bio}</Text>
          )}
          <View style={{ marginTop: 12 }}>
            <SocialLinks socials={user.socials} />
          </View>
        </View>

        {/* Stats */}
        <View style={[styles.stats, { borderColor: colors.border }]}>
          <StatPill value={orders.length} label="Plates" />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatPill value={user.followers} label="Followers" />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatPill value={user.following} label="Following" />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatPill value={user.friends} label="Friends" />
        </View>

        {/* Actions */}
        <View style={{ paddingHorizontal: PADDING, marginTop: spacing.lg }}>
          {isCurrent ? (
            <Button label="Edit profile" variant="secondary" icon="create-outline" onPress={() => router.push('/edit-profile')} />
          ) : (
            <Button
              label={following ? 'Following' : 'Follow'}
              variant={following ? 'secondary' : 'primary'}
              icon={following ? 'checkmark' : 'person-add'}
              onPress={() => toggleFollow(user.id)}
            />
          )}
        </View>

        {/* Creator compensation */}
        {isCurrent && <CompensationCard user={user} onInvite={onInvite} />}
        {!isCurrent && user.compensationEligible && <CreatorPartnerBadge user={user} />}

        {/* Tabs */}
        <View style={[styles.tabRow, { borderColor: colors.border }]}>
          <TabButton label="Plates" active={tab === 'plates'} onPress={() => setTab('plates')} />
          <TabButton label="Reviews" active={tab === 'reviews'} onPress={() => setTab('reviews')} />
          <TabButton label="Platos" active={tab === 'platos'} onPress={() => setTab('platos')} />
        </View>

        {tab === 'plates' && (
          <View style={styles.grid}>
            {orders.map((o) => (
              <PlateTile key={o.id} order={o} width={tileWidth} />
            ))}
            {orders.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No plates yet.</Text>
            )}
          </View>
        )}

        {tab === 'reviews' && (
          <View style={{ paddingHorizontal: PADDING, gap: 10, paddingTop: spacing.lg }}>
            {orders.map((o) => {
              const r = restaurantFor(o.restaurantId);
              return (
                <Pressable
                  key={o.id}
                  onPress={() => router.push(`/order/${o.id}`)}
                  style={[styles.reviewRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <RatingBadge score={o.rating} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewDish, { color: colors.text }]} numberOfLines={1}>
                      {o.dishName}
                    </Text>
                    <Text style={[styles.reviewMeta, { color: colors.textMuted }]} numberOfLines={1}>
                      {r?.name}
                    </Text>
                    <Text style={[styles.reviewCaption, { color: colors.textMuted }]} numberOfLines={2}>
                      {o.description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {orders.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No reviews yet.</Text>
            )}
          </View>
        )}

        {tab === 'platos' && (
          <View style={styles.grid}>
            {userPlatos.map((p) => (
              <PlatoTile key={p.id} video={p} width={tileWidth} />
            ))}
            {userPlatos.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                {isCurrent ? 'No Platos yet — tap + to post one.' : 'No Platos yet.'}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
      )}
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable style={styles.tabBtn} onPress={onPress}>
      <Text style={[styles.tabLabel, { color: active ? colors.text : colors.textMuted }]}>{label}</Text>
      <View style={{ height: 2, marginTop: 8, backgroundColor: active ? colors.accent : 'transparent', borderRadius: 2 }} />
    </Pressable>
  );
}

function CompensationCard({ user, onInvite }: { user: User; onInvite: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const progress = Math.min(user.followers / COMP_THRESHOLD, 1);
  const eligible = user.compensationEligible;

  return (
    <Pressable
      onPress={() => router.push('/creator')}
      style={[styles.compCard, { backgroundColor: colors.accentSoft }]}>
      <View style={styles.compHeader}>
        <Ionicons name="cash-outline" size={20} color={colors.accent} />
        <Text style={[styles.compTitle, { color: colors.text }]}>Creator earnings</Text>
        <View style={[styles.pill, { backgroundColor: colors.accent }]}>
          <Text style={[styles.pillText, { color: colors.accentText }]}>
            {eligible ? 'Active' : 'Dashboard'}
          </Text>
        </View>
      </View>

      {eligible ? (
        <Text style={[styles.compBody, { color: colors.text }]}>
          You earn on attributed orders from your plates — whatever rating you give. Est. $
          {user.estimatedEarnings}/mo.
        </Text>
      ) : (
        <>
          <Text style={[styles.compBody, { color: colors.text }]}>
            Unlock payouts at {formatCount(COMP_THRESHOLD)} followers — earn whenever an order
            starts from one of your plates, regardless of your rating.
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.card }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
            {formatCount(user.followers)} / {formatCount(COMP_THRESHOLD)} followers
          </Text>
        </>
      )}

      <Pressable onPress={onInvite} style={[styles.inviteRow, { borderColor: colors.border }]}>
        <Ionicons name="link" size={16} color={colors.accent} />
        <Text style={[styles.inviteLink, { color: colors.text }]} numberOfLines={1}>
          {INVITE_LINK}
        </Text>
        <View style={[styles.shareBtn, { backgroundColor: colors.accent }]}>
          <Text style={[styles.shareText, { color: colors.accentText }]}>Share</Text>
        </View>
      </Pressable>
      <Text style={[styles.inviteHint, { color: colors.textMuted }]}>
        Drop your link on Instagram, TikTok &amp; YouTube to grow and earn. Tap for your dashboard.
      </Text>
    </Pressable>
  );
}

function CreatorPartnerBadge({ user }: { user: User }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.partnerBadge, { backgroundColor: colors.accentSoft }]}>
      <Ionicons name="ribbon" size={18} color={colors.accent} />
      <Text style={[styles.partnerText, { color: colors.text }]}>
        Plated Creator · earns on {formatCount(user.followers)} followers
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    paddingBottom: 10,
  },
  handleTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  blockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 10 },
  blockedTitle: { fontSize: 18, fontWeight: '800' },
  blockedBody: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  identity: { alignItems: 'center', paddingHorizontal: PADDING, paddingTop: spacing.sm },
  handle: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  bio: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 10, lineHeight: 20, paddingHorizontal: 10 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: PADDING,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  divider: { width: StyleSheet.hairlineWidth, height: 28 },
  compCard: { marginHorizontal: PADDING, marginTop: spacing.lg, borderRadius: radius.lg, padding: spacing.lg },
  compHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compTitle: { fontSize: 16, fontWeight: '800', flex: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontSize: 11, fontWeight: '800' },
  compBody: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginTop: 10 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inviteLink: { flex: 1, fontSize: 13, fontWeight: '600' },
  shareBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill },
  shareText: { fontSize: 13, fontWeight: '800' },
  inviteHint: { fontSize: 12, fontWeight: '500', marginTop: 10 },
  partnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: PADDING,
    marginTop: spacing.lg,
    padding: 14,
    borderRadius: radius.md,
  },
  partnerText: { fontSize: 13, fontWeight: '700', flex: 1 },
  tabRow: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    marginHorizontal: PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 0 },
  tabLabel: { fontSize: 15, fontWeight: '800', paddingTop: 4 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: PADDING,
    paddingTop: spacing.lg,
  },
  empty: { fontSize: 14, fontWeight: '500', textAlign: 'center', width: '100%', marginTop: 30 },
  reviewRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reviewDish: { fontSize: 15, fontWeight: '800' },
  reviewMeta: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  reviewCaption: { fontSize: 13, fontWeight: '500', marginTop: 4, lineHeight: 18 },
});
