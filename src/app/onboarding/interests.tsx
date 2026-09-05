import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InterestsStep } from '@/components/onboarding/InterestsStep';
import type { PlaceType } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The taste-profile picker for anyone who *doesn't* go through the full
 * `onboarding.tsx` wizard — email/password signup (which collects
 * name/handle inline and skips that flow entirely) and any account that
 * existed before 0071_taste_profile.sql (backfilled `taste_onboarded=false`
 * only for brand-new signups, so existing accounts never land here). Same
 * component `onboarding.tsx` uses as its own last step — one picker, two
 * entry points, so an OAuth and an email signup end up with an identical
 * taste profile either way. See `index.tsx` for the redirect that sends
 * people here.
 */
export default function OnboardingInterests() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updateTasteCategories } = useData();
  const [interests, setInterests] = useState<Set<PlaceType>>(new Set());

  const toggleInterest = (type: PlaceType) => {
    setInterests((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const done = () => router.replace('/(tabs)');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12 }}>
      <InterestsStep
        selected={interests}
        onToggle={toggleInterest}
        onSkip={done}
        onContinue={() => {
          updateTasteCategories([...interests]);
          done();
        }}
      />
    </View>
  );
}
