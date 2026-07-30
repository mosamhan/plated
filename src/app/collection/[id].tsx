import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { FilterChips } from '@/components/FilterChips';
import { NameInputModal } from '@/components/NameInputModal';
import { PlateTile } from '@/components/PlateTile';
import { PlatoTile } from '@/components/PlatoTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { Restaurant } from '@/data/types';
import { confirmAction } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import { SavedItem, useCollections } from '@/store/CollectionsContext';
import { useCollectionContents } from '@/store/useCollectionContents';
import { useCollectionById } from '@/store/usePublicCollections';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PADDING = spacing.lg;
const GAP = spacing.md;

const ALL = 'All';
const PLATES = 'Plates';
const PLATOS = 'Platos';
const PLACES = 'Places';

const keyOf = (item: SavedItem) => `${item.type}:${item.id}`;

/**
 * One saved collection — the plates, Platos, and restaurants inside it.
 * Yours is manageable (rename, remove items, share, delete); someone else's is
 * read-only and only reachable at all once they've made it public.
 */
export default function CollectionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const {
    collections,
    openSaveSheet,
    isSaved,
    toggleInCollection,
    renameCollection,
    deleteCollection,
    setCollectionPrivacy,
  } = useCollections();

  const own = collections.find((c) => c.id === id);
  // Not one of yours → it's someone's public list, which has to be fetched.
  const { collection: fetched, loading } = useCollectionById(id, own != null);
  const collection = own ?? fetched;
  const isOwner = own != null;

  const { plates, platos, restaurants, total } = useCollectionContents(collection ?? undefined);
  const [filter, setFilter] = useState(ALL);
  const [manageOpen, setManageOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<SavedItem[]>([]);

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

  const isPicked = (item: SavedItem) => selected.some((s) => keyOf(s) === keyOf(item));
  const togglePick = (item: SavedItem) => {
    tapLight();
    setSelected((prev) =>
      prev.some((s) => keyOf(s) === keyOf(item))
        ? prev.filter((s) => keyOf(s) !== keyOf(item))
        : [...prev, item],
    );
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected([]);
  };

  const removeSelected = () => {
    if (!collection || selected.length === 0) return;
    const count = selected.length;
    confirmAction({
      title: count === 1 ? 'Remove item?' : `Remove ${count} items?`,
      message:
        count === 1
          ? `It’ll come out of “${collection.name}” — the plate itself stays on Plated.`
          : `They’ll come out of “${collection.name}” — the plates themselves stay on Plated.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => {
        selected.forEach((item) => toggleInCollection(collection.id, item));
        exitSelect();
      },
    });
  };

  const onDeleteList = () => {
    if (!collection) return;
    confirmAction({
      title: `Delete “${collection.name}”?`,
      message: 'The list goes away for good. Everything saved in it stays on Plated.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        deleteCollection(collection.id);
        router.back();
      },
    });
  };

  const onTogglePrivacy = () => {
    if (!collection) return;
    const goingPublic = collection.isPrivate;
    if (!goingPublic) {
      setCollectionPrivacy(collection.id, true);
      return;
    }
    // Publishing is the direction that can surprise someone — confirm that one.
    confirmAction({
      title: 'Share this list?',
      message: `“${collection.name}” will show on your profile for anyone who visits.`,
      confirmLabel: 'Share',
      onConfirm: () => setCollectionPrivacy(collection.id, false),
    });
  };

  const manageActions = [
    { label: 'Rename list', icon: 'create-outline' as const, onPress: () => setRenameOpen(true) },
    ...(total > 0
      ? [
          {
            label: 'Select items to remove',
            icon: 'checkmark-circle-outline' as const,
            onPress: () => setSelectMode(true),
          },
        ]
      : []),
    {
      label: collection?.isPrivate ? 'Make public' : 'Make private',
      icon: collection?.isPrivate ? ('globe-outline' as const) : ('lock-closed-outline' as const),
      onPress: onTogglePrivacy,
    },
    {
      label: 'Delete list',
      icon: 'trash-outline' as const,
      destructive: true,
      onPress: onDeleteList,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={collection?.name ?? 'Collection'}
        rightLabel={!collection ? undefined : selectMode ? 'Done' : isOwner ? 'Manage' : undefined}
        onRight={selectMode ? exitSelect : () => setManageOpen(true)}
      />

      {collection && isOwner && (
        <>
          <ActionSheet
            visible={manageOpen}
            onClose={() => setManageOpen(false)}
            title={collection.name}
            actions={manageActions}
          />
          <NameInputModal
            visible={renameOpen}
            title="Rename collection"
            initialValue={collection.name}
            submitLabel="Save"
            onSubmit={(name) => renameCollection(collection.id, name)}
            onClose={() => setRenameOpen(false)}
          />
        </>
      )}

      {!collection ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          {loading ? 'Loading…' : 'This list is private or no longer exists.'}
        </Text>
      ) : (
        <>
          {/* The list below is tall enough to squeeze this row flat once a fourth
              chip makes it scrollable — pin it so the labels can't get clipped. */}
          {options.length > 1 && (
            <View style={{ flexShrink: 0 }}>
              <FilterChips options={options} value={active} onChange={setFilter} />
            </View>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: selectMode ? 120 : 40 }}>
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {selectMode
                ? selected.length === 0
                  ? 'Tap items to remove'
                  : `${selected.length} selected`
                : total === 0
                  ? 'Nothing saved yet'
                  : `${shown} saved${isOwner && !collection.isPrivate ? ' · Shared' : ''}`}
            </Text>

            {showSection(PLATES) && plates.length > 0 && (
              <View style={styles.section}>
                {headed && <SectionHeader title="Plates" />}
                <View style={styles.grid}>
                  {plates.map((o) => {
                    const item: SavedItem = { type: 'plate', id: o.id };
                    return (
                      <Selectable
                        key={o.id}
                        active={selectMode}
                        picked={isPicked(item)}
                        onPress={() => togglePick(item)}>
                        <PlateTile order={o} width={tileWidth} />
                      </Selectable>
                    );
                  })}
                </View>
              </View>
            )}

            {showSection(PLATOS) && platos.length > 0 && (
              <View style={styles.section}>
                {headed && <SectionHeader title="Platos" />}
                <View style={styles.grid}>
                  {platos.map((p) => {
                    const item: SavedItem = { type: 'plato', id: p.id };
                    return (
                      <Selectable
                        key={p.id}
                        active={selectMode}
                        picked={isPicked(item)}
                        onPress={() => togglePick(item)}>
                        <PlatoTile
                          video={p}
                          width={tileWidth}
                          onSave={selectMode ? undefined : () => openSaveSheet(item)}
                          savedOverride={isSaved(item)}
                        />
                      </Selectable>
                    );
                  })}
                </View>
              </View>
            )}

            {showSection(PLACES) && restaurants.length > 0 && (
              <View style={styles.section}>
                {headed && <SectionHeader title="Places" />}
                <View style={{ paddingHorizontal: PADDING, gap: 10 }}>
                  {restaurants.map((r) => {
                    const item: SavedItem = { type: 'restaurant', id: r.id };
                    return (
                      <Selectable
                        key={r.id}
                        active={selectMode}
                        picked={isPicked(item)}
                        onPress={() => togglePick(item)}
                        fullWidth>
                        <RestaurantRow restaurant={r} />
                      </Selectable>
                    );
                  })}
                </View>
              </View>
            )}

            {total === 0 && (
              <View style={styles.emptyWrap}>
                <Ionicons name="bookmark-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing here yet</Text>
                <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                  {isOwner
                    ? `Tap the bookmark on any plate, Plato, or restaurant to save it to “${collection.name}”.`
                    : 'This list is empty.'}
                </Text>
              </View>
            )}
          </ScrollView>

          {selectMode && (
            <View
              style={[
                styles.selectBar,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  paddingBottom: insets.bottom + 12,
                },
              ]}>
              <Button
                label={selected.length === 1 ? 'Remove 1 item' : `Remove ${selected.length} items`}
                variant="danger"
                size="lg"
                disabled={selected.length === 0}
                onPress={removeSelected}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

/**
 * Wraps a tile so that, in select mode, tapping picks it instead of opening it.
 * The child is made non-interactive rather than re-plumbed with an onPress —
 * PlateTile and PlatoTile navigate on their own.
 */
function Selectable({
  active,
  picked,
  onPress,
  fullWidth,
  children,
}: {
  active: boolean;
  picked: boolean;
  onPress: () => void;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (!active) return <>{children}</>;

  return (
    <Pressable onPress={onPress} style={fullWidth ? { width: '100%' } : undefined}>
      <View pointerEvents="none" style={{ opacity: picked ? 0.6 : 1 }}>
        {children}
      </View>
      <View
        style={[
          styles.checkbox,
          {
            backgroundColor: picked ? colors.accent : 'rgba(0,0,0,0.45)',
            borderColor: picked ? colors.accent : '#fff',
          },
        ]}>
        {picked && <Ionicons name="checkmark" size={16} color={colors.accentText} />}
      </View>
    </Pressable>
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
  checkbox: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: PADDING,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
