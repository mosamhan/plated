import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { MessagePrivacy } from '@/data/messages';
import { tick } from '@/lib/haptics';
import { useMessages } from '@/store/MessagesContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const OPTIONS: { value: MessagePrivacy; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    value: 'everyone',
    label: 'Everyone',
    description: 'Anyone on Plated can start a conversation with you.',
    icon: 'globe-outline',
  },
  {
    value: 'friends',
    label: 'Friends only',
    description:
      'Only people you follow who follow you back land in your inbox. Everyone else goes to Requests, and can’t tell whether you’ve read them.',
    icon: 'people-outline',
  },
];

/**
 * Who can message you.
 *
 * This is a real boundary, not a client-side filter: the rule is enforced when
 * the conversation row is written (0019_messaging.sql), so a stranger's thread
 * lands in Requests regardless of what any client asks for.
 */
export default function MessageSettings() {
  const { colors } = useTheme();
  const { privacy, setPrivacy, requests } = useMessages();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Messages" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Blocked people can never message you, whichever of these you pick.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {OPTIONS.map((o, i) => {
            const on = privacy === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  tick();
                  setPrivacy(o.value);
                }}
                style={({ pressed }) => [
                  styles.row,
                  i < OPTIONS.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                  { opacity: pressed ? 0.7 : 1 },
                ]}>
                <View style={[styles.icon, { backgroundColor: on ? colors.accentSoft : colors.surface }]}>
                  <Ionicons name={o.icon} size={19} color={on ? colors.accent : colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.text }]}>{o.label}</Text>
                  <Text style={[styles.description, { color: colors.textMuted }]}>{o.description}</Text>
                </View>
                <Ionicons
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  size={21}
                  color={on ? colors.accent : colors.border}
                />
              </Pressable>
            );
          })}
        </View>

        {requests.length > 0 && (
          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            You have {requests.length} pending {requests.length === 1 ? 'request' : 'requests'} in your
            inbox.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginBottom: spacing.lg },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 16 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '800' },
  description: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginTop: 3 },
  footnote: { fontSize: 12, fontWeight: '500', marginTop: spacing.lg, textAlign: 'center' },
});
