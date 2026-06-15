import { Redirect } from 'expo-router';

import { useAuth } from '@/store/AuthContext';

export default function Index() {
  const { signedIn } = useAuth();
  return <Redirect href={signedIn ? '/(tabs)' : '/(auth)/sign-in'} />;
}
