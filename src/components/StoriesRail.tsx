import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { tapLight } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useStories } from '@/store/StoriesContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const SIZE = 76;

/**
 * The stories rail at the top of Home.
 *
 * The bubble is always the person's **profile picture**, never a frame of their
 * story: the rail's job is "who has something", and a face is what you scan
 * for. The ring is what carries the story state — accent for unseen, a plain
 * hairline once you've watched it, and none at all when there's nothing live.
 *
 * Your own bubble is always first and always present — it's the "post one"
 * button as much as it is a story — and only wears a ring when you have
 * something up.
 *
 * The rail hides entirely while nothing is live except your own empty bubble,
 * so a quiet day doesn't cost the feed 90 points of chrome.
 */
export function StoriesRail() {
  const { colors } = useTheme();
  const router = useRouter();
  const { userFor, currentUser } = useData();
  const { groups, myStories, loading, isSeen } = useStories();

  const others = groups.filter((g) => g.userId !== currentUser.id);
  // Your own ring follows the same rule as everyone else's: accent until you've
  // watched it, then grey. Posting and never opening it left a permanent accent
  // ring that stopped meaning anything.
  const myRing = myStories.length === 0
    ? 'none'
    : myStories.every((s) => isSeen(s.id))
      ? 'seen'
      : 'unseen';

  if (loading) {
    return (
      <View style={styles.rail}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: 7 }}>
            <Skeleton style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2 }} />
            <Skeleton style={{ width: 46, height: 10 }} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { borderBottomColor: colors.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {/* Yours: opens your story if you have one, otherwise goes straight to
            posting. The + stays visible either way so adding another is one tap. */}
        <Pressable
          onPress={() => {
            tapLight();
            router.push(myStories.length > 0 ? `/story/${currentUser.id}` : '/create-story');
          }}
          style={styles.item}>
          <View>
            <Bubble uri={currentUser.avatar} ring={myRing} />
            <Pressable
              onPress={() => {
                tapLight();
                router.push('/create-story');
              }}
              hitSlop={6}
              style={[styles.add, { backgroundColor: colors.accent, borderColor: colors.background }]}>
              <Ionicons name="add" size={16} color={colors.accentText} />
            </Pressable>
          </View>
          <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
            Your story
          </Text>
        </Pressable>

        {others.map((g) => {
          const user = userFor(g.userId);
          return (
            <Pressable
              key={g.userId}
              onPress={() => {
                tapLight();
                router.push(`/story/${g.userId}`);
              }}
              style={styles.item}>
              <Bubble uri={user.avatar} ring={g.seen ? 'seen' : 'unseen'} />
              <Text
                style={[styles.label, { color: g.seen ? colors.textMuted : colors.text }]}
                numberOfLines={1}>
                {user.name.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * `none` still draws the ring's border, just transparent — dropping the width
 * would shrink the avatar and make the bubbles jump around as stories come and
 * go.
 */
function Bubble({ uri, ring }: { uri: string; ring: 'unseen' | 'seen' | 'none' }) {
  const { colors } = useTheme();
  const borderColor =
    ring === 'unseen' ? colors.accent : ring === 'seen' ? colors.border : 'transparent';
  return (
    <View style={[styles.ring, { borderColor }]}>
      <Image source={{ uri }} style={styles.photo} contentFit="cover" transition={200} />
    </View>
  );
}

const styles = StyleSheet.create({
  // A bottom hairline separates the rail from the first card now that it
  // scrolls with them rather than sitting under the fixed header.
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: spacing.lg },
  rail: { flexDirection: 'row', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  item: { alignItems: 'center', gap: 6, width: 80 },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    padding: 2,
  },
  photo: { flex: 1, borderRadius: radius.pill },
  add: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '700' },
});
