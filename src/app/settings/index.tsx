import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { confirmAction } from '@/lib/dialog';
import { warn } from '@/lib/haptics';
import { buildInviteMessage } from '@/lib/invite';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { radius, spacing, THEMES } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function Settings() {
  const { colors, themeName } = useTheme();
  const { signOut } = useAuth();
  const { blockedUsers, currentUser } = useData();
  const router = useRouter();

  const blockedCount = blockedUsers().length;

  const onShare = () =>
    Share.share({ message: buildInviteMessage({ earns: currentUser.compensationEligible }) }).catch(
      () => {},
    );

  const onSignOut = () => {
    signOut();
    router.replace('/(auth)/sign-in');
  };

  // Apple 5.1.1(v): account deletion must be available in-app.
  // confirmAction works on web too (Alert.alert is a no-op there).
  const onDeleteAccount = () => {
    warn();
    confirmAction({
      title: 'Delete your account?',
      message:
        'This permanently deletes your profile, plates, ratings, and comments. This cannot be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
      onConfirm: () => {
        AsyncStorage.clear().catch(() => {});
        signOut();
        router.replace('/(auth)/sign-in');
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Section title="Preferences">
          <Row
            icon="color-palette-outline"
            label="Appearance"
            value={THEMES[themeName].label}
            onPress={() => router.push('/settings/theme')}
          />
          <Row icon="notifications-outline" label="Notifications" value="On" />
          <Row icon="location-outline" label="Location" value="New York, NY" last />
        </Section>

        <Section title="Account">
          <Row icon="person-outline" label="Edit profile" onPress={() => router.push('/edit-profile')} />
          <Row icon="cash-outline" label="Creator dashboard" onPress={() => router.push('/creator')} />
          <Row
            icon="hand-left-outline"
            label="Blocked users"
            value={blockedCount > 0 ? `${blockedCount}` : 'None'}
            onPress={() => router.push('/settings/blocked')}
          />
          <Row
            icon="trash-outline"
            label="Delete account"
            destructive
            onPress={onDeleteAccount}
            last
          />
        </Section>

        <Section title="Legal & safety">
          <Row icon="document-text-outline" label="Terms & Community Guidelines" onPress={() => router.push('/legal/terms')} />
          <Row icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
          <Row
            icon="mail-outline"
            label="Contact us"
            onPress={() => Linking.openURL('mailto:support@plated.app').catch(() => {})}
            last
          />
        </Section>

        <Section title="More">
          <Row icon="gift-outline" label="Invite friends" onPress={onShare} />
          <Row icon="information-circle-outline" label="About Plated" value="v1.0" last />
        </Section>

        <Pressable onPress={onSignOut} style={[styles.signOut, { borderColor: colors.border }]}>
          <Ionicons name="log-out-outline" size={20} color={colors.ratingLow} />
          <Text style={[styles.signOutText, { color: colors.ratingLow }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const tint = destructive ? colors.ratingLow : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
      {value && <Text style={[styles.rowValue, { color: colors.textMuted }]}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowValue: { fontSize: 14, fontWeight: '500' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  signOutText: { fontSize: 15, fontWeight: '800' },
});
