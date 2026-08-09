import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  useFonts,
} from '@expo-google-fonts/fraunces';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotificationPrimer } from '@/components/NotificationPrimer';
import { AuthProvider } from '@/store/AuthContext';
import { CollabsProvider } from '@/store/CollabsContext';
import { CollectionsProvider } from '@/store/CollectionsContext';
import { CreatorCardProvider } from '@/store/CreatorCardContext';
import { DataProvider } from '@/store/DataContext';
import { LocationProvider } from '@/store/LocationContext';
import { PlatosProvider } from '@/store/PlatosContext';
import { StreakProvider } from '@/store/StreakContext';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNav() {
  const { colors } = useTheme();
  return (
    <>
      <StatusBar style={colors.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
        <Stack.Screen name="create-plato" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="report" options={{ presentation: 'modal' }} />
        <Stack.Screen name="offer/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="people" />
        <Stack.Screen name="discover-people" />
        <Stack.Screen name="streak" />
        <Stack.Screen name="collabs" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_600SemiBold, Fraunces_700Bold });
  // A font failure must never hold the app hostage — proceed on system fonts.
  const fontsSettled = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled]);

  if (!fontsSettled) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <LocationProvider>
              <DataProvider>
                <PlatosProvider>
                  <CollectionsProvider>
                    <CreatorCardProvider>
                      <StreakProvider>
                        <CollabsProvider>
                          <RootNav />
                          {/* Asks once, on first run, instead of leaving the
                              only path to notifications inside a streak screen. */}
                          <NotificationPrimer />
                        </CollabsProvider>
                      </StreakProvider>
                    </CreatorCardProvider>
                  </CollectionsProvider>
                </PlatosProvider>
              </DataProvider>
            </LocationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
