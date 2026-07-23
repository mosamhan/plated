import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PIN_META, type PinCategory } from '@/components/ExploreMap';
import { useCollections } from '@/store/CollectionsContext';
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
  avoidTolls,
  setAvoidTolls,
  myTableOnly,
  setMyTableOnly,
  onOpenCollections,
  onOpenCategories,
}: {
  onClose: () => void;
  mapTheme: 'light' | 'dark';
  setMapTheme: (t: 'light' | 'dark') => void;
  avoidTolls: boolean;
  setAvoidTolls: (v: boolean) => void;
  myTableOnly: boolean;
  setMyTableOnly: (v: boolean) => void;
  onOpenCollections: () => void;
  onOpenCategories: () => void;
}) {
  const { colors } = useTheme();
  const { collections } = useCollections();
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

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>FIND</Text>
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

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>DIRECTIONS</Text>
      <View style={styles.tollRow}>
        <Ionicons name="cash-outline" size={20} color={colors.text} />
        <Text style={[styles.linkLabel, { color: colors.text }]}>Avoid tolls</Text>
        <Switch
          value={avoidTolls}
          onValueChange={setAvoidTolls}
          trackColor={{ true: colors.accent, false: colors.border }}
          thumbColor="#fff"
        />
      </View>
    </SheetShell>
  );
}

/** Toggle which pin categories render on the map. */
export function CategoriesSheet({
  onClose,
  activeTypes,
  setActiveTypes,
}: {
  onClose: () => void;
  activeTypes: PinCategory[];
  setActiveTypes: (fn: (prev: PinCategory[]) => PinCategory[]) => void;
}) {
  const { colors } = useTheme();
  const toggle = (k: PinCategory) =>
    setActiveTypes((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  return (
    <SheetShell onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>Categories</Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>Choose which pins show on the map.</Text>
      {(Object.keys(PIN_META) as PinCategory[]).map((key) => {
        const meta = PIN_META[key];
        const on = activeTypes.includes(key);
        return (
          <Pressable key={key} onPress={() => toggle(key)} style={[styles.catRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.catDot, { backgroundColor: meta.color }]}>
              <Ionicons name={meta.icon} size={17} color="#fff" />
            </View>
            <Text style={[styles.catLabel, { color: colors.text }]}>{meta.label}</Text>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.accent : colors.textMuted} />
          </Pressable>
        );
      })}
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
  tollRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, marginBottom: 4 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
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
