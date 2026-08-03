import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FILTERABLE_PLACE_TYPES, PLACE_TYPE_META, STATUS_META } from '@/components/ExploreMap';
import type { PlaceStatus, PlaceType } from '@/lib/placeType';
import { useCollections } from '@/store/CollectionsContext';
import { useLocation } from '@/store/LocationContext';
import { useData } from '@/store/DataContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

function SheetShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * The map's single "controls" menu, opened from the top-left button. Gathers
 * everything that used to live in the bottom control bar — who to show
 * (My Table / Platers), search, categories — plus map appearance, avoid-tolls,
 * and collections. One place for every map option.
 */
export function MapSettingsSheet({
  onClose,
  mapTheme,
  setMapTheme,
  myTableOnly,
  setMyTableOnly,
  onOpenCollections,
  onOpenCategories,
  onOpenLocation,
}: {
  onClose: () => void;
  mapTheme: 'light' | 'dark';
  setMapTheme: (t: 'light' | 'dark') => void;
  myTableOnly: boolean;
  setMyTableOnly: (v: boolean) => void;
  onOpenCollections: () => void;
  onOpenCategories: () => void;
  /** Change the active city/GPS location — the map is now the only place that
   *  setting is reachable from, since Explore's header lost its chip. */
  onOpenLocation: () => void;
}) {
  const { colors } = useTheme();
  const { collections } = useCollections();
  const { location } = useLocation();
  const savedCount = collections.reduce((n, c) => n + c.items.filter((i) => i.type === 'restaurant').length, 0);

  const seg = (val: 'light' | 'dark', label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const on = mapTheme === val;
    return (
      <Pressable
        onPress={() => setMapTheme(val)}
        style={[styles.seg, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }]}>
        <Ionicons name={icon} size={16} color={on ? colors.accent : colors.textMuted} />
        <Text style={[styles.segText, { color: colors.text }]}>{label}</Text>
      </Pressable>
    );
  };

  const showSeg = (val: boolean, label: string, icon: keyof typeof Ionicons.glyphMap) => {
    const on = myTableOnly === val;
    return (
      <Pressable
        onPress={() => setMyTableOnly(val)}
        style={[styles.seg, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }]}>
        <Ionicons name={icon} size={16} color={on ? colors.accent : colors.textMuted} />
        <Text style={[styles.segText, { color: colors.text }]}>{label}</Text>
      </Pressable>
    );
  };

  const linkRow = (icon: keyof typeof Ionicons.glyphMap, label: string, value: string | null, onPress: () => void) => (
    <Pressable onPress={onPress} style={[styles.linkRow, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={[styles.linkLabel, { color: colors.text }]}>{label}</Text>
      {value && <Text style={{ fontSize: 13, color: colors.textMuted }}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <SheetShell onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>Map controls</Text>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SHOW</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        {showSeg(true, 'My Table', 'bookmark')}
        {showSeg(false, 'Platers', 'earth')}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LOCATION</Text>
      {linkRow('location-outline', 'Where you\u2019re looking', location.label, () => {
        onClose();
        onOpenLocation();
      })}

      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 20 }]}>FIND</Text>
      {linkRow('pricetags-outline', 'Categories', null, () => {
        onClose();
        onOpenCategories();
      })}
      {linkRow('bookmark-outline', 'Collections', `${savedCount} saved`, () => {
        onClose();
        onOpenCollections();
      })}

      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 20 }]}>MAP APPEARANCE</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        {seg('light', 'Light', 'sunny-outline')}
        {seg('dark', 'Dark', 'moon-outline')}
      </View>

    </SheetShell>
  );
}

/** Toggle which pin categories render on the map. */
export function CategoriesSheet({
  onClose,
  activeTypes,
  setActiveTypes,
  activeStatuses,
  setActiveStatuses,
}: {
  onClose: () => void;
  activeTypes: PlaceType[];
  setActiveTypes: (fn: (prev: PlaceType[]) => PlaceType[]) => void;
  activeStatuses: PlaceStatus[];
  setActiveStatuses: (fn: (prev: PlaceStatus[]) => PlaceStatus[]) => void;
}) {
  const { colors } = useTheme();
  const toggleType = (k: PlaceType) =>
    setActiveTypes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const toggleStatus = (k: PlaceStatus) =>
    setActiveStatuses((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const allTypes = FILTERABLE_PLACE_TYPES;
  const allOn = activeTypes.length === allTypes.length;

  return (
    <SheetShell onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>Filters</Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
        Leave everything off to see it all. The glyph on a pin is what kind of place it is; the
        colour is your history with it.
      </Text>

      <View style={styles.groupHead}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PLACE TYPE</Text>
        <Pressable onPress={() => setActiveTypes(() => (allOn ? [] : allTypes))}>
          <Text style={[styles.groupAction, { color: colors.accent }]}>{allOn ? 'Clear' : 'All'}</Text>
        </Pressable>
      </View>
      <View style={styles.chipWrap}>
        {allTypes.map((key) => {
          const on = activeTypes.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => toggleType(key)}
              style={[
                styles.chip,
                { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : 'transparent' },
              ]}>
              <MaterialCommunityIcons name={PLACE_TYPE_META[key].icon} size={15} color={on ? colors.accent : colors.textMuted} />
              <Text style={[styles.chipText, { color: on ? colors.text : colors.textMuted }]}>
                {PLACE_TYPE_META[key].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 20 }]}>YOUR STATUS</Text>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
        Leave all off to see places regardless of your history.
      </Text>
      <View style={styles.chipWrap}>
        {(Object.keys(STATUS_META) as PlaceStatus[]).map((key) => {
          const on = activeStatuses.includes(key);
          const meta = STATUS_META[key];
          return (
            <Pressable
              key={key}
              onPress={() => toggleStatus(key)}
              style={[
                styles.chip,
                { borderColor: on ? meta.color : colors.border, backgroundColor: on ? `${meta.color}22` : 'transparent' },
              ]}>
              <Ionicons name={meta.icon} size={14} color={on ? meta.color : colors.textMuted} />
              <Text style={[styles.chipText, { color: on ? colors.text : colors.textMuted }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SheetShell>
  );
}

/** The user's saved restaurant collections. */
export function CollectionsSheet({ onClose, onSelectRestaurant }: { onClose: () => void; onSelectRestaurant: (id: string) => void }) {
  const { colors } = useTheme();
  const { collections } = useCollections();
  const { restaurantFor } = useData();
  const savedRestaurantIds = Array.from(
    new Set(collections.flatMap((c) => c.items.filter((i) => i.type === 'restaurant').map((i) => i.id))),
  );

  return (
    <SheetShell onClose={onClose}>
      <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>Your Collections</Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
        {savedRestaurantIds.length} saved {savedRestaurantIds.length === 1 ? 'place' : 'places'}
      </Text>

      {savedRestaurantIds.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={36} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No saved places yet. Tap a pin, then Save to add it to a list.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {collections.map((c) => {
            const places = c.items.filter((i) => i.type === 'restaurant');
            if (places.length === 0) return null;
            return (
              <View key={c.id} style={{ marginBottom: 14 }}>
                <Text style={[styles.collName, { color: colors.textMuted }]}>{c.name.toUpperCase()}</Text>
                {places.map((i) => (
                  <Pressable
                    key={i.id}
                    onPress={() => {
                      onClose();
                      onSelectRestaurant(i.id);
                    }}
                    style={[styles.placeRow, { borderBottomColor: colors.border }]}>
                    <Ionicons name="location" size={18} color={colors.accent} />
                    <Text style={[styles.placeText, { color: colors.text }]} numberOfLines={1}>
                      {restaurantFor(i.id)?.name ?? 'Saved place'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: 12 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 16, fontFamily: displayFont },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segText: { fontWeight: '700', fontSize: 14 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  groupAction: { fontSize: 13, fontWeight: '800' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  catDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  catLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  emptyText: { fontSize: 14, fontWeight: '500', textAlign: 'center', paddingHorizontal: 20, lineHeight: 20 },
  collName: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  placeText: { flex: 1, fontSize: 15, fontWeight: '700' },
});
