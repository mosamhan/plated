import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { registerPushToken } from '@/lib/push';
import { useAuth } from '@/store/AuthContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

import { onboardingStyles as styles } from './styles';

type Status = 'idle' | 'busy' | 'enabled' | 'declined';

function PermissionCard({
  icon,
  title,
  body,
  status,
  onEnable,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  status: Status;
  onEnable: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon} size={24} color={colors.accent} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[cardStyles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[cardStyles.body, { color: colors.textMuted }]}>{body}</Text>
      </View>
      {status === 'enabled' ? (
        <Ionicons name="checkmark-circle" size={24} color={colors.ratingHigh} />
      ) : (
        <Pressable
          onPress={onEnable}
          disabled={status === 'busy'}
          style={[cardStyles.enableBtn, { backgroundColor: colors.accent, opacity: status === 'busy' ? 0.6 : 1 }]}>
          <Text style={[cardStyles.enableText, { color: colors.accentText }]}>
            {status === 'declined' ? 'Not now' : 'Enable'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function PermissionsStep({ onFinish }: { onFinish: () => void }) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  // `promptForLocationOnce` (not the lower-level `useDeviceLocation`) is what
  // (tabs)/_layout.tsx also calls — reusing it here keeps its "asked once"
  // flag in sync, so landing in tabs right after doesn't silently re-fire it.
  const { location, busy: locationBusy, promptForLocationOnce } = useLocation();
  const [notifStatus, setNotifStatus] = useState<Status>('idle');
  const [locationStatus, setLocationStatus] = useState<Status>('idle');
  const [locationRequested, setLocationRequested] = useState(false);

  const enableNotifications = async () => {
    if (!userId) return;
    setNotifStatus('busy');
    const token = await registerPushToken(userId);
    setNotifStatus(token ? 'enabled' : 'declined');
  };

  const enableLocation = () => {
    setLocationRequested(true);
    setLocationStatus('busy');
    promptForLocationOnce();
  };

  // promptForLocationOnce has no return value (it also just no-ops silently
  // when there's nothing to do) — so success/decline is read back from the
  // context's own reactive state once its internal `busy` flag settles,
  // rather than from a stale closure captured at the button-press moment.
  useEffect(() => {
    if (!locationRequested || locationBusy) return;
    setLocationStatus(location.source === 'device' ? 'enabled' : 'declined');
  }, [locationBusy, locationRequested, location.source]);

  return (
    <>
      <Text style={[typography.title, { color: colors.text, marginBottom: 4 }]}>Almost there</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>
        Turn these on for the best experience — you can always change them later in Settings.
      </Text>

      <PermissionCard
        icon="notifications-outline"
        title="Notifications"
        body="Hear about replies, follows, and the occasional mealtime nudge."
        status={notifStatus}
        onEnable={enableNotifications}
      />
      <PermissionCard
        icon="location-outline"
        title="Location"
        body="See what's actually good near you, ranked by distance."
        status={locationStatus}
        onEnable={enableLocation}
      />

      <Button label="Get started" size="lg" onPress={onFinish} style={{ marginTop: spacing.xl }} />
    </>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  title: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 12, fontWeight: '500', marginTop: 2, lineHeight: 16 },
  enableBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md },
  enableText: { fontSize: 13, fontWeight: '700' },
});
