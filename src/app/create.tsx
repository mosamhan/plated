import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { RatingInput } from '@/components/RatingInput';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { foodPhoto } from '@/data/images';
import { success } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const SAMPLE_PHOTOS = Array.from({ length: 15 }, (_, i) => foodPhoto(i));

export default function CreatePlate() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restaurantId } = useLocalSearchParams<{ restaurantId?: string }>();
  const { restaurants, addOrder } = useData();

  const [selectedRestaurant, setSelectedRestaurant] = useState<string | undefined>(restaurantId);
  const [photo, setPhoto] = useState<string>(SAMPLE_PHOTOS[0]);
  const [dishName, setDishName] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(8);

  const canPost = !!selectedRestaurant && dishName.trim().length > 0;

  const onPost = () => {
    if (!canPost || !selectedRestaurant) return;
    addOrder({
      restaurantId: selectedRestaurant,
      dishName: dishName.trim(),
      photo,
      description: description.trim() || 'No notes yet.',
      rating,
      tags: ['Nearby'],
    });
    success();
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="New plate" closeMode />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled">
        {/* Photo */}
        <Image source={{ uri: photo }} style={[styles.preview, { backgroundColor: colors.surface }]} contentFit="cover" />
        <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Choose a photo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {SAMPLE_PHOTOS.map((p) => (
            <Pressable key={p} onPress={() => setPhoto(p)}>
              <Image
                source={{ uri: p }}
                style={[
                  styles.thumb,
                  { borderColor: p === photo ? colors.accent : colors.border, borderWidth: p === photo ? 3 : 1 },
                ]}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </ScrollView>

        {/* Restaurant */}
        <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: spacing.xl }]}>Restaurant</Text>
        <View style={styles.restaurantWrap}>
          {restaurants.map((r) => {
            const active = r.id === selectedRestaurant;
            return (
              <Pressable
                key={r.id}
                onPress={() => setSelectedRestaurant(r.id)}
                style={[
                  styles.rPill,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}>
                {active && <Ionicons name="checkmark" size={14} color={colors.accentText} style={{ marginRight: 4 }} />}
                <Text style={{ color: active ? colors.accentText : colors.text, fontWeight: '700', fontSize: 13 }}>
                  {r.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Dish + description */}
        <View style={{ marginTop: spacing.xl }}>
          <TextField label="Dish name" value={dishName} onChangeText={setDishName} placeholder="e.g. Truffle Smash Burger" />
          <TextField
            label="Your notes"
            value={description}
            onChangeText={setDescription}
            placeholder="What made it great? Any ordering tips?"
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </View>

        {/* Rating */}
        <Text style={[typography.heading, { color: colors.text, marginTop: spacing.md, marginBottom: spacing.md }]}>
          Your rating
        </Text>
        <View style={[styles.ratingBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <RatingInput value={rating} onChange={setRating} />
        </View>
      </ScrollView>

      {/* Post CTA */}
      <View style={[styles.cta, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <Button label="Post plate" size="lg" icon="checkmark" onPress={onPost} disabled={!canPost} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 1.4, borderRadius: radius.lg, marginBottom: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  restaurantWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ratingBox: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
