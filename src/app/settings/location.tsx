import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { tick } from '@/lib/haptics';
import { autocompleteLocations, searchPlaces, type PlaceSuggestion } from '@/lib/places';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

// A few quick test cities so you can preview other markets.
const PRESETS = ['New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Austin, TX', 'Boston, MA', 'Miami, FL'];

export default function LocationSettings() {
  const { colors } = useTheme();
  const router = useRouter();
  const { location, useDeviceLocation, setManualLocation, busy, error } = useLocation();
  const [city, setCity] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  // Debounced type-ahead: fetch location suggestions ~250ms after typing stops.
  useEffect(() => {
    const q = city.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      const res = await autocompleteLocations(q);
      // Ignore results from a stale keystroke.
      if (seq === reqSeq.current) {
        setSuggestions(res);
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [city]);

  const onUseDevice = async () => {
    tick();
    const ok = await useDeviceLocation();
    if (ok) router.back();
  };

  // Pick an autocomplete suggestion — it already carries coordinates.
  const onPickSuggestion = (s: PlaceSuggestion) => {
    tick();
    setManualLocation(s.label, s.lat != null ? { lat: s.lat, lng: s.lng! } : undefined);
    router.back();
  };

  // Fallback for a free-typed city with no suggestion tapped: geocode it.
  const onSetCity = async (label: string) => {
    tick();
    setGeocoding(true);
    const results = await searchPlaces('restaurant', { near: label });
    setGeocoding(false);
    const coords = results[0]?.lat != null ? { lat: results[0].lat!, lng: results[0].lng! } : undefined;
    setManualLocation(label, coords);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Location" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={[styles.current, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="location" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.currentLabel, { color: colors.text }]}>{location.label}</Text>
            <Text style={[styles.currentSource, { color: colors.textMuted }]}>
              {location.source === 'device'
                ? 'Using your current location'
                : location.source === 'manual'
                  ? 'Set manually'
                  : 'Default'}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onUseDevice}
          disabled={busy}
          style={[styles.deviceBtn, { backgroundColor: colors.accent }]}>
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <>
              <Ionicons name="navigate" size={18} color={colors.accentText} />
              <Text style={[styles.deviceText, { color: colors.accentText }]}>Use my current location</Text>
            </>
          )}
        </Pressable>
        {error && <Text style={[styles.error, { color: colors.ratingLow }]}>{error}</Text>}

        <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl }]}>Set a city</Text>
        <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={city}
            onChangeText={setCity}
            onSubmitEditing={() => city.trim() && onSetCity(city.trim())}
            returnKeyType="go"
            placeholder="Search a city or neighborhood"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {(geocoding || searching) && <ActivityIndicator size="small" color={colors.accent} />}
        </View>

        {/* Autocomplete suggestions */}
        {suggestions.length > 0 && (
          <View style={[styles.suggestions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {suggestions.map((s, i) => (
              <Pressable
                key={s.id}
                onPress={() => onPickSuggestion(s)}
                style={[styles.suggestRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <Ionicons name="location-outline" size={17} color={colors.accent} />
                <Text style={[styles.suggestText, { color: colors.text }]} numberOfLines={1}>
                  {s.label}
                  {s.detail ? <Text style={{ color: colors.textMuted }}> · {s.detail}</Text> : null}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.presetLabel, { color: colors.textMuted }]}>Or try a market</Text>
        <View style={styles.presets}>
          {PRESETS.map((p) => {
            const active = p === location.label;
            return (
              <Pressable
                key={p}
                onPress={() => onSetCity(p)}
                style={[
                  styles.preset,
                  { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border },
                ]}>
                <Text style={{ color: active ? colors.accentText : colors.text, fontWeight: '700', fontSize: 13 }}>{p}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.note, { color: colors.textMuted }]}>
          Your location decides which restaurants appear when you search and add plates. It stays on
          this device.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  current: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, borderRadius: radius.lg },
  currentLabel: { fontSize: 17, fontWeight: '800' },
  currentSource: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  deviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.lg,
    paddingVertical: 15,
    borderRadius: radius.lg,
  },
  deviceText: { fontSize: 15, fontWeight: '800' },
  error: { fontSize: 13, fontWeight: '600', marginTop: 10, textAlign: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    minHeight: 48,
    marginTop: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', paddingVertical: 12 },
  suggestions: { marginTop: spacing.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  suggestText: { flex: 1, fontSize: 15, fontWeight: '600' },
  presetLabel: { fontSize: 13, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  note: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: spacing.xl },
});
