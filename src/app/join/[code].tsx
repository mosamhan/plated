import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { GroupAvatar } from '@/components/GroupAvatar';
import { InvitePreview, useMessages } from '@/store/MessagesContext';
import { displayFont } from '@/theme/fonts';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Status = 'loading' | 'found' | 'invalid';

/**
 * Where a group invite link (`groupInviteLink` in `lib/invite.ts`) actually
 * lands — resolves the code to a preview (name/photo/member count) before
 * committing to anything, the same "see what you're getting into first"
 * shape any join flow needs. Joining itself is just inserting your own
 * membership row (`join_via_invite`, 0058) — nothing here needs anyone's
 * permission but yours.
 */
export default function JoinGroup() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { getInvitePreview, joinViaInvite } = useMessages();

  // Lazily initialized rather than checked inside the effect below — a
  // missing code needs no fetch to know it's invalid, so there's nothing
  // to synchronize there; it can just seed state directly.
  const [status, setStatus] = useState<Status>(() => (code ? 'loading' : 'invalid'));
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    getInvitePreview(code).then((p) => {
      if (!alive) return;
      if (p) {
        setPreview(p);
        setStatus('found');
      } else {
        setStatus('invalid');
      }
    });
    return () => {
      alive = false;
    };
  }, [code, getInvitePreview]);

  const onJoin = async () => {
    if (!code) return;
    setJoining(true);
    const conversationId = await joinViaInvite(code);
    setJoining(false);
    if (conversationId) router.replace(`/messages/${conversationId}`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {status === 'loading' && <ActivityIndicator color={colors.accent} />}

      {status === 'invalid' && (
        <>
          <Ionicons name="link-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>
            This link isn’t valid
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            It may have been reset, or the group no longer exists.
          </Text>
          <Button label="Done" onPress={() => router.replace('/(tabs)')} style={{ marginTop: 20 }} />
        </>
      )}

      {status === 'found' && preview && (
        <>
          <GroupAvatar avatarUrl={preview.avatarUrl ?? undefined} memberAvatars={[]} size={84} />
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>
            {preview.title || 'Group chat'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}
          </Text>
          <Button
            label="Join group"
            onPress={onJoin}
            loading={joining}
            size="lg"
            style={{ marginTop: 20, minWidth: 180 }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 6 },
  title: { fontSize: 20, marginTop: 14, textAlign: 'center' },
  subtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
