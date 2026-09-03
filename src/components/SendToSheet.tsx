import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Avatar } from '@/components/Avatar';
import { Message, MessageKind } from '@/data/messages';
import { User } from '@/data/types';
import { showAlert } from '@/lib/dialog';
import { success, tapLight, tick } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export interface SharePayload {
  /** What kind of card the recipients will see in their thread. */
  kind: Extract<MessageKind, 'plate' | 'plato'>;
  attachmentId: string;
  /** Which plate of a multi-plate post — the one the sender swiped to. */
  attachmentIndex?: number;
  /** Copy for the system share sheet (see lib/invite). */
  shareMessage: string;
  /** The canonical URL, for Copy link. */
  link: string;
  /** Shown at the top so it's obvious what's being sent. */
  label: string;
}

const COLUMNS = 3;

/**
 * "Send to" — sharing, in the order people actually use it.
 *
 * People first, in a grid: sending a plate to a friend inside Plated is the
 * whole point of the button ("you have to try this"), and a grid shows three
 * times as many faces as a row before anyone has to scroll or search. Recent
 * threads lead, then people you follow.
 *
 * The row along the bottom is everything that isn't a person — add it to your
 * story, copy the link, hand it to the system share sheet. It's replaced by
 * the Send button the moment you pick someone, because at that point it's the
 * only action you want.
 */
export function SendToSheet({
  visible,
  onClose,
  payload,
  forward,
}: {
  visible: boolean;
  onClose: () => void;
  payload: SharePayload | null;
  /**
   * Forwarding an existing message rather than sharing a post. Takes precedence
   * over `payload`: a forward carries whatever the original was — text, a voice
   * note, or a shared card — so it can't be described as a SharePayload, which
   * only knows about plates and Platos.
   */
  forward?: Message | null;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { followingUsers, followerUsers, topCreators, currentUser, isBlocked } = useData();
  const { sendTo, conversations, otherIds } = useMessages();

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Recent threads first: whoever you last talked to is who you're most likely
  // sending this to. Everyone else follows in the order People already uses.
  const people = useMemo(() => {
    const pool = new Map<string, User>();
    for (const u of [...followingUsers(), ...followerUsers(), ...topCreators()]) {
      if (u.id === currentUser.id || isBlocked(u.id) || pool.has(u.id)) continue;
      pool.set(u.id, u);
    }
    const out: User[] = [];
    const taken = new Set<string>();
    // conversations arrive newest-activity-first from the context.
    for (const id of conversations.filter((c) => !c.isGroup).flatMap(otherIds)) {
      const u = pool.get(id);
      if (u && !taken.has(id)) {
        taken.add(id);
        out.push(u);
      }
    }
    for (const [id, u] of pool) {
      if (!taken.has(id)) out.push(u);
    }
    return out;
  }, [conversations, otherIds, followingUsers, followerUsers, topCreators, currentUser.id, isBlocked]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q),
    );
  }, [people, query]);

  const cell = (width - spacing.lg * 2) / COLUMNS;
  const sheetHeight = Math.round(height * 0.76);

  const close = () => {
    setQuery('');
    setPicked([]);
    setNote('');
    setSentCount(0);
    setCopied(false);
    onClose();
  };

  const toggle = (id: string) => {
    tick();
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const onSend = async () => {
    if ((!payload && !forward) || picked.length === 0 || sending) return;
    setSending(true);
    // A forward re-sends the original as-is; anything typed here rides along as
    // a separate line rather than overwriting what's being forwarded.
    const draft = forward
      ? {
          kind: forward.kind,
          attachmentId: forward.attachmentId,
          attachmentIds: forward.attachmentIds,
          attachmentIndex: forward.attachmentIndex,
          durationMs: forward.durationMs,
          text: forward.kind === 'text' ? forward.text : note.trim() || forward.text,
        }
      : {
          kind: payload!.kind,
          attachmentId: payload!.attachmentId,
          attachmentIndex: payload!.attachmentIndex,
          text: note.trim(),
        };
    const sent = await sendTo(picked, draft);
    setSending(false);
    if (sent === 0) {
      showAlert('Couldn’t send', 'Nothing went out — please try again.');
      return;
    }
    success();
    // A brief confirmation beats a sheet that just vanishes: you know it went.
    setSentCount(sent);
    setTimeout(close, 900);
  };

  const onCopyLink = async () => {
    // Forwarded text copies itself; there's no canonical URL for a message.
    const value = forward ? forward.text : payload?.link;
    if (!value) return;
    tapLight();
    await Clipboard.setStringAsync(value);
    // Confirmed in place rather than with an alert — copying is not an event
    // worth a modal, but it is worth saying it happened.
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const onAddToStory = () => {
    if (!payload) return;
    tapLight();
    close();
    router.push({
      pathname: '/create-story',
      params:
        payload.kind === 'plate'
          ? { orderId: payload.attachmentId, plate: String(payload.attachmentIndex ?? 0) }
          : { platoId: payload.attachmentId },
    });
  };

  const onExternalShare = () => {
    const message = forward ? forward.text : payload?.shareMessage;
    if (!message) return;
    tapLight();
    close();
    // No separate `url` field — on iOS, passing both `message` and `url` to
    // Share.share makes Messages fetch and attach the page as a raw file
    // instead of generating a link preview. The message text already embeds
    // the real link (see lib/invite), which is enough for Messages/etc. to
    // auto-detect and preview on their own.
    // iOS can't present the system share sheet while this Modal is still on its
    // way out — the presentation is swallowed and nothing appears. Wait for the
    // dismissal to finish first. (Same reason ActionSheet delays its actions.)
    setTimeout(() => {
      Share.share({ message }).catch(() => {});
    }, 400);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, height: sheetHeight }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />

            {sentCount > 0 ? (
              <View style={styles.sent}>
                <Ionicons name="checkmark-circle" size={44} color={colors.success} />
                <Text style={[styles.sentText, { color: colors.text }]}>
                  Sent to {sentCount} {sentCount === 1 ? 'person' : 'people'}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.searchRow}>
                  <View
                    style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      style={[styles.search, { color: colors.text }]}
                    />
                    {query.length > 0 && (
                      <Pressable onPress={() => setQuery('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                  <Pressable
                    onPress={() => {
                      tapLight();
                      close();
                      router.push('/messages/new');
                    }}
                    style={[styles.groupBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="people-outline" size={19} color={colors.text} />
                  </Pressable>
                </View>

                <ScrollView
                  // flex:1 so the grid scrolls inside the remaining space. Left
                  // to size itself it grows past the sheet and shoves the
                  // action row off the bottom of the screen.
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.grid}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  {filtered.map((u) => {
                    const on = picked.includes(u.id);
                    return (
                      <Pressable
                        key={u.id}
                        onPress={() => toggle(u.id)}
                        style={[styles.cell, { width: cell }]}>
                        <View>
                          <Avatar uri={u.avatar} size={76} ring={on} />
                          {on && (
                            <View
                              style={[styles.check, { backgroundColor: colors.accent, borderColor: colors.card }]}>
                              <Ionicons name="checkmark" size={13} color={colors.accentText} />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[styles.cellName, { color: on ? colors.accent : colors.text }]}
                          numberOfLines={2}>
                          {u.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {filtered.length === 0 && (
                    <Text style={[styles.noPeople, { color: colors.textMuted }]}>
                      {query.trim() ? `No one matches “${query.trim()}”.` : 'Follow someone to send them plates.'}
                    </Text>
                  )}
                </ScrollView>

                {picked.length > 0 ? (
                  <View
                    style={[
                      styles.sendBar,
                      { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 },
                    ]}>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder={forward ? 'Add a message…' : 'Add a message…'}
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.note,
                        { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                      ]}
                    />
                    <AnimatedPressable
                      pressScale={0.95}
                      onPress={onSend}
                      disabled={sending}
                      style={[styles.sendBtn, { backgroundColor: colors.accent, opacity: sending ? 0.6 : 1 }]}>
                      <Text style={[styles.sendText, { color: colors.accentText }]}>
                        {sending ? 'Sending…' : `Send${picked.length > 1 ? ` · ${picked.length}` : ''}`}
                      </Text>
                    </AnimatedPressable>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={[styles.actionsRail, { borderTopColor: colors.border }]}
                    contentContainerStyle={[styles.actions, { paddingBottom: insets.bottom + 8 }]}>
                    {payload && (
                      <ShareAction icon="add-circle-outline" label="Add to story" onPress={onAddToStory} />
                    )}
                    <ShareAction
                      icon={copied ? 'checkmark' : 'link-outline'}
                      label={copied ? 'Copied' : forward ? 'Copy text' : 'Copy link'}
                      onPress={onCopyLink}
                      highlight={copied}
                    />
                    <ShareAction icon="share-outline" label="Share to…" onPress={onExternalShare} />
                  </ScrollView>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ShareAction({
  icon,
  label,
  onPress,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}>
      <View
        style={[
          styles.actionIcon,
          { backgroundColor: highlight ? colors.accent : colors.surface, borderColor: colors.border },
        ]}>
        <Ionicons name={icon} size={22} color={highlight ? colors.accentText : colors.text} />
      </View>
      <Text style={[styles.actionLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 10 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  search: { flex: 1, fontSize: 15, fontWeight: '500' },
  groupBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 20,
  },
  cell: { alignItems: 'center', gap: 8, marginBottom: 18 },
  cellName: { fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 4 },
  check: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPeople: { width: '100%', textAlign: 'center', fontSize: 14, fontWeight: '500', paddingVertical: 40 },
  actionsRail: { flexGrow: 0, borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: 14 },
  action: { alignItems: 'center', gap: 7, width: 74 },
  actionIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: { fontSize: 11, fontWeight: '700' },
  sendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  note: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  sendBtn: { paddingHorizontal: 22, height: 46, justifyContent: 'center', borderRadius: radius.pill },
  sendText: { fontSize: 15, fontWeight: '800' },
  sent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sentText: { fontSize: 17, fontWeight: '800' },
});
