import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  useFonts,
} from '@expo-google-fonts/fraunces';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { InAppNotice } from '@/components/InAppNotice';
import { NotificationPrimer } from '@/components/NotificationPrimer';
import { ZoomPortalProvider } from '@/components/ZoomPortal';
import { configureForegroundHandler, registerPushToken } from '@/lib/push';
import { recordSpan } from '@/lib/screenTime';
import { AuthProvider, useAuth } from '@/store/AuthContext';
import { ActivityProvider } from '@/store/ActivityContext';
import { CollabsProvider } from '@/store/CollabsContext';
import { CollectionsProvider } from '@/store/CollectionsContext';
import { CreatorCardProvider } from '@/store/CreatorCardContext';
import { DataProvider, useData } from '@/store/DataContext';
import { LocationProvider } from '@/store/LocationContext';
import { MessagesProvider } from '@/store/MessagesContext';
import { PlatosProvider } from '@/store/PlatosContext';
import { SettingsProvider } from '@/store/SettingsContext';
import { StoriesProvider } from '@/store/StoriesContext';
import { StreakProvider } from '@/store/StreakContext';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

// The foreground handler has to be installed before any notification can land.
configureForegroundHandler();

/**
 * Registers this device for push once someone is signed in, and routes a tap on
 * a notification to the thread it's about. Rendered rather than hooked into a
 * context because it needs the router, which only exists inside the navigator.
 */
/**
 * Accumulates foreground time for the Time management screen. Counts a span
 * from when the app becomes active to when it leaves — never on a timer, which
 * would keep counting a backgrounded app.
 */
function ScreenTimeTracker() {
  useEffect(() => {
    let since = AppState.currentState === 'active' ? Date.now() : 0;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        since = Date.now();
      } else if (since) {
        void recordSpan(Date.now() - since);
        since = 0;
      }
    });

    return () => {
      // Unmount is the app going away; bank whatever's open.
      if (since) void recordSpan(Date.now() - since);
      sub.remove();
    };
  }, []);

  return null;
}

function PushRegistrar() {
  const { userId } = useAuth();
  const { currentUser } = useData();
  const router = useRouter();

  useEffect(() => {
    // Held off during onboarding — the Permissions step there is the
    // deliberate first ask; registering automatically the instant a session
    // exists would silently resolve it before the user ever sees that step.
    if (userId && !currentUser.needsOnboarding) registerPushToken(userId).catch(() => {});
  }, [userId, currentUser.needsOnboarding]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { conversationId?: string };
      if (data?.conversationId) router.push(`/messages/${data.conversationId}`);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

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
        {/* Mandatory for brand-new OAuth signups — no swipe-back escape hatch. */}
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
        <Stack.Screen name="create-plato" options={{ presentation: 'modal' }} />
        <Stack.Screen name="create-story" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="report" options={{ presentation: 'modal' }} />
        <Stack.Screen name="offer/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="claim-restaurant/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="find-restaurant" options={{ presentation: 'modal' }} />
        <Stack.Screen name="people" />
        <Stack.Screen name="discover-people" />
        <Stack.Screen name="streak" />
        <Stack.Screen name="collabs" />
        <Stack.Screen name="messages/index" />
        <Stack.Screen name="messages/[id]" />
        {/* Pushed, not presented: picking people replaces itself with the
            thread, so back lands on the inbox rather than dismissing a modal
            the user has already finished with. */}
        <Stack.Screen name="messages/new" />
        <Stack.Screen name="messages/group-info/[id]" />
        <Stack.Screen name="messages/chat-info/[id]" />
        <Stack.Screen name="messages/add-people/[id]" />
        {/* Full-bleed and gesture-dismissed, the way stories are everywhere —
            a card presentation would leave the app's background framing it. */}
        <Stack.Screen
          name="story/[userId]"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
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
      <ZoomPortalProvider>
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
                          {/* Messages sits under Stories: a story reply is a DM,
                              so stories depend on messaging, not the reverse. */}
                          <SettingsProvider>
                          <ActivityProvider>
                          <MessagesProvider>
                            <StoriesProvider>
                              <RootNav />
                              {/* Asks once, on first run, instead of leaving the
                                  only path to notifications inside a streak screen. */}
                              <NotificationPrimer />
                              {/* Above the navigator so a banner can sit over
                                  any screen, including modals. */}
                              <InAppNotice />
                              <PushRegistrar />
                              <ScreenTimeTracker />
                            </StoriesProvider>
                          </MessagesProvider>
                          </ActivityProvider>
                          </SettingsProvider>
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
      </ZoomPortalProvider>
    </GestureHandlerRootView>
  );
}
