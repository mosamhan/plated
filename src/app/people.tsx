import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PersonRow } from '@/components/PersonRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTable } from '@/components/SectionTable';
import { User } from '@/data/types';
import { useData } from '@/store/DataContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const rowsFor = (users: User[]) =>
  users.map((u, i) => <PersonRow key={u.id} user={u} last={i === users.length - 1} />);

/**
 * People — who follows you and who you follow, as two plain tables headed by
 * their own counts. Reached from a profile's follower/following counts (via
 * ?tab=, which scrolls to that section rather than switching a tab). Finding
 * *new* people lives on its own screen — see `discover-people`.
 */
export default function People() {
  const { colors } = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { followerUsers, followingUsers } = useData();

  const scrollRef = useRef<ScrollView>(null);
  const [followingY, setFollowingY] = useState(0);
  // Only jump once, on arrival — re-scrolling on every layout pass would fight
  // the user as they scroll.
  const jumped = useRef(false);

  const followers = followerUsers();
  const following = followingUsers();

  const maybeJumpToFollowing = () => {
    if (jumped.current || tab?.toLowerCase() !== 'following' || followingY <= 0) return;
    jumped.current = true;
    scrollRef.current?.scrollTo({ y: followingY, animated: false });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="People" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}>
        <SectionTable
          title="Followers"
          count={followers.length}
          rows={rowsFor(followers)}
          empty={{ icon: 'people-outline', text: 'No followers yet.' }}
        />

        <View
          onLayout={(e) => {
            setFollowingY(e.nativeEvent.layout.y);
            maybeJumpToFollowing();
          }}>
          <SectionTable
            title="Following"
            count={following.length}
            rows={rowsFor(following)}
            empty={{ icon: 'person-add-outline', text: 'You’re not following anyone yet.' }}
          />
        </View>
      </ScrollView>
    </View>
  );
}
