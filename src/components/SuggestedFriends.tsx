import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Contact } from '@/data/types';
import { buildInviteMessage } from '@/lib/invite';
import { useData } from '@/store/DataContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export function SuggestedFriendCard({ contact }: { contact: Contact }) {
  const { colors } = useTheme();
  const { currentUser } = useData();
  const [added, setAdded] = useState(false);

  const onInvite = () => {
    Share.share({
      message: buildInviteMessage({ earns: currentUser.compensationEligible }),
    }).catch(() => {});
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Avatar uri={contact.avatar} size={58} />
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {contact.name}
      </Text>
      <Text style={[styles.mutual, { color: colors.textMuted }]} numberOfLines={1}>
        {contact.mutualFriends} mutual
      </Text>
      {contact.onPlated ? (
        <Pressable
          onPress={() => setAdded((v) => !v)}
          style={[
            styles.btn,
            added
              ? { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }
              : { backgroundColor: colors.accent },
          ]}>
          <Text style={[styles.btnText, { color: added ? colors.textMuted : colors.accentText }]}>
            {added ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onInvite}
          style={[styles.btn, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="paper-plane-outline" size={13} color={colors.accent} />
          <Text style={[styles.btnText, { color: colors.accent, marginLeft: 4 }]}>Invite</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 130,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  name: { fontSize: 14, fontWeight: '700', marginTop: 10, maxWidth: 110, textAlign: 'center' },
  mutual: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
  },
  btnText: { fontSize: 13, fontWeight: '800' },
});
