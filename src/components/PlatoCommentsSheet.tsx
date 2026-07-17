import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tapLight } from '@/lib/haptics';
import { usePlatos } from '@/store/PlatosContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

interface Props {
  platoId: string;
  visible: boolean;
  onClose: () => void;
}

export function PlatoCommentsSheet({ platoId, visible, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { commentsFor, loadComments, addComment, isCommentLiked, toggleCommentLike } = usePlatos();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (visible) loadComments(platoId);
  }, [visible, platoId, loadComments]);

  const comments = commentsFor(platoId);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    addComment(platoId, text);
    setDraft('');
    tapLight();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text }]}>
              {comments.length > 0 ? `${comments.length} comments` : 'Comments'}
            </Text>

            <ScrollView
              style={{ maxHeight: 380 }}
              contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.md }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {comments.map((c) => {
                const cLiked = isCommentLiked(c.id);
                return (
                  <View key={c.id} style={styles.row}>
                    <Image source={{ uri: c.avatar }} style={styles.avatar} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <View style={styles.head}>
                        <Text style={[styles.name, { color: colors.text }]}>{c.name}</Text>
                        <View style={styles.headRight}>
                          <Text style={[styles.time, { color: colors.textMuted }]}>{timeAgo(c.createdAt)}</Text>
                          {/* UGC needs a report path (Apple 1.2) */}
                          <Pressable
                            hitSlop={8}
                            onPress={() => {
                              onClose();
                              router.push(`/report?targetType=comment&targetId=${c.id}`);
                            }}>
                            <Ionicons name="flag-outline" size={13} color={colors.textMuted} />
                          </Pressable>
                        </View>
                      </View>
                      <Text style={[styles.text, { color: colors.text }]}>{c.text}</Text>
                    </View>
                    <Pressable
                      style={styles.heartCol}
                      hitSlop={6}
                      onPress={() => {
                        toggleCommentLike(platoId, c.id);
                        tapLight();
                      }}>
                      <Ionicons
                        name={cLiked ? 'heart' : 'heart-outline'}
                        size={16}
                        color={cLiked ? '#FF4D6D' : colors.textMuted}
                      />
                      {c.likes > 0 && (
                        <Text style={[styles.heartCount, { color: colors.textMuted }]}>{c.likes}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
              {comments.length === 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 14, paddingVertical: 8 }}>
                  No comments yet — be the first.
                </Text>
              )}
            </ScrollView>

            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
                onSubmitEditing={submit}
                returnKeyType="send"
              />
              <Pressable onPress={submit} hitSlop={8} disabled={!draft.trim()}>
                <Ionicons name="arrow-up-circle" size={30} color={draft.trim() ? colors.accent : colors.border} />
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  kav: { width: '100%' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 13, fontWeight: '800' },
  time: { fontSize: 12, fontWeight: '500' },
  text: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  heartCol: { alignItems: 'center', width: 30, paddingTop: 2, gap: 2 },
  heartCount: { fontSize: 11, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 8 },
});
