import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showAlert } from '@/lib/dialog';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Reached from onboarding's username step ("Own a restaurant? Claim it
 * here"). Search is deliberately Plated's own DB only, not also Foursquare
 * like the map's InlineSearch — this is a quick detour off onboarding, not
 * the primary search experience. A match hands off to the existing,
 * unchanged claim-restaurant flow; no match offers a lightweight request
 * queue instead (0048_onboarding_extras.sql's restaurant_requests).
 */
export default function FindRestaurant() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { searchRestaurants, submitRestaurantRequest } = useData();
  const [query, setQuery] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const results = query.trim().length >= 2 ? searchRestaurants(query) : [];

  const submitRequest = async () => {
    if (!businessName.trim() || !location.trim() || !email.trim()) {
      showAlert('A few things are missing', 'Business name, location, and a contact email are needed.');
      return;
    }
    setSubmitting(true);
    const ok = await submitRestaurantRequest({
      businessName: businessName.trim(),
      location: location.trim(),
      contactEmail: email.trim(),
      contactPhone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (ok) setSubmitted(true);
    else showAlert('Couldn’t send that', 'Please try again.');
  };

  if (submitted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Request sent" closeMode />
        <View style={styles.doneWrap}>
          <View style={[styles.doneIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="storefront" size={40} color={colors.accent} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>Thanks — we’ll take it from here</Text>
          <Text style={[styles.doneBody, { color: colors.textMuted }]}>
            We review every request by hand and reach out at the email you gave us once it’s added.
          </Text>
          <Button label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  if (requesting) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Request a restaurant" closeMode />
        <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
          <Text style={[styles.lead, { color: colors.textMuted }]}>
            Tell us about the restaurant and we’ll get it added.
          </Text>
          <Text style={[styles.label, { color: colors.text }]}>Business name</Text>
          <TextInput
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="e.g. Golden Char"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
          <Text style={[styles.label, { color: colors.text }]}>Location</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="City, neighborhood, or address"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
          <Text style={[styles.label, { color: colors.text }]}>Contact email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@restaurant.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
          <Text style={[styles.label, { color: colors.text }]}>Phone (optional)</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="For a quick verification call"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
          <Text style={[styles.label, { color: colors.text }]}>Anything else? (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Whatever's useful"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, styles.notes, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          />
          <Button
            label={submitting ? 'Sending…' : 'Send request'}
            size="lg"
            onPress={submitRequest}
            loading={submitting}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Find your restaurant" closeMode />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoFocus
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
      </View>
      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/claim-restaurant/${item.id}`)}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
                {item.cuisine} · {item.location}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        ListEmptyComponent={
          query.trim().length >= 2 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No matches for “{query.trim()}”.</Text>
          ) : null
        }
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.footerText, { color: colors.textMuted }]} onPress={() => setRequesting(true)}>
          Can’t find it? <Text style={{ color: colors.accent, fontWeight: '700' }}>Request we add it</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  empty: { textAlign: 'center', fontSize: 13, fontWeight: '500', marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  footerText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  lead: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: spacing.md },
  input: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: 14, fontSize: 14, fontWeight: '500' },
  notes: { minHeight: 90, textAlignVertical: 'top' },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 60, gap: spacing.lg },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 20, fontWeight: '800' },
  doneBody: { fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center' },
});
