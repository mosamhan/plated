import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A group's identity photo: its own uploaded photo if it has one, otherwise a
 * 2×2 quadrant collage of up to 4 members' avatars, clipped to a circle — the
 * Instagram convention for "no group photo yet." Falls back to a single
 * avatar when there's only one other member to show (a 2-person "group",
 * which shouldn't really exist post-Phase-0, but is a graceful edge case
 * rather than a blank quadrant).
 */
export function GroupAvatar({
  avatarUrl,
  memberAvatars,
  size = 64,
}: {
  avatarUrl?: string;
  /** Other members' avatar URLs, most-recently-active first — only the first 4 are used. */
  memberAvatars: string[];
  size?: number;
}) {
  const { colors } = useTheme();

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface }}
        contentFit="cover"
      />
    );
  }

  const shown = memberAvatars.slice(0, 4);
  if (shown.length <= 1) {
    return <Avatar uri={shown[0] ?? ''} size={size} />;
  }

  const half = size / 2;
  // 2 members: two halves side by side. 3-4: a real 2x2 grid, with the last
  // cell repeating the first when there are only 3 (an empty quadrant would
  // read as a missing member, not as "just three people").
  const cells =
    shown.length === 2
      ? [shown[0], shown[0], shown[1], shown[1]]
      : [shown[0], shown[1], shown[2] ?? shown[0], shown[3] ?? shown[1] ?? shown[0]];

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface },
      ]}>
      {cells.map((uri, i) => (
        <Image
          key={i}
          source={{ uri }}
          style={{ width: half, height: half }}
          contentFit="cover"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
});
