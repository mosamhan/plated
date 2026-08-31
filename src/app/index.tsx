import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useTheme } from '@/theme/ThemeContext';

export default function Index() {
  const { signedIn, loading } = useAuth();
  const { currentUser, loading: dataLoading } = useData();
  const { colors } = useTheme();

  // Restoring a persisted session — hold here instead of flashing the sign-in
  // screen. Once signed in, also wait for the profile to load: that's what
  // `needsOnboarding` below depends on.
  if (loading || (signedIn && dataLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!signedIn) return <Redirect href="/(auth)/sign-in" />;
  // Brand-new Google/Apple signup — see 0047_onboarding_flag.sql. Email/password
  // signup already collects a real handle/name inline and never hits this.
  if (currentUser.needsOnboarding) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
