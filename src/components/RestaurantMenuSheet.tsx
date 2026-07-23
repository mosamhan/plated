import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RatingBadge } from '@/components/RatingBadge';
import { RatingInput } from '@/components/RatingInput';
import { tapLight } from '@/lib/haptics';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export interface MenuEntry {
  name: string;
  /** Community avg rating (0 if it's an API item with no ratings yet). */
  rating: number;
  count: number;
}

/**
 * A restaurant's menu as a bottom sheet. Each dish shows its community rating
 * (when it has one) and — when `onAdd` is provided (the add-plate flow) —
 * expands inline to a rating input + "Add to order" so the user can add and
 * rate it. Without `onAdd` it's a read-only menu (restaurant detail).
 */
export function RestaurantMenuSheet({
  visible,
  restaurantName,
  menu,
  addedNames = [],
  onAdd,
  onClose,
}: {
  visible: boolean;
  restaurantName: string;
  menu: MenuEntry[];
  /** Names already on the current order (shown as added, not re-addable). */
  addedNames?: string[];
  /** When set, each dish can be added to the order at a chosen rating. */
  onAdd?: (name: string, rating: number) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState(8);

  const startAdd = (name: string) => {
    setExpanded(name);
    setDraftRating(8);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]} numberOfLines={1}>
            {restaurantName} menu
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {menu.length ? 'Rated by the Plated community' : 'No dishes yet — add the first one below.'}
          </Text>

          <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
            {menu.map((m) => {
              const added = addedNames.some((n) => n.toLowerCase() === m.name.toLowerCase());
              const isExpanded = expanded === m.name;
              return (
                <View key={m.name} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <View style={styles.rowMain}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dish, { color: colors.text }]} numberOfLines={1}>{m.name}</Text>
                      <Text style={[styles.meta, { color: colors.textMuted }]}>
                        {m.count > 0 ? `${m.count} ${m.count === 1 ? 'rating' : 'ratings'}` : 'On the menu'}
                      </Text>
                    </View>
                    {m.rating > 0 && <RatingBadge score={m.rating} size="sm" />}
                    {onAdd &&
                      (added ? (
                        <View style={[styles.addedPill, { backgroundColor: colors.accentSoft }]}>
                          <Ionicons name="checkmark" size={14} color={colors.accent} />
                          <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>Added</Text>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => (isExpanded ? setExpanded(null) : startAdd(m.name))}
                          style={[styles.addBtn, { backgroundColor: isExpanded ? colors.surface : colors.accent, borderColor: colors.border, borderWidth: isExpanded ? StyleSheet.hairlineWidth : 0 }]}>
                          <Ionicons name={isExpanded ? 'close' : 'add'} size={16} color={isExpanded ? colors.text : colors.accentText} />
                        </Pressable>
                      ))}
                  </View>

                  {/* Inline rate + add */}
                  {onAdd && isExpanded && (
                    <View style={[styles.rateBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <RatingInput value={draftRating} onChange={setDraftRating} />
                      <Pressable
                        onPress={() => {
                          onAdd(m.name, draftRating);
                          tapLight();
                          setExpanded(null);
                        }}
                        style={[styles.confirmAdd, { backgroundColor: colors.accent }]}>
                        <Ionicons name="add" size={16} color={colors.accentText} />
                        <Text style={{ color: colors.accentText, fontWeight: '800', fontSize: 14 }}>Add to order</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable onPress={onClose} style={[styles.done, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: 12 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600' },
  sub: { fontSize: 13, fontWeight: '500', marginTop: 2, marginBottom: 12 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dish: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  addBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  addedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: radius.pill },
  rateBox: { marginTop: 12, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  confirmAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.md },
  done: { marginTop: 14, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
