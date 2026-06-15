import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RatingBadge } from '@/components/RatingBadge';
import { useTheme } from '@/theme/ThemeContext';
import { radius, spacing } from '@/theme/palettes';

interface Props {
  rank: number;
  image: string;
  title: string;
  subtitle: string;
  score?: number;
  rounded?: boolean;
  onPress?: () => void;
  trailing?: string;
}

const MEDALS: Record<number, string> = { 1: '#FFD15C', 2: '#C7CDD4', 3: '#E2A06B' };

export function RankRow({ rank, image, title, subtitle, score, rounded, onPress, trailing }: Props) {
  const { colors } = useTheme();
  const medal = MEDALS[rank];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={styles.rankWrap}>
        <Text style={[styles.rank, { color: medal ?? colors.textMuted }]}>{rank}</Text>
      </View>
      <Image
        source={{ uri: image }}
        style={[styles.img, { borderRadius: rounded ? 24 : radius.md, backgroundColor: colors.surface }]}
        contentFit="cover"
        transition={150}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {score !== undefined ? (
        <RatingBadge score={score} size="sm" />
      ) : trailing ? (
        <Text style={[styles.trailing, { color: colors.accent }]}>{trailing}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  rankWrap: { width: 26, alignItems: 'center' },
  rank: { fontSize: 17, fontWeight: '900' },
  img: { width: 48, height: 48 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  trailing: { fontSize: 14, fontWeight: '800' },
});
