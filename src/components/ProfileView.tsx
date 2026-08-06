import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import Animated, { FadeIn } from 'react-native-reanimated';

import { ActionSheet } from '@/components/ActionSheet';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { NameInputModal } from '@/components/NameInputModal';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { SocialLinks } from '@/components/SocialLinks';
import { formatCount, StatPill } from '@/components/StatPill';
import { User } from '@/data/types';
import { confirmAction } from '@/lib/dialog';
import { success, tapLight, tick } from '@/lib/haptics';
import { buildInviteMessage, INVITE_LINK } from '@/lib/invite';
import { Collection, useCollections } from '@/store/CollectionsContext';
import { useCreatorCard } from '@/store/CreatorCardContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { usePlatos } from '@/store/PlatosContext';
import { useCollectionContents } from '@/store/useCollectionContents';
import { usePublicCollections } from '@/store/usePublicCollections';
import { displayFont } from '@/theme/fonts';
import { buildProfileShareMessage } from '@/lib/invite';
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
  const { ordersByUser, isFollowing, toggleFollow, blockUser, isBlocked, suggestedUsers, currentUser } = useData();
  const { location } = useLocation();
  const { platos } = usePlatos();
  const { collections, createCollection, openSaveSheet, isSaved: isSavedInCollections } = useCollections();
  const [tab, setTab] = useState<'plates' | 'platos' | 'collections'>('plates');
  const changeTab = (t: 'plates' | 'platos' | 'collections') => {
    if (t !== tab) tick();
    setTab(t);
  };
  const [actionsOpen, setActionsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Your own lists live in context (and stay in sync with saves); someone
  // else's have to be fetched, and RLS returns only the ones they've shared.
  const { collections: publicCollections, loading: publicLoading } = usePublicCollections(user.id);
  const shownCollections = isCurrent ? collections : publicCollections;

  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const orders = ordersByUser(user.id);
  const userPlatos = platos.filter((p) => p.creatorId === user.id);
  const following = isFollowing(user.id);

  /**
   * Who to look at next, ranked from signals the data model actually has:
   * overlapping restaurants with the profile you're viewing (the strongest —
   * it's why you're here), then overlap with your own ratings, then reach.
   *
   * "Similar followings" isn't in here because only *your* follow list is
   * loaded — other users' following lists aren't, so any mutual-follow score
   * would be invented rather than measured. Worth adding once that ships.
   */
  const suggested = useMemo(() => {
    if (isCurrent) return [];
    const placesOf = (id: string) => new Set(ordersByUser(id).map((o) => o.restaurantId));
    const theirs = placesOf(user.id);
    const mine = placesOf(currentUser.id);
    return suggestedUsers()
      .filter((u) => u.id !== user.id && u.id !== currentUser.id && !isFollowing(u.id) && !isBlocked(u.id))
      .map((u) => {
        const places = placesOf(u.id);
        const withThem = [...places].filter((r) => theirs.has(r)).length;
        const withMe = [...places].filter((r) => mine.has(r)).length;
        const reason = withThem
          ? `Rates the same places as ${user.name.split(' ')[0]}`
          : withMe
            ? 'Been where you’ve been'
            : 'Popular on Plated';
        return { user: u, score: withThem * 3 + withMe * 2, reason };
      })
      .sort((a, b) => b.score - a.score || b.user.followers - a.user.followers)
      .slice(0, 8);
  }, [isCurrent, user.id, user.name, currentUser.id, ordersByUser, suggestedUsers, isFollowing, isBlocked]);

  // Shares a link to this profile. Uses the handle rather than the display
  // name — that's what someone types to find them again.
  const shareProfile = () => {
    Share.share({ message: buildProfileShareMessage({ name: user.name, handle: user.handle }) }).catch(() => {});
  };
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
        <View style={[styles.selfHeader, { paddingTop: insets.top + 8 }]}>
          <Avatar uri={user.avatar} size={72} verified={user.verified} ring />
          <View style={{ flex: 1 }}>
            <Text style={[typography.heading, { color: colors.text, fontFamily: displayFont }]} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={[styles.selfMeta, { color: colors.textMuted }]} numberOfLines={1}>
              @{user.handle} · {location.label}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={8}
            style={[styles.settingsGear, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <ScreenHeader
          title={`@${user.handle}`}
          rightIcon="ellipsis-horizontal"
          onRight={() => setActionsOpen(true)}
        />
      )}

      <NameInputModal
        visible={createOpen}
        title="New collection"
        placeholder="e.g. Best tacos in Chicago"
        submitLabel="Create"
        onSubmit={(name) => createCollection(name)}
        onClose={() => setCreateOpen(false)}
      />

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        {/* Identity — the compact header above already covers avatar/name/handle
            for the current user; other profiles keep the original centered block. */}
        {isCurrent ? (
          !!user.bio && (
            <Text style={[styles.bio, { color: colors.text, marginTop: 4 }]}>{user.bio}</Text>
          )
        ) : (
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
        )}

        {/* Stats — Followers/Following open the People screen on that tab. */}
        <View style={[styles.stats, { borderColor: colors.border }]}>
          <StatPill value={orders.length} label="Plates" />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatPill value={user.followers} label="Followers" onPress={() => router.push('/people?tab=followers')} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <StatPill value={user.following} label="Following" onPress={() => router.push('/people?tab=following')} />
        </View>

        {isCurrent && (
          <View style={{ marginTop: spacing.md, alignItems: 'center' }}>
            <SocialLinks socials={user.socials} />
          </View>
        )}

        {/* Actions. On your own profile: Edit / Share side by side, with a
            person-add square opening the existing discover-people screen —
            finding people is adjacent to sharing yourself, so they sit together
            rather than being buried in settings. */}
        <View style={{ paddingHorizontal: PADDING, marginTop: spacing.lg }}>
          {isCurrent ? (
            <View style={styles.selfActions}>
              <View style={{ flex: 1 }}>
                <Button label="Edit profile" variant="secondary" icon="create-outline" onPress={() => router.push('/edit-profile')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Share profile" variant="secondary" icon="share-outline" onPress={shareProfile} />
              </View>
              <Pressable
                onPress={() => router.push('/discover-people')}
                style={[styles.discoverBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="person-add-outline" size={19} color={colors.text} />
              </Pressable>
            </View>
          ) : (
            <Button
              label={following ? 'Following' : 'Follow'}
              variant={following ? 'secondary' : 'primary'}
              icon={following ? 'checkmark' : 'person-add'}
              onPress={() => {
                following ? tapLight() : success();
                toggleFollow(user.id);
              }}
            />
          )}
        </View>

        {/* Suggested for you — only on someone else's profile, where "who else
            is like this" is a question the user is already asking. */}
        {!isCurrent && suggested.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={[styles.suggestHead, { color: colors.textMuted }]}>SUGGESTED FOR YOU</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.suggestRow}>
              {suggested.map(({ user: u, reason }) => (
                <Pressable
                  key={u.id}
                  onPress={() => router.push(`/user/${u.id}`)}
                  style={[styles.suggestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Avatar uri={u.avatar} size={56} verified={u.verified} />
                  <Text style={[styles.suggestName, { color: colors.text }]} numberOfLines={1}>
                    {u.name}
                  </Text>
                  <Text style={[styles.suggestReason, { color: colors.textMuted }]} numberOfLines={2}>
                    {reason}
                  </Text>
                  <Pressable
                    onPress={() => {
                      isFollowing(u.id) ? tapLight() : success();
                      toggleFollow(u.id);
                    }}
                    style={[styles.suggestBtn, { backgroundColor: isFollowing(u.id) ? colors.surface : colors.accent, borderColor: colors.border }]}>
                    <Text
                      style={[
                        styles.suggestBtnText,
                        { color: isFollowing(u.id) ? colors.text : colors.accentText },
                      ]}>
                      {isFollowing(u.id) ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Creator compensation */}
        {isCurrent && <CompensationCard user={user} onInvite={onInvite} />}
        {!isCurrent && user.compensationEligible && <CreatorPartnerBadge user={user} />}

        {/* Tabs — icon-only (grid / play-circle / bookmark), active = accent + 2px
            bottom border. On another profile the Collections tab shows only the
            lists they've made public. */}
        <View style={[styles.tabRow, { borderColor: colors.border }]}>
          <TabButton icon="grid" active={tab === 'plates'} onPress={() => changeTab('plates')} />
          <TabButton icon="play-circle" active={tab === 'platos'} onPress={() => changeTab('platos')} />
          <TabButton
            icon="bookmark"
            active={tab === 'collections'}
            onPress={() => changeTab('collections')}
          />
        </View>

        {tab === 'plates' && (
          <Animated.View key="plates" style={styles.grid} entering={FadeIn.duration(220)}>
            {/* Archived posts show on your own profile (badged) so you can find
                and restore them; they're hidden from everyone else — RLS keeps
                them out of others' loads, and this guards the belt-and-braces. */}
            {orders
              .filter((o) => isCurrent || !o.archived)
              .map((o) => (
                <PlateTile key={o.id} order={o} width={tileWidth} manageable={isCurrent} />
              ))}
            {orders.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>No plates yet.</Text>
            )}
          </Animated.View>
        )}

        {tab === 'platos' && (
          <Animated.View key="platos" style={styles.grid} entering={FadeIn.duration(220)}>
            {userPlatos
              .filter((p) => isCurrent || !p.archived)
              .map((p) => (
                <PlatoTile
                  key={p.id}
                  video={p}
                  width={tileWidth}
                  onSave={() => openSaveSheet({ type: 'plato', id: p.id })}
                  savedOverride={isSavedInCollections({ type: 'plato', id: p.id })}
                  manageable={isCurrent}
                />
              ))}
            {userPlatos.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                {isCurrent ? 'No Platos yet — tap + to post one.' : 'No Platos yet.'}
              </Text>
            )}
          </Animated.View>
        )}

        {tab === 'collections' && (
          <View style={{ paddingHorizontal: PADDING, gap: 10, paddingTop: spacing.lg }}>
            {shownCollections.map((c) => (
              <CollectionRow key={c.id} collection={c} showPrivacy={isCurrent} />
            ))}
            {!isCurrent && publicLoading && shownCollections.length === 0 &&
              [0, 1, 2].map((i) => (
                <View key={`sk${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Skeleton style={{ width: 54, height: 54, borderRadius: 12 }} />
                  <View style={{ gap: 6, flex: 1 }}>
                    <Skeleton style={{ width: '55%', height: 13 }} />
                    <Skeleton style={{ width: '35%', height: 10 }} />
                  </View>
                </View>
              ))}
            {shownCollections.length === 0 && !publicLoading && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                {isCurrent
                  ? 'No collections yet — make one below, or save a plate to start.'
                  : `@${user.handle} hasn’t shared any collections.`}
              </Text>
            )}
            {isCurrent && (
              <Button
                label="New collection"
                variant="secondary"
                icon="add"
                style={{ marginTop: 4 }}
                onPress={() => setCreateOpen(true)}
              />
            )}
          </View>
        )}
      </ScrollView>
      )}
    </View>
  );
}

/**
 * One saved list on the Collections tab — name, what's inside, and up to three
 * cover thumbnails. Taps into the collection screen.
 */
function CollectionRow({
  collection,
  showPrivacy,
}: {
  collection: Collection;
  /** Only meaningful on your own profile — everything on someone else's is public. */
  showPrivacy?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { plates, platos, restaurants, total, covers } = useCollectionContents(collection);

  const parts = [
    plates.length && `${plates.length} ${plates.length === 1 ? 'plate' : 'plates'}`,
    platos.length && `${platos.length} ${platos.length === 1 ? 'Plato' : 'Platos'}`,
    restaurants.length &&
      `${restaurants.length} ${restaurants.length === 1 ? 'place' : 'places'}`,
  ].filter(Boolean) as string[];

  const icon =
    collection.name === 'Favorites' ? 'heart' : collection.name === 'Want to try' ? 'bookmark' : 'albums';

  return (
    <Pressable
      onPress={() => router.push(`/collection/${collection.id}`)}
      style={({ pressed }) => [
        styles.collectionRow,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      {total > 0 ? (
        <View style={styles.covers}>
          {covers.slice(0, 3).map((uri, i) => (
            <Image
              key={`${uri}-${i}`}
              source={{ uri }}
              style={[
                styles.cover,
                { backgroundColor: colors.surface, borderColor: colors.card },
                i > 0 && { marginLeft: -20 },
              ]}
              contentFit="cover"
              transition={150}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.collectionIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.collectionNameRow}>
          <Text style={[styles.collectionName, { color: colors.text }]} numberOfLines={1}>
            {collection.name}
          </Text>
          {/* Which lists are visible to other people is worth seeing at a glance. */}
          {showPrivacy && !collection.isPrivate && (
            <View style={[styles.sharedPill, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="globe-outline" size={11} color={colors.accent} />
              <Text style={[styles.sharedPillText, { color: colors.accent }]}>Shared</Text>
            </View>
          )}
        </View>
        <Text style={[styles.collectionMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {parts.length ? parts.join(' · ') : 'Empty'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function TabButton({
  icon,
  active,
  onPress,
}: {
  icon: 'grid' | 'play-circle' | 'bookmark';
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable style={styles.tabBtn} onPress={onPress}>
      <Ionicons
        name={active ? icon : (`${icon}-outline` as keyof typeof Ionicons.glyphMap)}
        size={24}
        color={active ? colors.accent : colors.textMuted}
      />
      <View
        style={{
          height: 2,
          width: '100%',
          marginTop: 10,
          backgroundColor: active ? colors.accent : 'transparent',
          borderRadius: 2,
        }}
      />
    </AnimatedPressable>
  );
}

function CompensationCard({ user, onInvite }: { user: User; onInvite: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const progress = Math.min(user.followers / COMP_THRESHOLD, 1);
  const eligible = user.compensationEligible;

  // visible is null until the stored preference has been read; rendering
  // nothing until then avoids showing the card for a frame and yanking it away.
  const { visible, setVisible } = useCreatorCard();

  const dismiss = () => {
    tapLight();
    setVisible(false);
  };

  if (visible !== true) return null;

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
        {/* Stops the press from reaching the card, which navigates to /creator. */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hide creator earnings"
          style={styles.compClose}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
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
  selfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: PADDING,
    paddingBottom: 12,
  },
  selfMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  settingsGear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
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
  compClose: { marginLeft: 2, padding: 2 },
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
  suggestHead: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: PADDING, marginBottom: 10 },
  suggestRow: { flexDirection: 'row', gap: 10, paddingHorizontal: PADDING },
  suggestCard: {
    width: 150,
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestName: { fontSize: 14, fontWeight: '800' },
  suggestReason: { fontSize: 11, fontWeight: '600', textAlign: 'center', minHeight: 28 },
  suggestBtn: {
    marginTop: 2,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestBtnText: { fontSize: 13, fontWeight: '800' },
  selfActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discoverBtn: {
    width: 48,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    marginHorizontal: PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: PADDING,
    paddingTop: spacing.lg,
  },
  empty: { fontSize: 14, fontWeight: '500', textAlign: 'center', width: '100%', marginTop: 30 },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  collectionIcon: { width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  // Overlapping thumbnails — each one tucks behind the one before it.
  covers: { flexDirection: 'row', height: 54, alignItems: 'center' },
  cover: {
    width: 38,
    height: 46,
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  collectionNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  collectionName: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  sharedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  sharedPillText: { fontSize: 10, fontWeight: '800' },
  collectionMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
