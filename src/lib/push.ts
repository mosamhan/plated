import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Remote push registration.
 *
 * Separate from `lib/reminders.ts`, which schedules *local* notifications on a
 * clock and needs no token or backend. This is the other half: a token the
 * server can address, so a message that arrives while Plated is closed still
 * reaches you.
 *
 * The token is the only thing the client contributes. Who gets sent what is
 * decided by database triggers (0025) — a client that could name recipients
 * could spam anyone's lock screen.
 */

/** Banner + sound while the app is open. The in-app banner handles the rest. */
export function configureForegroundHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // Plated draws its own in-app banner, which can deep-link straight into
      // the thread — an OS banner on top of it would be the same news twice.
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Ask for permission (if not already decided), get an Expo push token, and
 * store it against the signed-in user. Safe to call on every launch — the
 * upsert is keyed on the token, so re-registering the same device is a no-op.
 *
 * Returns the token, or null when push isn't available: a simulator has no APNs
 * connection, and Expo Go can't hold a project-scoped token.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return null;

    await supabase
      .from('push_tokens')
      .upsert(
        { token, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      );
    return token;
  } catch (e) {
    // A missing projectId or an unsigned build throws here. Push simply doesn't
    // work in that configuration; nothing else should break because of it.
    if (__DEV__) console.warn('[Plated] push registration unavailable', e);
    return null;
  }
}

/** Drop this device's token on sign-out so the next account doesn't inherit it. */
export async function unregisterPushToken(token: string) {
  await supabase.from('push_tokens').delete().eq('token', token);
}
