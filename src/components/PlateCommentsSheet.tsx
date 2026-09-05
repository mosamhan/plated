import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { CommentActionsSheet } from '@/components/CommentActionsSheet';
import { CommentComposer } from '@/components/CommentComposer';
import { SendToSheet, SharePayload } from '@/components/SendToSheet';
import { Comment } from '@/data/types';
import { tapMedium } from '@/lib/haptics';
import { plateLink } from '@/lib/invite';
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
  const { commentsFor, addComment, deleteComment, userFor, currentUser, orders } = useData();
  const { isHidden } = useSettings();
  const [actionTarget, setActionTarget] = useState<Comment | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const order = orders.find((o) => o.id === orderId);
  // Hidden-words filtering is applied here rather than in the context: the
  // list is the author's own setting, and it only governs what *they* see.
  const comments = commentsFor(orderId).filter((c) => !isHidden(c.text));

  const openActions = (c: Comment) => {
    tapMedium();
    setActionTarget(c);
  };

  const onDelete = () => {
    if (actionTarget) deleteComment(actionTarget.id, orderId);
  };

  const onReport = () => {
    if (actionTarget) router.push(`/report?targetType=comment&targetId=${actionTarget.id}`);
  };

  const onShare = () => {
    if (!actionTarget) return;
    const author = userFor(actionTarget.userId);
    setSharePayload({
      kind: 'plate_comment',
      attachmentId: actionTarget.id,
      commentPostId: orderId,
      commentAuthorId: actionTarget.userId,
      commentText: actionTarget.text,
      label: `${author.name}'s comment`,
      shareMessage: `${author.name} commented: "${actionTarget.text}"`,
      link: plateLink(orderId),
    });
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
            <Text style={[styles.hint, { color: colors.textMuted }]}>Hold a comment for more options.</Text>

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
                    onLongPress={() => openActions(c)}
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
                      {!!c.text && <Text style={[styles.text, { color: colors.text }]}>{c.text}</Text>}
                      {c.imageUrl && (
                        <Image source={{ uri: c.imageUrl }} style={styles.commentImage} contentFit="cover" />
                      )}
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
                <CommentComposer onSubmit={(text, imageUrl) => addComment(orderId, text, imageUrl)} />
              </View>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      <CommentActionsSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        mine={actionTarget?.userId === currentUser.id}
        onDelete={onDelete}
        onReport={onReport}
        onShare={onShare}
      />
      <SendToSheet visible={!!sharePayload} onClose={() => setSharePayload(null)} payload={sharePayload} />
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
  commentImage: { width: 140, height: 140, borderRadius: radius.md, marginTop: 6 },
  blank: { fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  composer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
