import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { RatingBadge } from '@/components/RatingBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { shortTime } from '@/lib/conversation';
import { tapLight } from '@/lib/haptics';
import { postMedia } from '@/lib/post';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { useStories } from '@/store/StoriesContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Tab = 'plates' | 'platos' | 'stories';

/**
 * Everything of yours that isn't on your profile.
 *
 * Three tabs because the three are archived for different reasons and only two
 * of them can be restored: a plate or Plato is *hidden by you* and can come
 * back, while a story is simply over — it expired, and the archive is the only
 * place it still exists. Mixing them into one grid would imply a Restore button
 * for stories that can't honestly be offered.
 */
export default function Archive() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { orders, currentUser, restaurantFor, setOrderArchived } = useData();
  const { platos, setPlatoArchived } = usePlatos();
  const { archivedStories } = useStories();
  const [tab, setTab] = useState<Tab>('plates');

  const archivedPlates = useMemo(
    () => orders.filter((o) => o.userId === currentUser.id && o.archived),
    [orders, currentUser.id],
  );
  const archivedPlatos = useMemo(
    () => platos.filter((p) => p.creatorId === currentUser.id && p.archived),
    [platos, currentUser.id],
  );

  const tile = (width - spacing.lg * 2 - spacing.md) / 2;

  const counts: Record<Tab, number> = {
    plates: archivedPlates.length,
    platos: archivedPlatos.length,
    stories: archivedStories.length,
  };

  const empty: Record<Tab, { icon: keyof typeof Ionicons.glyphMap; text: string }> = {
    plates: { icon: 'restaurant-outline', text: 'No archived plates.' },
    platos: { icon: 'videocam-outline', text: 'No archived Platos.' },
    stories: {
      icon: 'aperture-outline',
      text: 'Stories land here once they expire, if Save to archive is on.',
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Archive" />

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['plates', 'platos', 'stories'] as Tab[]).map((t) => {
          const on = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                tapLight();
                setTab(t);
              }}
              style={[styles.tab, on && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}>
              <Text style={[styles.tabText, { color: on ? colors.text : colors.textMuted }]}>
                {t === 'plates' ? 'Plates' : t === 'platos' ? 'Platos' : 'Stories'}
                {counts[t] > 0 ? ` ${counts[t]}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          {tab === 'stories'
            ? 'Only you can see these. Stories are already over — this is where they keep existing.'
            : 'Only you can see these. Restoring one puts it back on your profile and in the feed.'}
        </Text>

        {counts[tab] === 0 ? (
          <View style={styles.empty}>
            <Ionicons name={empty[tab].icon} size={38} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{empty[tab].text}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {tab === 'plates' &&
              archivedPlates.map((o) => (
                <View key={o.id} style={{ width: tile }}>
                  <Pressable onPress={() => router.push(`/order/${o.id}`)}>
                    <Image
                      source={{ uri: postMedia(o)[0].uri }}
                      style={[styles.photo, { width: tile, backgroundColor: colors.surface }]}
                      contentFit="cover"
                    />
                  </Pressable>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {o.dishName}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {restaurantFor(o.restaurantId)?.name ?? 'a restaurant'}
                  </Text>
                  <Restore onPress={() => setOrderArchived(o.id, false)} />
                </View>
              ))}

            {tab === 'platos' &&
              archivedPlatos.map((p) => (
                <View key={p.id} style={{ width: tile }}>
                  <Pressable onPress={() => router.push(`/plato/${p.id}`)}>
                    <View>
                      <Image
                        source={{ uri: p.poster }}
                        style={[styles.photo, { width: tile, backgroundColor: colors.surface }]}
                        contentFit="cover"
                      />
                      <View style={styles.playBadge}>
                        <Ionicons name="play" size={13} color="#fff" />
                      </View>
                    </View>
                  </Pressable>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {p.dishName}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {p.restaurantName}
                  </Text>
                  <Restore onPress={() => setPlatoArchived(p.id, false)} />
                </View>
              ))}

            {tab === 'stories' &&
              archivedStories.map((s) => (
                <View key={s.id} style={{ width: tile }}>
                  <Image
                    source={{ uri: s.mediaUrl }}
                    style={[styles.storyPhoto, { width: tile, backgroundColor: colors.surface }]}
                    contentFit="cover"
                  />
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    {s.caption || 'Story'}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {shortTime(s.createdAt)} ago
                    {s.restaurantId ? ` · ${restaurantFor(s.restaurantId)?.name ?? ''}` : ''}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Restore({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [
        styles.restore,
        { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name="arrow-undo-outline" size={14} color={colors.accent} />
      <Text style={[styles.restoreText, { color: colors.accent }]}>Restore</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { paddingVertical: 11, marginRight: spacing.xl, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '800' },
  intro: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photo: { aspectRatio: 1, borderRadius: radius.md },
  // Stories are shot vertically; a square crop would cut the plate out.
  storyPhoto: { aspectRatio: 0.62, borderRadius: radius.md },
  title: { fontSize: 14, fontWeight: '700', marginTop: 7 },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  playBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  restoreText: { fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center', paddingHorizontal: spacing.xl },
});
