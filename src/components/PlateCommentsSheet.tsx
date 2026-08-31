import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Comment } from '@/data/types';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useSettings } from '@/store/SettingsContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * Comments on a plate, as a bottom sheet.
 *
 * The comment button used to push the whole post-detail screen, which meant
 * leaving the feed to say one line and then finding your place again. This is
 * the same shape the Plato comments already use, so commenting behaves the same
 * whichever kind of post you're looking at.
 *
 * Plates have flat comments — no threading. That's not an omission: `comments`
 * has no `parent_id` (unlike `plato_comments`, which gained one in 0004), so
 * offering Reply here would be a button with nowhere to put the reply.
 */
export function PlateCommentsSheet({
  orderId,
  visible,
  onClose,
}: {
  orderId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { commentsFor, addComment, userFor, orders } = useData();
  const { isHidden } = useSettings();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const order = orders.find((o) => o.id === orderId);
  // Hidden-words filtering is applied here rather than in the context: the
  // list is the author's own setting, and it only governs what *they* see.
  const comments = commentsFor(orderId).filter((c) => !isHidden(c.text));

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    addComment(orderId, text);
    setDraft('');
    tapLight();
  };

  const report = (c: Comment) => {
    tapMedium();
    onClose();
    router.push(`/report?targetType=comment&targetId=${c.id}`);
  };

  // Tall enough to be a real reading surface, short enough that the post behind
  // it is still visible — you're commenting *on* something.
  const sheetMax = Math.round(height * 0.52);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>
              {comments.length > 0 ? `${comments.length} comments` : 'Comments'}
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Hold a comment to report it.</Text>

            <ScrollView
              style={{ maxHeight: sheetMax }}
              contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.lg }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {comments.map((c) => {
                const author = userFor(c.userId);
                return (
                  <Pressable
                    key={c.id}
                    onLongPress={() => report(c)}
                    delayLongPress={350}
                    style={styles.row}>
                    <Pressable
                      onPress={() => {
                        onClose();
                        router.push(`/user/${author.id}`);
                      }}>
                      <Avatar uri={author.avatar} size={34} verified={author.verified} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={styles.head}>
                        <Text style={[styles.name, { color: colors.text }]}>{author.name}</Text>
                        <Text style={[styles.time, { color: colors.textMuted }]}>
                          {timeAgo(c.createdAt)}
                        </Text>
                      </View>
                      <Text style={[styles.text, { color: colors.text }]}>{c.text}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {comments.length === 0 && (
                <Text style={[styles.blank, { color: colors.textMuted }]}>
                  {order?.commentsDisabled
                    ? 'Comments are turned off for this plate.'
                    : 'No comments yet — be the first.'}
                </Text>
              )}
            </ScrollView>

            {!order?.commentsDisabled && (
              <View style={[styles.composer, { borderTopColor: colors.border }]}>
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Add a comment…"
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={submit}
                  returnKeyType="send"
                  multiline
                  style={[
                    styles.input,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                  ]}
                />
                <Pressable
                  onPress={submit}
                  disabled={!draft.trim()}
                  hitSlop={6}
                  style={[
                    styles.send,
                    { backgroundColor: draft.trim() ? colors.accent : colors.border },
                  ]}>
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={draft.trim() ? colors.accentText : colors.textMuted}
                  />
                </Pressable>
              </View>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  kav: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  hint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { fontSize: 14, fontWeight: '800' },
  time: { fontSize: 12, fontWeight: '600' },
  text: { fontSize: 14, fontWeight: '500', lineHeight: 19, marginTop: 2 },
  blank: { fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
