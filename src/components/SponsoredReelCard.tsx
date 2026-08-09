import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SponsoredPlacement } from '@/data/types';
import { openInApp } from '@/lib/external';
import { tapLight } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';

/**
 * A `reel_ad` sponsored placement, paged into the Platos feed like any other
 * reel (see PlatosFeed) but with none of a real Plato's interaction surface —
 * no likes/comments/order sheet, because there's no plate or creator behind
 * it to act on. Mirrors PlatoReel's scrim/info layout so it reads as part of
 * the same feed rather than a jarring interstitial.
 */
export function SponsoredReelCard({
  placement,
  height,
  bottomInset,
}: {
  placement: SponsoredPlacement;
  height: number;
  bottomInset: number;
}) {
  const { restaurantFor } = useData();
  const restaurant = restaurantFor(placement.restaurantId);
  const image = placement.mediaUrl || restaurant?.image;

  const onCta = () => {
    tapLight();
    if (placement.ctaUrl) openInApp(placement.ctaUrl);
  };

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {image && <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" />}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={[styles.scrim, { height: height * 0.55 }]}
        pointerEvents="none"
      />

      <View style={styles.sponsoredTag}>
        <Ionicons name="megaphone-outline" size={12} color="#fff" />
        <Text style={styles.sponsoredTagText}>Sponsored</Text>
      </View>

      <View style={[styles.info, { bottom: bottomInset + 32 }]}>
        {!!restaurant && (
          <Text style={styles.restaurant} numberOfLines={1}>
            <Ionicons name="location" size={12} color="#FFD98A" /> {restaurant.name}
          </Text>
        )}
        {!!placement.headline && (
          <Text style={[styles.headline, { fontFamily: displayFont }]} numberOfLines={2}>
            {placement.headline}
          </Text>
        )}
        {!!placement.ctaUrl && (
          <Pressable style={styles.cta} onPress={onCta}>
            <Text style={styles.ctaText}>Learn more</Text>
            <Ionicons name="open-outline" size={15} color="#251B10" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sponsoredTag: {
    position: 'absolute',
    top: 60,
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sponsoredTagText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  info: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  restaurant: { color: '#FFD98A', fontSize: 13, fontWeight: '700' },
  headline: { color: '#fff', fontSize: 24, lineHeight: 29, letterSpacing: -0.3, marginTop: 8 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
  },
  ctaText: { color: '#251B10', fontSize: 14, fontWeight: '800' },
});
