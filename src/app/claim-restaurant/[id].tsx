import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { warn } from '@/lib/haptics';
import { pickImage, uploadPrivateAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** One of the three verification documents an admin reviews before approving a claim. */
interface DocSlot {
  key: 'idDocumentPath' | 'authorizationDocumentPath' | 'storefrontPhotoPath';
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const DOC_SLOTS: DocSlot[] = [
  { key: 'idDocumentPath', label: 'Government-issued ID', hint: "Yours — we're confirming who's asking, not just the business.", icon: 'card-outline' },
  {
    key: 'authorizationDocumentPath',
    label: 'Proof you run this business',
    hint: 'A business license, or a utility bill/lease at the business address.',
    icon: 'document-text-outline',
  },
  { key: 'storefrontPhotoPath', label: 'Storefront photo', hint: 'A photo of the sign or entrance — quick, corroborating evidence.', icon: 'storefront-outline' },
];

/**
 * "Claim this restaurant" — files a request an admin reviews and approves
 * manually (see 0032_restaurant_claims.sql). Deliberately not a self-serve
 * signup: at this stage getting a rate and getting verified both happen
 * through a real conversation, not a form that grants anything on its own.
 */
export default function ClaimRestaurant() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restaurantFor, submitRestaurantClaim } = useData();
  const { userId } = useAuth();

  const restaurant = restaurantFor(id);

  const [businessName, setBusinessName] = useState(restaurant?.name ?? '');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Local preview URI + the uploaded private-bucket path, per doc slot. Path
  // stays undefined until the upload actually finishes — that's what submit
  // gates on, not just "a photo was picked."
  const [docs, setDocs] = useState<Record<DocSlot['key'], { uri: string; path?: string; uploading: boolean }>>(
    {} as Record<DocSlot['key'], { uri: string; path?: string; uploading: boolean }>,
  );

  const pickDoc = async (slot: DocSlot['key']) => {
    const asset = await pickImage();
    if (!asset) return;
    setDocs((d) => ({ ...d, [slot]: { uri: asset.uri, uploading: true } }));
    // No Supabase session in mock mode — keep the local preview so the form
    // still feels complete, just without anything to actually upload.
    if (!userId) {
      setDocs((d) => ({ ...d, [slot]: { uri: asset.uri, path: asset.uri, uploading: false } }));
      return;
    }
    const path = await uploadPrivateAsset('restaurant-verification', userId, asset);
    setDocs((d) => ({ ...d, [slot]: { uri: asset.uri, path: path ?? undefined, uploading: false } }));
  };

  const docsReady = DOC_SLOTS.every((s) => docs[s.key]?.path);
  const canSubmit = businessName.trim() && role.trim() && email.trim() && docsReady && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const ok = await submitRestaurantClaim({
      restaurantId: id,
      businessName: businessName.trim(),
      role: role.trim(),
      contactEmail: email.trim(),
      contactPhone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      idDocumentPath: docs.idDocumentPath?.path,
      authorizationDocumentPath: docs.authorizationDocumentPath?.path,
      storefrontPhotoPath: docs.storefrontPhotoPath?.path,
    });
    setSubmitting(false);
    if (ok) {
      warn();
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Claim submitted" closeMode />
        <View style={styles.doneWrap}>
          <View style={[styles.doneIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="storefront" size={40} color={colors.accent} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>Thanks — we&apos;ll be in touch</Text>
          <Text style={[styles.doneBody, { color: colors.textMuted }]}>
            We review every claim by hand and reach out at the email you gave us to verify you&apos;re
            with {restaurant?.name ?? 'the restaurant'} and set up promotion.
          </Text>
          <Button label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Claim this restaurant" closeMode />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.lead, { color: colors.textMuted }]}>
          {restaurant
            ? `Tell us who you are at ${restaurant.name} and we'll reach out to verify and set up promotion.`
            : "Tell us who you are and we'll reach out to verify and set up promotion."}
        </Text>

        <Text style={[styles.label, { color: colors.text }]}>Business name</Text>
        <TextInput
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. Golden Char"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        />

        <Text style={[styles.label, { color: colors.text }]}>Your role</Text>
        <TextInput
          value={role}
          onChangeText={setRole}
          placeholder="e.g. Owner, General Manager"
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

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>VERIFICATION</Text>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
          So an admin can actually confirm this is you — reviewed by hand, never shown publicly.
        </Text>
        {DOC_SLOTS.map((slot) => {
          const doc = docs[slot.key];
          return (
            <Pressable
              key={slot.key}
              onPress={() => pickDoc(slot.key)}
              style={[styles.docRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {doc?.uri ? (
                <Image source={{ uri: doc.uri }} style={styles.docThumb} contentFit="cover" />
              ) : (
                <View style={[styles.docThumb, styles.docThumbEmpty, { borderColor: colors.border }]}>
                  <Ionicons name={slot.icon} size={20} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.docLabel, { color: colors.text }]}>{slot.label}</Text>
                <Text style={[styles.docHint, { color: colors.textMuted }]} numberOfLines={2}>
                  {slot.hint}
                </Text>
              </View>
              {doc?.uploading ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : doc?.path ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
              ) : (
                <Ionicons name="add-circle-outline" size={22} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}

        <Text style={[styles.label, { color: colors.text }]}>Anything else? (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="What you're hoping to promote, timing, etc."
          placeholderTextColor={colors.textMuted}
          multiline
          style={[
            styles.input,
            styles.notes,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        <Button
          label={submitting ? 'Submitting…' : 'Submit claim'}
          size="lg"
          onPress={submit}
          disabled={!canSubmit}
          loading={submitting}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: spacing.md },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    fontSize: 14,
    fontWeight: '500',
  },
  notes: { minHeight: 90, textAlignVertical: 'top' },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: spacing.lg },
  sectionHint: { fontSize: 12, fontWeight: '500', marginTop: 4, marginBottom: spacing.md, lineHeight: 17 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  docThumb: { width: 44, height: 44, borderRadius: radius.sm },
  docThumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  docLabel: { fontSize: 14, fontWeight: '700' },
  docHint: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 60, gap: spacing.lg },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 20, fontWeight: '800' },
  doneBody: { fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center' },
});
