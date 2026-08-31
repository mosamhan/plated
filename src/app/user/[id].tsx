import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ProfileView } from '@/components/ProfileView';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useData } from '@/store/DataContext';
import { useTheme } from '@/theme/ThemeContext';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUser, userFor } = useData();
  const { colors } = useTheme();

  const isCurrent = id === currentUser.id;
  const user = isCurrent ? currentUser : userFor(id);

  // userFor returns a fallback for unknown ids in live mode; guard explicitly.
  if (!user || user.id === 'unknown') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Profile" />
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
          This user doesn&apos;t exist or was removed.
        </Text>
      </View>
    );
  }

  // This route is always pushed — unlike the Profile tab, there's no tab bar
  // to fall back on, so even your own profile needs a way back. (Only takes
  // effect on the isCurrent branch; the other-user header already has one.)
  return <ProfileView user={user} isCurrent={isCurrent} showBack />;
}
