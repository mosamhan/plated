import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchCities } from '@/data/cities';
import { tick } from '@/lib/haptics';
import { autocompleteLocations, type PlaceSuggestion } from '@/lib/places';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export interface RankLocation {
  label: string;
  lat: number;
  lng: number;
}

let cityIdSeq = 0;
function cityToSuggestion(c: { label: string; detail: string; lat: number; lng: number }): PlaceSuggestion {
  return { id: `city-${cityIdSeq++}-${c.label}`, label: c.label, detail: c.detail, lat: c.lat, lng: c.lng };
}

/**
 * Ranks' own "near" city — a search scoped to this sheet, not the app-wide
 * location setting. Browsing Chicago's top-rated plates shouldn't move your
 * actual location dot on the Discover map.
 */
export function RankLocationSheet({
  visible,
  title = 'Rank near a city',
  onClose,
  onBack,
  onSelect,
  onUseDeviceLocation,
}: {
  visible: boolean;
  /** Discover's own settings sheet reuses this same picker under different wording. */
  title?: string;
  onClose: () => void;
  /** Returns to the settings sheet this was opened from, rather than closing
   *  everything — for someone who opened this by accident. Falls back to
   *  `onClose` when the caller has nowhere to go back to. */
  onBack?: () => void;
  onSelect: (location: RankLocation) => void;
  onUseDeviceLocation: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setSuggestions([]);
    }
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Local city matches show immediately, every keystroke — Foursquare's own
    // results (when they arrive) are merged ahead of them. Foursquare returns
    // [] on any failure (missing key, exhausted quota, network), which used
    // to leave this picker with literally nothing to tap; the static list
    // means typing a real city always finds something clickable right away.
    const local = searchCities(q);
    setSuggestions(local.map(cityToSuggestion));
    debounce.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      const res = await autocompleteLocations(q);
      if (seq !== reqSeq.current) return;
      const seen = new Set(res.map((r) => r.label.toLowerCase()));
      const merged = [...res, ...local.filter((c) => !seen.has(c.label.toLowerCase())).map(cityToSuggestion)];
      setSuggestions(merged);
      setSearching(false);
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack ?? onClose}>
      {/* The field autofocuses, so without this the keyboard opens straight
          over the sheet and hides both the input and every suggestion. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={styles.backdropFill} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={styles.titleRow}>
            {/* Returns to the sheet this was opened from — for someone who
                tapped in by accident and wants back out, not all the way to
                the Ranks page behind everything. */}
            {onBack && (
              <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
            )}
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          </View>

          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search a city"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text }]}
              autoFocus
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
          </View>

          <Pressable
            onPress={() => {
              tick();
              onUseDeviceLocation();
            }}
            style={styles.row}>
            <Ionicons name="locate" size={18} color={colors.accent} />
            <Text style={[styles.rowText, { color: colors.text }]}>Use my location</Text>
          </Pressable>

          {suggestions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => {
                if (s.lat == null || s.lng == null) return;
                tick();
                onSelect({ label: s.label, lat: s.lat, lng: s.lng });
              }}
              style={styles.row}>
              <Ionicons name="location-outline" size={18} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]} numberOfLines={1}>
                  {s.label}
                </Text>
                {!!s.detail && (
                  <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={1}>
                    {s.detail}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backBtn: { marginLeft: -6, marginRight: 2 },
  title: { fontSize: 17, fontWeight: '800' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  input: { flex: 1, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowText: { fontSize: 15, fontWeight: '600' },
  rowDetail: { fontSize: 12, fontWeight: '500', marginTop: 1 },
});
