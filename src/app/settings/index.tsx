import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { confirmAction } from '@/lib/dialog';
import { warn } from '@/lib/haptics';
import { buildInviteMessage } from '@/lib/invite';
import { useActivity } from '@/store/ActivityContext';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { useMessages } from '@/store/MessagesContext';
import { useSettings } from '@/store/SettingsContext';
import { useStreak } from '@/store/StreakContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const MODE_LABELS = { light: 'Light', dark: 'Dark', auto: 'Automatic' } as const;
const ORDER_PROVIDER_LABELS = { doordash: 'DoorDash', ubereats: 'Uber Eats', ask: 'Ask each time' } as const;
const MAPS_APP_LABELS = { apple: 'Apple Maps', google: 'Google Maps', ask: 'Ask each time' } as const;

interface Entry {
  section: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  route?: string;
  onPress?: () => void;
  destructive?: boolean;
  accent?: boolean;
  /** Extra words the search should match but that aren't in the label. */
  keywords?: string;
}

function audienceLabel(a: string): string {
  if (a === 'off') return 'Off';
  if (a === 'friends') return 'Friends';
  if (a === 'followers') return 'Followers';
  return 'Everyone';
}

/**
 * Settings.
 *
 * Grouped by the question each group answers — how you use Plated, who can see
 * your content, how others can interact with you — rather than by which part of
 * the codebase implements it. That's how people actually look for a setting
 * ("where do I stop strangers commenting?"), and it's why the whole screen is
 * one searchable list of entries rather than hand-written sections: the search
 * field can then match a row that lives three taps deep.
 */
export default function Settings() {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const { remindersOn } = useStreak();
  const { signOut, accounts } = useAuth();
  const { blockedUsers, currentUser, ownedRestaurantIds } = useData();
  const { location } = useLocation();
  const { privacy: messagePrivacy } = useMessages();
  const { showActivity } = useActivity();
  const { settings, update, closeFriends, hiddenWords } = useSettings();
  const [orderProviderSheetOpen, setOrderProviderSheetOpen] = useState(false);
  const [mapsAppSheetOpen, setMapsAppSheetOpen] = useState(false);
  const [query, setQuery] = useState('');

  const blockedCount = blockedUsers().length;

  const onInvite = () =>
    Share.share({ message: buildInviteMessage({ earns: currentUser.compensationEligible }) }).catch(
      () => {},
    );

  const onSignOut = () => {
    signOut();
    router.replace('/(auth)/sign-in');
  };

  // Apple 5.1.1(v): account deletion must be available in-app.
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

  const entries = useMemo<Entry[]>(
    () => [
      // ── How you use Plated ────────────────────────────────────────────────
      { section: 'How you use Plated', icon: 'archive-outline', label: 'Archive', route: '/settings/archive', keywords: 'archived hidden posts' },
      { section: 'How you use Plated', icon: 'notifications-outline', label: 'Notifications', value: remindersOn ? 'Reminders on' : 'Off', route: '/settings/reminders' },
      { section: 'How you use Plated', icon: 'time-outline', label: 'Time management', route: '/settings/time', keywords: 'screen time break reminder' },
      { section: 'How you use Plated', icon: 'color-palette-outline', label: 'Appearance', value: MODE_LABELS[mode], route: '/settings/theme', keywords: 'theme dark light' },
      { section: 'How you use Plated', icon: 'location-outline', label: 'Location', value: location.label, route: '/settings/location' },
      { section: 'How you use Plated', icon: 'bicycle-outline', label: 'Preferred delivery app', value: ORDER_PROVIDER_LABELS[settings.preferredOrderProvider], onPress: () => setOrderProviderSheetOpen(true), keywords: 'doordash ubereats delivery order' },
      { section: 'How you use Plated', icon: 'map-outline', label: 'Preferred maps app', value: MAPS_APP_LABELS[settings.preferredMapsApp], onPress: () => setMapsAppSheetOpen(true), keywords: 'apple google directions navigation' },

      // ── Who can see your content ──────────────────────────────────────────
      { section: 'Who can see your content', icon: 'lock-closed-outline', label: 'Account privacy', value: settings.privateAccount ? 'Private' : 'Public', route: '/settings/privacy' },
      { section: 'Who can see your content', icon: 'star-outline', label: 'Close friends', value: `${closeFriends.length}`, route: '/settings/close-friends' },
      { section: 'Who can see your content', icon: 'aperture-outline', label: 'Story', route: '/settings/story', keywords: 'stories replies archive sharing' },
      { section: 'Who can see your content', icon: 'hand-left-outline', label: 'Blocked', value: `${blockedCount}`, route: '/settings/blocked' },
      { section: 'Who can see your content', icon: 'ellipse-outline', label: 'Activity status', value: showActivity ? 'On' : 'Off', route: '/settings/activity', keywords: 'last active online' },

      // ── How others can interact with you ──────────────────────────────────
      { section: 'How others can interact with you', icon: 'chatbubble-ellipses-outline', label: 'Messages and story replies', value: messagePrivacy === 'friends' ? 'Friends only' : 'Everyone', route: '/settings/messages' },
      { section: 'How others can interact with you', icon: 'chatbox-outline', label: 'Comments', value: audienceLabel(settings.commentAudience), route: '/settings/comments' },
      { section: 'How others can interact with you', icon: 'at-outline', label: 'Tags and mentions', value: audienceLabel(settings.tagAudience), route: '/settings/tags' },
      { section: 'How others can interact with you', icon: 'repeat-outline', label: 'Sharing', value: settings.allowResharing ? 'Allowed' : 'Off', route: '/settings/sharing', keywords: 'reshare repost' },
      { section: 'How others can interact with you', icon: 'text-outline', label: 'Hidden words', value: `${hiddenWords.length}`, route: '/settings/hidden-words', keywords: 'filter mute words' },

      // ── Your app and media ────────────────────────────────────────────────
      { section: 'Your app and media', icon: 'phone-portrait-outline', label: 'Device permissions', route: '/settings/permissions', keywords: 'camera photos microphone location' },
      { section: 'Your app and media', icon: 'accessibility-outline', label: 'Accessibility', route: '/settings/accessibility', keywords: 'motion contrast' },
      { section: 'Your app and media', icon: 'cellular-outline', label: 'Media quality', value: settings.uploadHd ? 'Highest' : 'Standard', route: '/settings/media-quality', keywords: 'data upload hd' },

      // ── Your account ──────────────────────────────────────────────────────
      { section: 'Your account', icon: 'person-outline', label: 'Edit profile', route: '/edit-profile' },
      { section: 'Your account', icon: 'people-outline', label: 'Accounts', value: `${accounts.length}`, route: '/settings/accounts', keywords: 'switch account add account center' },
      { section: 'Your account', icon: 'cash-outline', label: 'Creator dashboard', route: '/creator', keywords: 'earnings commission payouts' },
      // Only surfaced once a claim's been approved — there's nothing to manage before that.
      ...(ownedRestaurantIds.size > 0
        ? [{
            section: 'Your account',
            icon: 'storefront-outline' as const,
            label: 'Business dashboard',
            route: `/business/${[...ownedRestaurantIds][0]}`,
            keywords: 'restaurant advertising promotion rate',
          }]
        : []),

      // ── More info and support ─────────────────────────────────────────────
      { section: 'More info and support', icon: 'gift-outline', label: 'Invite friends', onPress: onInvite },
      { section: 'More info and support', icon: 'document-text-outline', label: 'Terms & Community Guidelines', route: '/legal/terms' },
      { section: 'More info and support', icon: 'shield-checkmark-outline', label: 'Privacy Policy', route: '/legal/privacy' },
      { section: 'More info and support', icon: 'mail-outline', label: 'Contact us', onPress: () => Linking.openURL('mailto:support@joinplated.app').catch(() => {}) },
      { section: 'More info and support', icon: 'information-circle-outline', label: 'About Plated', value: 'v1.0' },

      // ── Login ─────────────────────────────────────────────────────────────
      { section: 'Login', icon: 'log-out-outline', label: 'Log out', accent: true, onPress: onSignOut },
      { section: 'Login', icon: 'trash-outline', label: 'Delete account', destructive: true, onPress: onDeleteAccount },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, location.label, remindersOn, blockedCount, messagePrivacy, showActivity, settings, closeFriends.length, hiddenWords.length, ownedRestaurantIds, accounts.length],
  );

  const q = query.trim().toLowerCase();
  const shown = q
    ? entries.filter(
        (e) =>
          e.label.toLowerCase().includes(q) ||
          e.section.toLowerCase().includes(q) ||
          (e.keywords ?? '').includes(q),
      )
    : entries;

  // Section order comes from first appearance, so adding an entry can't
  // accidentally reorder the screen.
  const sections = shown.reduce<{ title: string; items: Entry[] }[]>((acc, e) => {
    const found = acc.find((s) => s.title === e.section);
    if (found) found.items.push(e);
    else acc.push({ title: e.section, items: [e] });
    return acc;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Settings" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {sections.map((s) => (
          <SettingsSection key={s.title} title={s.title}>
            {s.items.map((e, i) => (
              <SettingsRow
                key={e.label}
                icon={e.icon}
                label={e.label}
                value={e.value}
                destructive={e.destructive}
                accent={e.accent}
                last={i === s.items.length - 1}
                onPress={e.onPress ?? (e.route ? () => router.push(e.route as never) : undefined)}
              />
            ))}
          </SettingsSection>
        ))}

        {sections.length === 0 && (
          <Text style={[styles.blank, { color: colors.textMuted }]}>
            Nothing in settings matches “{query.trim()}”.
          </Text>
        )}
      </ScrollView>

      <ActionSheet
        visible={orderProviderSheetOpen}
        onClose={() => setOrderProviderSheetOpen(false)}
        title="Preferred delivery app"
        actions={[
          { label: 'DoorDash', onPress: () => update('preferredOrderProvider', 'doordash') },
          { label: 'Uber Eats', onPress: () => update('preferredOrderProvider', 'ubereats') },
          { label: 'Ask each time', onPress: () => update('preferredOrderProvider', 'ask') },
        ]}
      />
      <ActionSheet
        visible={mapsAppSheetOpen}
        onClose={() => setMapsAppSheetOpen(false)}
        title="Preferred maps app"
        actions={[
          { label: 'Apple Maps', onPress: () => update('preferredMapsApp', 'apple') },
          { label: 'Google Maps', onPress: () => update('preferredMapsApp', 'google') },
          { label: 'Ask each time', onPress: () => update('preferredMapsApp', 'ask') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    marginBottom: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },
  blank: { textAlign: 'center', marginTop: 30, fontSize: 14, fontWeight: '500' },
});
