import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { InterestsStep } from '@/components/onboarding/InterestsStep';
import { ScreenHeader } from '@/components/ScreenHeader';
import type { PlaceType } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { useTheme } from '@/theme/ThemeContext';

/**
 * "Add some information to shift it" — the same category picker used at
 * onboarding (src/app/onboarding/interests.tsx), reused here pre-seeded with
 * the account's current picks so re-opening it reads as "edit," not "start
 * over." Re-selecting a previously muted category also un-mutes it — see
 * `updateTasteCategories` in DataContext.
 */
export default function EditTasteInterests() {
  const { colors } = useTheme();
  const router = useRouter();
  const { currentUser, updateTasteCategories } = useData();
  const [interests, setInterests] = useState<Set<PlaceType>>(
    () => new Set((currentUser.tasteCategories ?? []) as PlaceType[]),
  );

  const toggleInterest = (type: PlaceType) => {
    setInterests((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Edit Interests" />
      <InterestsStep
        selected={interests}
        onToggle={toggleInterest}
        onContinue={() => {
          updateTasteCategories([...interests]);
          router.back();
        }}
      />
    </View>
  );
}
