import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentActionsSheet } from '@/components/CommentActionsSheet';
import { CommentComposer, CommentComposerHandle } from '@/components/CommentComposer';
import { SendToSheet, SharePayload } from '@/components/SendToSheet';
import { PlatoComment } from '@/data/platos';
import { tapLight, tapMedium } from '@/lib/haptics';
import { platoLink } from '@/lib/invite';
import { useData } from '@/store/DataContext';
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
  /** Arriving via a shared-comment card — scroll to and briefly highlight it. */
  highlightCommentId?: string;
}

export function PlatoCommentsSheet({ platoId, visible, onClose, highlightCommentId }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { commentsFor, loadComments, addComment, deleteComment, isCommentLiked, toggleCommentLike } = usePlatos();
  const { currentUser } = useData();
  const [replyTo, setReplyTo] = useState<{ parentId: string; handle: string } | null>(null);
  const [actionTarget, setActionTarget] = useState<PlatoComment | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const composerRef = useRef<CommentComposerHandle>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) loadComments(platoId);
  }, [visible, platoId, loadComments]);

  const comments = commentsFor(platoId);
  const threads = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  const startReply = (c: PlatoComment) => {
    // Replies to a reply still thread under the same top-level comment.
    setReplyTo({ parentId: c.parentId ?? c.id, handle: c.handle });
    composerRef.current?.focus();
  };

  const openActions = (c: PlatoComment) => {
    tapMedium();
    setActionTarget(c);
  };

  const onDelete = () => {
    if (actionTarget) deleteComment(platoId, actionTarget.id);
  };

  const onReport = () => {
    if (actionTarget) router.push(`/report?targetType=comment&targetId=${actionTarget.id}`);
  };

  const onShare = () => {
    if (!actionTarget) return;
    setSharePayload({
      kind: 'plato_comment',
      attachmentId: actionTarget.id,
      commentPostId: platoId,
      commentAuthorId: actionTarget.userId,
      commentText: actionTarget.text,
      label: `${actionTarget.name}'s comment`,
      shareMessage: `${actionTarget.name} commented: "${actionTarget.text}"`,
      link: platoLink(platoId),
    });
  };

  const renderComment = (c: PlatoComment, isReply: boolean) => {
    const cLiked = isCommentLiked(c.id);
    return (
      <Pressable
        key={c.id}
        onLongPress={() => openActions(c)}
        delayLongPress={350}
        onLayout={(e) => {
          if (highlightCommentId !== c.id) return;
          const y = e.nativeEvent.layout.y;
          setTimeout(() => {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
            setHighlighted(c.id);
            setTimeout(() => setHighlighted(null), 1600);
          }, 80);
        }}
        style={[
          styles.row,
          isReply && styles.replyRow,
          highlighted === c.id && { backgroundColor: colors.accentSoft, borderRadius: radius.md },
        ]}>
        <Image source={{ uri: c.avatar }} style={isReply ? styles.avatarSm : styles.avatar} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <View style={styles.head}>
            <Text style={[styles.name, { color: colors.text }]}>{c.name}</Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>{timeAgo(c.createdAt)}</Text>
          </View>
          {!!c.text && <Text style={[styles.text, { color: colors.text }]}>{c.text}</Text>}
          {c.imageUrl && <Image source={{ uri: c.imageUrl }} style={styles.commentImage} contentFit="cover" />}
          <Pressable onPress={() => startReply(c)} hitSlop={8}>
            <Text style={[styles.replyBtn, { color: colors.textMuted }]}>Reply</Text>
          </Pressable>
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
          {c.likes > 0 && <Text style={[styles.heartCount, { color: colors.textMuted }]}>{c.likes}</Text>}
        </Pressable>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 8 }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text }]}>
              {comments.length > 0 ? `${comments.length} comments` : 'Comments'}
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>Hold a comment for more options.</Text>

            <ScrollView
              ref={scrollRef}
              style={{ maxHeight: 360 }}
              contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.md }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {threads.map((c) => (
                <View key={c.id} style={{ gap: spacing.md }}>
                  {renderComment(c, false)}
                  {repliesOf(c.id).map((r) => renderComment(r, true))}
                </View>
              ))}
              {comments.length === 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 14, paddingVertical: 8 }}>
                  No comments yet — be the first.
                </Text>
              )}
            </ScrollView>

            {replyTo && (
              <View style={styles.replyBanner}>
                <Text style={[styles.replyBannerText, { color: colors.textMuted }]} numberOfLines={1}>
                  Replying to <Text style={{ color: colors.text, fontWeight: '800' }}>@{replyTo.handle}</Text>
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            )}

            <CommentComposer
              ref={composerRef}
              placeholder={replyTo ? `Reply to @${replyTo.handle}…` : 'Add a comment…'}
              onSubmit={(text, imageUrl) => {
                addComment(platoId, text, replyTo?.parentId, imageUrl);
                setReplyTo(null);
              }}
            />
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
  // Matches PlateCommentsSheet: the KAV has to own the vertical space and
  // bottom-align its child, or it can't lift the sheet clear of the keyboard.
  kav: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  hint: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  replyRow: { marginLeft: 44 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarSm: { width: 26, height: 26, borderRadius: 13 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  name: { fontSize: 13, fontWeight: '800' },
  time: { fontSize: 12, fontWeight: '500' },
  text: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  commentImage: { width: 120, height: 120, borderRadius: radius.md, marginTop: 6 },
  replyBtn: { fontSize: 12, fontWeight: '800', marginTop: 5 },
  heartCol: { alignItems: 'center', width: 30, paddingTop: 2, gap: 2 },
  heartCount: { fontSize: 11, fontWeight: '700' },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  replyBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },
});
