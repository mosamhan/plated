import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FilterChips } from '@/components/FilterChips';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { Restaurant } from '@/data/types';
import { useCollections } from '@/store/CollectionsContext';
import { useCollectionContents } from '@/store/useCollectionContents';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PADDING = spacing.lg;
const GAP = spacing.md;

const ALL = 'All';
const PLATES = 'Plates';
const PLATOS = 'Platos';
const PLACES = 'Places';

/**
 * One saved collection — the plates, Platos, and restaurants inside it.
 * Reached from the Collections tab on your profile.
 */
export default function CollectionScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const { collections, openSaveSheet, isSaved } = useCollections();

  const collection = collections.find((c) => c.id === id);
  const { plates, platos, restaurants, total } = useCollectionContents(collection);
  const [filter, setFilter] = useState(ALL);

  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;

  // Only offer a chip for a kind that's actually in this list.
  const options = [
    ALL,
    ...(plates.length ? [PLATES] : []),
    ...(platos.length ? [PLATOS] : []),
    ...(restaurants.length ? [PLACES] : []),
  ];
  const active = options.includes(filter) ? filter : ALL;
  const showSection = (name: string) => active === ALL || active === name;
  // The count follows the chip, so filtering down doesn't leave a stale total.
  const shown =
    active === PLATES
      ? plates.length
      : active === PLATOS
        ? platos.length
        : active === PLACES
          ? restaurants.length
          : total;
  // Headings only earn their space when more than one kind is on screen.
  const headed = active === ALL && options.length > 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={collection?.name ?? 'Collection'} />

      {!collection ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>This list no longer exists.</Text>
      ) : (
        <>
          {/* The list below is tall enough to squeeze this row flat once a fourth
              chip makes it scrollable — pin it so the labels can't get clipped. */}
          {options.length > 1 && (
            <View style={{ flexShrink: 0 }}>
              <FilterChips options={options} value={active} onChange={setFilter} />
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {total === 0 ? 'Nothing saved yet' : `${shown} saved`}
            </Text>

            {showSection(PLATES) && plates.length > 0 && (
              <View style={styles.section}>
                {headed && <SectionHeader title="Plates" />}
                <View style={styles.grid}>
                  {plates.map((o) => (
                    <PlateTile key={o.id} order={o} width={tileWidth} />
                  ))}
                </View>
              </View>
            )}

            {showSection(PLATOS) && platos.length > 0 && (
              <View style={styles.section}>
                {headed && <SectionHeader title="Platos" />}
                <View style={styles.grid}>
                  {platos.map((p) => (
                    <PlatoTile
                      key={p.id}
                      video={p}
                      width={tileWidth}
                      onSave={() => openSaveSheet({ type: 'plato', id: p.id })}
                      savedOverride={isSaved({ type: 'plato', id: p.id })}
                    />
                  ))}
                </View>
              </View>
            )}

            {showSection(PLACES) && restaurants.length > 0 && (
              <View style={styles.section}>
                {headed && <SectionHeader title="Places" />}
                <View style={{ paddingHorizontal: PADDING, gap: 10 }}>
                  {restaurants.map((r) => (
                    <RestaurantRow key={r.id} restaurant={r} />
                  ))}
                </View>
              </View>
            )}

            {total === 0 && (
              <View style={styles.emptyWrap}>
                <Ionicons name="bookmark-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing here yet</Text>
                <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                  Tap the bookmark on any plate, Plato, or restaurant to save it to “{collection.name}”.
                </Text>
              </View>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function RestaurantRow({ restaurant }: { restaurant: Restaurant }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/restaurant/${restaurant.id}`)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <Image
        source={{ uri: restaurant.image }}
        style={[styles.rowImg, { backgroundColor: colors.surface }]}
        contentFit="cover"
        transition={150}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {restaurant.name}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {/* A place pulled from search may have no distance yet — don't leave a dangling separator. */}
          {[restaurant.cuisine, restaurant.priceLevel, restaurant.distance].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  count: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: PADDING,
    paddingTop: spacing.md,
  },
  section: { marginTop: spacing.lg },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingHorizontal: PADDING,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowImg: { width: 54, height: 54, borderRadius: radius.md },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 70, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptyBody: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
});
