import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { PersonRow } from '@/components/PersonRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { rowDivider, SectionTable } from '@/components/SectionTable';
import { formatCount } from '@/components/StatPill';
import { Contact, User } from '@/data/types';
import { tapLight } from '@/lib/haptics';
import { buildInviteMessage } from '@/lib/invite';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PER_SECTION = 8;

interface Suggestion {
  user: User;
  /** Shown under the name — the reason this person is being suggested. */
  reason: string;
}

/**
 * Discover people — who to follow next, grouped by *why*. Reached from the Home
 * header. Deliberately not the People screen: followers/following are a record
 * of who you already know and belong on your profile, so this screen only ever
 * shows people you don't follow yet, ordered strongest signal first.
 */
export default function DiscoverPeople() {
  const { colors } = useTheme();
  const {
    orders,
    contacts,
    currentUser,
    followingUsers,
    isLiked,
    isSaved,
    userFor,
    restaurantFor,
    topCreators,
  } = useData();

  // Snapshot who you followed on arrival. Recomputing against live follow state
  // would make a row vanish the instant you tapped Follow on it.
  const [alreadyFollowed] = useState(() => new Set(followingUsers().map((u) => u.id)));

  const { fromLikes, fromContacts, samePlaces, creators, invites } = useMemo(() => {
    // One person, one section — whichever signal is strongest claims them.
    const claimed = new Set<string>([currentUser.id, ...alreadyFollowed]);

    const collect = (candidates: { userId: string; reason: string }[]): Suggestion[] => {
      const out: Suggestion[] = [];
      for (const c of candidates) {
        if (claimed.has(c.userId)) continue;
        claimed.add(c.userId);
        out.push({ user: userFor(c.userId), reason: c.reason });
        if (out.length === PER_SECTION) break;
      }
      return out;
    };

    // Liking someone's plate is the most direct statement that you like how
    // they eat, so it outranks the rest.
    const fromLikes = collect(
      orders
        .filter((o) => isLiked(o.id))
        .map((o) => ({ userId: o.userId, reason: `You liked their ${o.dishName}` })),
    );

    // Someone already in your phone is the strongest follow signal there is, so
    // matched contacts outrank both overlap and follower counts.
    const byHandle = new Map(topCreators().map((u) => [u.handle.toLowerCase(), u]));
    const contactMatches: { userId: string; reason: string }[] = [];
    const invites: Contact[] = [];
    contacts.forEach((c) => {
      // A contact flagged onPlated with no profile behind them is still an
      // invite — routing to a user that doesn't exist would be a dead end.
      const match = c.onPlated ? byHandle.get(c.handle.toLowerCase()) : undefined;
      if (!match) {
        invites.push(c);
        return;
      }
      const mutual = c.mutualFriends > 0 ? ` · ${c.mutualFriends} mutual` : '';
      contactMatches.push({ userId: match.id, reason: `In your contacts${mutual}` });
    });
    const fromContacts = collect(contactMatches);

    // Places you've rated yourself, liked, or saved a plate from.
    const myPlaces = new Map<string, string>();
    orders.forEach((o) => {
      if (o.userId !== currentUser.id && !isLiked(o.id) && !isSaved(o.id)) return;
      const r = restaurantFor(o.restaurantId);
      if (r) myPlaces.set(o.restaurantId, r.name);
    });
    const samePlaces = collect(
      orders
        .filter((o) => myPlaces.has(o.restaurantId))
        .map((o) => ({ userId: o.userId, reason: `Also rated ${myPlaces.get(o.restaurantId)}` })),
    );

    // Fallback so a brand-new account still has somewhere to start.
    const creators = collect(
      topCreators().map((u) => ({ userId: u.id, reason: `${formatCount(u.followers)} followers` })),
    );

    return { fromLikes, fromContacts, samePlaces, creators, invites: invites.slice(0, PER_SECTION) };
  }, [
    orders,
    contacts,
    currentUser.id,
    alreadyFollowed,
    isLiked,
    isSaved,
    userFor,
    restaurantFor,
    topCreators,
  ]);

  const rowsFor = (list: Suggestion[]) =>
    list.map((s, i) => (
      <PersonRow key={s.user.id} user={s.user} reason={s.reason} last={i === list.length - 1} />
    ));

  const empty =
    !fromLikes.length && !fromContacts.length && !samePlaces.length && !creators.length && !invites.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Discover people" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        <SectionTable
          title="Plates you liked"
          subtitle="The people behind them"
          rows={rowsFor(fromLikes)}
        />
        <SectionTable
          title="From your contacts"
          subtitle="People you already know who are on Plated"
          rows={rowsFor(fromContacts)}
        />
        <SectionTable
          title="They eat where you eat"
          subtitle="Overlap with the places you've rated, liked and saved"
          rows={rowsFor(samePlaces)}
        />
        <SectionTable
          title="Creators to watch"
          subtitle="Most followed on Plated right now"
          rows={rowsFor(creators)}
        />
        {/* Invites sit last: it's an outbound ask, not a follow. */}
        <SectionTable
          title="Invite from your contacts"
          subtitle="Not on Plated yet"
          rows={invites.map((c, i) => (
            <InviteRow key={c.id} contact={c} last={i === invites.length - 1} />
          ))}
        />

        {empty && (
          <View style={styles.blank}>
            <Ionicons name="compass-outline" size={34} color={colors.textMuted} />
            <Text style={[styles.blankText, { color: colors.textMuted }]}>
              Rate a plate or like a few, and suggestions will build from what you go for.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * A phone contact who isn't on Plated. No profile to open and nothing to
 * follow — the only useful action is asking them to join, so the row is the
 * invite itself.
 */
function InviteRow({ contact, last }: { contact: Contact; last: boolean }) {
  const { colors } = useTheme();
  const { currentUser } = useData();

  const invite = () => {
    tapLight();
    // Routed through buildInviteMessage so the commission disclosure rule is
    // applied here like every other share path.
    Share.share({ message: buildInviteMessage({ earns: currentUser.compensationEligible }) }).catch(
      () => {},
    );
  };

  return (
    <View style={[styles.inviteRow, rowDivider(colors.border, last)]}>
      <Avatar uri={contact.avatar} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.inviteName, { color: colors.text }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Text style={[styles.inviteMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {contact.mutualFriends > 0 ? `${contact.mutualFriends} mutual` : 'In your contacts'}
        </Text>
      </View>
      <Pressable
        onPress={invite}
        hitSlop={6}
        style={[styles.inviteBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="paper-plane-outline" size={13} color={colors.text} />
        <Text style={[styles.inviteBtnText, { color: colors.text }]}>Invite</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  blank: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: spacing.lg },
  blankText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inviteName: { fontSize: 15, fontWeight: '800' },
  inviteMeta: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inviteBtnText: { fontSize: 13, fontWeight: '800' },
});
