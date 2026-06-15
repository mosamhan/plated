import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/store/AuthContext';
import { useTheme } from '@/theme/ThemeContext';

export default function Index() {
  const { signedIn, loading } = useAuth();
  const { colors } = useTheme();

  // Restoring a persisted session — hold here instead of flashing the sign-in screen.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={signedIn ? '/(tabs)' : '/(auth)/sign-in'} />;
}
