import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import type { Restaurant } from '@/data/types';
import { showAlert } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import { pickImages, uploadAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useData, type RestaurantPagePatch } from '@/store/DataContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const MAX_PHOTOS = 8;

type OrderMode = NonNullable<Restaurant['orderMode']>;
type ReservationPlatform = NonNullable<Restaurant['reservationPlatform']>;

/**
 * The restaurant-facing editor: the parts of a listing its owner controls.
 *
 * Deliberately *only* the six columns 0042 grants owners write access to.
 * Everything else on a restaurant page — its rating, its plates, its ranking —
 * belongs to the people who ate there, and a restaurant being able to edit
 * those would make every number on Plated worthless.
 *
 * Ownership today is a `restaurant_owners` row on a normal user account. This
 * screen only ever reads `ownedRestaurantIds`, so if business accounts land
 * later, that's an auth-layer change and this screen keeps working unchanged.
 */
export default function EditRestaurantPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { userId } = useAuth();
  const { restaurantFor, ownedRestaurantIds, updateRestaurantPage } = useData();

  const restaurant = restaurantFor(id);
  const owned = ownedRestaurantIds.has(id);

  const [name, setName] = useState(restaurant?.name ?? '');
  const [photos, setPhotos] = useState<string[]>(restaurant?.photos ?? []);
  const [orderMode, setOrderMode] = useState<OrderMode | undefined>(restaurant?.orderMode);
  const [platform, setPlatform] = useState<ReservationPlatform | undefined>(restaurant?.reservationPlatform);
  const [reservationUrl, setReservationUrl] = useState(restaurant?.reservationUrl ?? '');
  const [orderUrl, setOrderUrl] = useState(restaurant?.externalOrderUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!restaurant || !owned) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Edit page" />
        <Text style={[styles.gate, { color: colors.textMuted }]}>
          {restaurant ? 'You don’t manage this restaurant.' : 'Restaurant not found.'}
        </Text>
      </View>
    );
  }

  const addPhotos = async () => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      showAlert('Photo limit reached', `A listing can show up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const assets = await pickImages(remaining);
    if (!assets.length || !userId) return;
    setUploading(true);
    const urls = await Promise.all(assets.map((a) => uploadAsset('plates', userId, a)));
    setUploading(false);
    const ok = urls.filter((u): u is string => !!u);
    if (ok.length < assets.length) showAlert('Some photos didn’t upload', 'Please try those again.');
    if (ok.length) setPhotos((p) => [...p, ...ok]);
  };

  const save = async () => {
    tapLight();
    setSaving(true);
    const patch: RestaurantPagePatch = {
      // Sent as-is: an empty string clears the override back to the imported
      // name, which is the only way an owner can undo a rename.
      customName: name.trim(),
      photos,
      orderMode,
      reservationPlatform: orderMode === 'reservation' ? platform : undefined,
      reservationUrl: orderMode === 'reservation' ? reservationUrl.trim() : '',
      externalOrderUrl: orderUrl.trim(),
    };
    const ok = await updateRestaurantPage(id, patch);
    setSaving(false);
    if (!ok) {
      showAlert(
        'Couldn’t save',
        restaurant.verified
          ? 'Your changes weren’t saved. Check your connection and try again.'
          : 'This listing isn’t verified yet, so edits can’t be saved. Verification comes with an active subscription.',
      );
      return;
    }
    router.back();
  };

  const seg = <T extends string>(
    current: T | undefined,
    value: T,
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    onPick: (v: T) => void,
  ) => {
    const on = current === value;
    return (
      <Pressable
        onPress={() => {
          tapLight();
          onPick(value);
        }}
        style={[
          styles.seg,
          { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface },
        ]}>
        <Ionicons name={icon} size={16} color={on ? colors.accent : colors.textMuted} />
        <Text style={[styles.segText, { color: colors.text }]}>{label}</Text>
      </Pressable>
    );
  };

  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
      />
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Edit page" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          You control how your listing presents itself. Ratings, plates and rankings come from diners and
          aren’t editable.
        </Text>

        {/* The DB policy (0042) requires a verified restaurant to accept edits.
            Saying so up front beats letting someone fill the whole form in and
            hit a failure they can't act on. */}
        {!restaurant.verified && (
          <View style={[styles.banner, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
            <Text style={[styles.bannerText, { color: colors.text }]}>
              Your claim is approved, but this listing isn’t verified yet — edits can’t be saved until it is.
              Verification comes with an active subscription.
            </Text>
          </View>
        )}

        <Text style={[styles.section, { color: colors.text }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Restaurant name"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
        />

        <Text style={[styles.section, { color: colors.text }]}>Photos</Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          The first photo is your listing’s cover image.
        </Text>
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <View key={uri} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} contentFit="cover" />
              {i === 0 && (
                <View style={[styles.coverTag, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.coverTagText, { color: colors.accentText }]}>Cover</Text>
                </View>
              )}
              <Pressable
                onPress={() => setPhotos((p) => p.filter((u) => u !== uri))}
                hitSlop={6}
                style={styles.photoRemove}>
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={addPhotos}
            disabled={uploading}
            style={[styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {uploading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="add" size={24} color={colors.accent} />
            )}
          </Pressable>
        </View>

        <Text style={[styles.section, { color: colors.text }]}>How people order</Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Sets what Plated offers first when someone taps Order. Leave unset and Plated guesses from your
          price level.
        </Text>
        <View style={styles.segRow}>
          {seg(orderMode, 'delivery', 'Delivery', 'bicycle', setOrderMode)}
          {seg(orderMode, 'reservation', 'Reservation', 'calendar', setOrderMode)}
        </View>

        {orderMode === 'reservation' && (
          <>
            <Text style={[styles.label, { color: colors.textMuted }]}>RESERVATION PLATFORM</Text>
            <View style={styles.segRow}>
              {seg(platform, 'opentable', 'OpenTable', 'restaurant-outline', setPlatform)}
              {seg(platform, 'resy', 'Resy', 'restaurant-outline', setPlatform)}
              {seg(platform, 'other', 'Other', 'link-outline', setPlatform)}
            </View>
            {field('RESERVATION LINK', reservationUrl, setReservationUrl, 'https://…')}
          </>
        )}

        {field('YOUR OWN ORDER PAGE', orderUrl, setOrderUrl, 'https://…')}
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Preferred over a DoorDash or Uber Eats search when set.
        </Text>

        <Button label={saving ? 'Saving…' : 'Save changes'} size="lg" disabled={saving} onPress={save} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gate: { textAlign: 'center', marginTop: 60, fontSize: 15, fontWeight: '600' },
  section: { ...typography.heading, marginTop: spacing.xl, marginBottom: spacing.sm },
  note: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginBottom: spacing.md },
  banner: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: 8 },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 92, height: 92 },
  photo: { width: 92, height: 92, borderRadius: radius.md },
  coverTag: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  coverTagText: { fontSize: 9, fontWeight: '800' },
  photoRemove: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhoto: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segRow: { flexDirection: 'row', gap: 10 },
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
  segText: { fontWeight: '700', fontSize: 13 },
});
