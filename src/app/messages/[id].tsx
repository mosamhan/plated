import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
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

import { ActionSheet } from '@/components/ActionSheet';
import { MessageActionsSheet } from '@/components/MessageActionsSheet';
import { SendToSheet } from '@/components/SendToSheet';
import { VoiceComposer } from '@/components/VoiceComposer';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Avatar } from '@/components/Avatar';
import { MessageBubble, type MessageAnchor } from '@/components/MessageBubble';
import { RatingBadge } from '@/components/RatingBadge';
import { Message } from '@/data/messages';
import { Order } from '@/data/types';
import { activityLabel } from '@/lib/activity';
import { conversationTitle, dayLabel, sameRun } from '@/lib/conversation';
import { confirmAction } from '@/lib/dialog';
import { tapLight, warn } from '@/lib/haptics';
import { postMedia } from '@/lib/post';
import { pickImage, uploadAsset } from '@/lib/upload';
import { useActivity } from '@/store/ActivityContext';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'message'; key: string; message: Message; showAuthor: boolean };

/**
 * One conversation.
 *
 * Marked read on arrival and again whenever a new message lands while you're
 * looking at it — a thread that's open in front of you is, by definition, read.
 *
 * A pending request shows the opening message but replaces the composer with
 * Accept / Delete: the whole point of a request is that you haven't agreed to
 * this conversation yet, so the app shouldn't let you drift into having one.
 */
export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userFor, currentUser } = useData();
  const { userId } = useAuth();
  const { lastActiveFor, refresh: refreshActivity } = useActivity();
  const {
    conversationFor,
    messagesFor,
    otherIds,
    markRead,
    sendMessage,
    retryMessage,
    acceptRequest,
    leaveConversation,
    myReaction,
    react,
    hideMessage,
    unsendMessage,
    leaveThread,
  } = useMessages();

  const [draft, setDraft] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // The message the long-press menu is acting on, and the one being replied to.
  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MessageAnchor | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const listRef = useRef<FlatList<Row>>(null);

  const conversation = conversationFor(id);
  const messages = useMemo(() => (id ? messagesFor(id) : []), [id, messagesFor]);
  const others = conversation ? otherIds(conversation) : [];
  const isRequest = conversation?.participants.find((p) => p.userId === currentUser.id)?.state === 'request';
  const title = conversation
    ? conversationTitle(conversation, others, (u) => userFor(u).name)
    : 'Conversation';

  // Read on arrival, and again as messages arrive while the thread is open.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (id && conversation && !isRequest) markRead(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lastId, isRequest]);

  // Leaving the thread re-enables banners for it.
  useEffect(() => () => leaveThread(), [leaveThread]);

  const othersKey = others.join(',');
  useEffect(() => {
    if (others.length > 0) refreshActivity(others);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [othersKey]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let currentDay = '';
    messages.forEach((m, i) => {
      const label = dayLabel(m.createdAt);
      if (label !== currentDay) {
        currentDay = label;
        out.push({ type: 'day', key: `day-${label}-${m.id}`, label });
      }
      out.push({
        type: 'message',
        key: m.id,
        message: m,
        // The avatar + name lead a run, not every line in it.
        showAuthor: !sameRun(messages[i - 1], m) || out[out.length - 1]?.type === 'day',
      });
    });
    return out;
  }, [messages]);

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const onSend = () => {
    if (!id || !draft.trim()) return;
    tapLight();
    const text = draft;
    const answering = replyTo?.id;
    setDraft('');
    setReplyTo(null);
    sendMessage(id, { text, replyTo: answering }).catch(() => {});
  };

  const onVoice = (uri: string, durationMs: number) => {
    if (!id) return;
    const answering = replyTo?.id;
    setReplyTo(null);
    // The uploaded URL rides in `attachmentId` — it's the only pointer a voice
    // note needs, and it keeps the schema to one polymorphic column.
    sendMessage(id, { kind: 'voice', attachmentId: uri, durationMs, replyTo: answering }).catch(() => {});
  };

  const onPickPhoto = async () => {
    if (!id || !userId || uploadingPhoto) return;
    const asset = await pickImage();
    if (!asset) return;
    tapLight();
    const answering = replyTo?.id;
    setReplyTo(null);
    setUploadingPhoto(true);
    const url = await uploadAsset('chat-media', userId, asset);
    setUploadingPhoto(false);
    if (!url) return;
    sendMessage(id, { kind: 'image', attachmentId: url, replyTo: answering }).catch(() => {});
  };

  const onShareOrder = (order: Order) => {
    if (!id) return;
    setAttachOpen(false);
    tapLight();
    sendMessage(id, { kind: 'plate', attachmentId: order.id, text: draft.trim() }).catch(() => {});
    setDraft('');
  };

  if (!conversation) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ThreadHeader title="Conversation" onBack={() => router.back()} />
        <View style={styles.gone}>
          <Ionicons name="chatbubble-outline" size={34} color={colors.textMuted} />
          <Text style={[styles.goneText, { color: colors.textMuted }]}>
            This conversation is no longer available.
          </Text>
        </View>
      </View>
    );
  }

  const lead = others[0] ? userFor(others[0]) : currentUser;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ThreadHeader
        title={title}
        subtitle={
          conversation.isGroup
            ? `${conversation.participants.length} people`
            : // Presence when we have it, the handle when we don't — the header
              // should always say something about who you're talking to.
              (activityLabel(lastActiveFor(lead.id)) ?? `@${lead.handle}`)
        }
        avatar={conversation.isGroup ? conversation.avatarUrl ?? lead.avatar : lead.avatar}
        verified={!conversation.isGroup && lead.verified}
        onBack={() => router.back()}
        onTitlePress={() =>
          conversation.isGroup ? router.push(`/messages/group-info/${id}`) : router.push(`/user/${lead.id}`)
        }
        onOptions={() =>
          conversation.isGroup ? router.push(`/messages/group-info/${id}`) : setOptionsOpen(true)
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 52}>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) =>
            item.type === 'day' ? (
              <Text style={[styles.day, { color: colors.textMuted }]}>{item.label}</Text>
            ) : (
              <MessageBubble
                message={item.message}
                mine={item.message.senderId === currentUser.id}
                showAuthor={conversation.isGroup && item.showAuthor}
                onRetry={() => retryMessage(item.message)}
                onLongPress={(m, anchor) => {
                  setActionAnchor(anchor);
                  setActionTarget(m);
                }}
              />
            )
          }
          // Extra at the bottom so a reaction pill on the last message — which
          // hangs below its bubble — isn't clipped by the composer.
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <Text style={[styles.blank, { color: colors.textMuted }]}>
              Say something — or send them a plate.
            </Text>
          }
        />

        {isRequest ? (
          <View style={[styles.requestBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
            <Text style={[styles.requestText, { color: colors.textMuted }]}>
              {lead.name} wants to send you a message.
            </Text>
            <View style={styles.requestActions}>
              <AnimatedPressable
                pressScale={0.96}
                onPress={() => {
                  warn();
                  confirmAction({
                    title: 'Delete this request?',
                    message: `You won’t see messages from ${lead.name} in this thread again.`,
                    confirmLabel: 'Delete',
                    destructive: true,
                    onConfirm: () => {
                      leaveConversation(conversation.id);
                      router.back();
                    },
                  });
                }}
                style={[styles.requestBtn, { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.requestBtnText, { color: colors.ratingLow }]}>Delete</Text>
              </AnimatedPressable>
              <AnimatedPressable
                pressScale={0.96}
                onPress={() => {
                  tapLight();
                  acceptRequest(conversation.id);
                }}
                style={[styles.requestBtn, { backgroundColor: colors.accent }]}>
                <Text style={[styles.requestBtnText, { color: colors.accentText }]}>Accept</Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.composerWrap,
              { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 8 },
            ]}>
            {replyTo && (
              <View style={[styles.replyBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.replyBar, { backgroundColor: colors.accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.replyWho, { color: colors.accent }]} numberOfLines={1}>
                    Replying to {replyTo.senderId === currentUser.id ? 'yourself' : userFor(replyTo.senderId).name}
                  </Text>
                  <Text style={[styles.replyText, { color: colors.textMuted }]} numberOfLines={1}>
                    {replyTo.kind === 'voice'
                      ? '🎙 Voice message'
                      : replyTo.kind === 'plate'
                        ? '🍽 Shared a plate'
                        : replyTo.kind === 'plato'
                          ? '🎬 Shared a Plato'
                          : replyTo.text}
                  </Text>
                </View>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            )}

            <View style={styles.composer}>
            <Pressable
              onPress={() => {
                tapLight();
                setAttachOpen(true);
              }}
              hitSlop={8}
              style={[styles.attachBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="restaurant-outline" size={19} color={colors.accent} />
            </Pressable>
            <Pressable
              onPress={onPickPhoto}
              disabled={uploadingPhoto}
              hitSlop={8}
              style={[styles.attachBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: uploadingPhoto ? 0.5 : 1 }]}>
              <Ionicons name={uploadingPhoto ? 'cloud-upload-outline' : 'image-outline'} size={19} color={colors.accent} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={colors.textMuted}
              multiline
              style={[
                styles.input,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
            />
            {draft.trim() ? (
              <AnimatedPressable
                pressScale={0.92}
                onPress={onSend}
                style={[styles.sendBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="arrow-up" size={19} color={colors.accentText} />
              </AnimatedPressable>
            ) : (
              // The send button becomes the mic when there's nothing typed —
              // the two are never both useful, and the composer stays one row.
              <VoiceComposer onRecorded={onVoice} />
            )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Groups route to /messages/group-info instead — this sheet is 1:1-only now. */}
      <ActionSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title={title}
        actions={[
          {
            label: 'View profile',
            icon: 'person-outline' as const,
            onPress: () => router.push(`/user/${lead.id}`),
          },
          {
            label: 'Delete conversation',
            icon: 'exit-outline' as const,
            destructive: true,
            onPress: () => {
              warn();
              confirmAction({
                title: 'Delete this conversation?',
                message: 'It’s removed from your inbox. The other person keeps their copy.',
                confirmLabel: 'Delete',
                destructive: true,
                onConfirm: () => {
                  leaveConversation(conversation.id);
                  router.back();
                },
              });
            },
          },
        ]}
      />

      <AttachPlateSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={onShareOrder} />

      <MessageActionsSheet
        visible={!!actionTarget}
        message={actionTarget}
        anchor={actionAnchor}
        mine={actionTarget?.senderId === currentUser.id}
        currentEmoji={actionTarget ? myReaction(actionTarget.id) : undefined}
        onClose={() => setActionTarget(null)}
        onReact={(emoji) => {
          const target = actionTarget;
          setActionTarget(null);
          if (target) {
            tapLight();
            react(target.id, emoji);
          }
        }}
        onReply={() => {
          setReplyTo(actionTarget);
          setActionTarget(null);
        }}
        onForward={() => {
          setForwarding(actionTarget);
          setActionTarget(null);
        }}
        onDeleteForMe={() => {
          const target = actionTarget;
          setActionTarget(null);
          if (target) hideMessage(target.id);
        }}
        onUnsend={() => {
          const target = actionTarget;
          setActionTarget(null);
          if (!target) return;
          warn();
          confirmAction({
            title: 'Unsend this message?',
            message: 'It disappears for everyone in the conversation.',
            confirmLabel: 'Unsend',
            destructive: true,
            onConfirm: () => unsendMessage(target.id),
          });
        }}
        onReport={() => {
          const target = actionTarget;
          setActionTarget(null);
          if (target) router.push(`/report?targetType=user&targetId=${target.senderId}`);
        }}
      />

      {/* Forwarding reuses the share sheet — picking people and sending is
          exactly what it already does. Passed as `forward` rather than a
          payload so it carries whatever the message actually is: text, a voice
          note, or a shared card. */}
      <SendToSheet
        visible={!!forwarding}
        onClose={() => setForwarding(null)}
        payload={null}
        forward={forwarding}
      />
    </View>
  );
}

/**
 * The thread's own header — a title with the other person's face and a tap
 * target through to them. ScreenHeader can't carry an avatar + subtitle, and
 * "who am I talking to" is the one thing this screen must never leave ambiguous.
 */
function ThreadHeader({
  title,
  subtitle,
  avatar,
  verified,
  onBack,
  onTitlePress,
  onOptions,
}: {
  title: string;
  subtitle?: string;
  avatar?: string;
  verified?: boolean;
  onBack: () => void;
  onTitlePress?: () => void;
  onOptions?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.background },
      ]}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.headerIcon}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Pressable style={styles.headerTitle} onPress={onTitlePress} disabled={!onTitlePress}>
        {avatar && <Avatar uri={avatar} size={34} verified={verified} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.text, fontFamily: displayFont }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.headerSub, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </Pressable>
      {onOptions && (
        <Pressable onPress={onOptions} hitSlop={10} style={styles.headerIcon}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Pick one of your own plates to send. Your plates are what "you have to try
 * this" almost always means — anything else is a share from the post itself,
 * which the Send-to sheet already handles.
 */
function AttachPlateSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (order: Order) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { ordersByUser, currentUser, restaurantFor } = useData();
  const mine = ordersByUser(currentUser.id);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text, fontFamily: displayFont }]}>
            Send a plate
          </Text>
          {mine.length === 0 ? (
            <Text style={[styles.blank, { color: colors.textMuted }]}>
              You haven’t posted a plate yet.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {mine.map((o) => {
                const media = postMedia(o)[0];
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => onPick(o)}
                    style={({ pressed }) => [
                      styles.plateRow,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Image source={{ uri: media.uri }} style={styles.plateThumb} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>
                        {o.dishName}
                      </Text>
                      <Text style={[styles.plateMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {restaurantFor(o.restaurantId)?.name ?? 'a restaurant'}
                      </Text>
                    </View>
                    <RatingBadge score={o.rating} size="sm" />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerName: { fontSize: 16, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  day: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginVertical: 12 },
  blank: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  goneText: { fontSize: 14, fontWeight: '500' },
  composerWrap: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.md,
    marginBottom: 8,
    paddingRight: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  replyBar: { width: 3, alignSelf: 'stretch', marginRight: -4 },
  replyWho: { fontSize: 11, fontWeight: '800' },
  replyText: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    fontWeight: '500',
  },
  sendBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  requestBar: { paddingHorizontal: spacing.lg, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  requestText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  requestActions: { flexDirection: 'row', gap: 10 },
  requestBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.pill },
  requestBtnText: { fontSize: 14, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  plateThumb: { width: 48, height: 48, borderRadius: radius.sm },
  plateName: { fontSize: 15, fontWeight: '700' },
  plateMeta: { fontSize: 13, fontWeight: '500', marginTop: 2 },
});
