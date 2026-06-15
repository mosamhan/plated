import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ProfileView } from '@/components/ProfileView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CURRENT_USER_ID, findUser } from '@/data/users';
import { useData } from '@/store/DataContext';
import { useTheme } from '@/theme/ThemeContext';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUser } = useData();
  const { colors } = useTheme();

  const isCurrent = id === CURRENT_USER_ID;
  const user = isCurrent ? currentUser : findUser(id);

  // Unknown ids must not silently render someone else's profile.
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Profile" />
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
          This user doesn&apos;t exist or was removed.
        </Text>
      </View>
    );
  }

  return <ProfileView user={user} isCurrent={isCurrent} />;
}
