import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
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

import { Avatar } from '@/components/Avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { Message, MessageKind } from '@/data/messages';
import { showAlert } from '@/lib/dialog';
import { success, tapLight, tick } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { MessageDraft, useMessages } from '@/store/MessagesContext';
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

/** One recipient row — either an existing thread (1:1 or group) or a person
 *  you haven't messaged yet. Recents lead; search reaches past them. */
interface ShareTarget {
  key: string;
  isGroup: boolean;
  /** Set when this is an existing conversation — send goes straight there. */
  conversationId?: string;
  /** Set for anything that resolves to a single person: an existing 1:1's
   *  other side, or someone with no thread yet. Absent for group targets. */
  userId?: string;
  name: string;
  subtitle: string;
  avatarUri?: string;
  memberAvatars?: string[];
}

/**
 * "Send to" — a TikTok-style recipient list: recent threads first (groups
 * included, not just 1:1s), search reaching past what's shown, and tapping a
 * row sends immediately — no separate "confirm" step for the common case of
 * sending to one person or one thread. Picking several people to spin up a
 * brand-new group lives behind its own explicit "New group" mode, since that
 * is a different action (create + send) from the default (send to what's
 * already there).
 *
 * The row along the bottom is everything that isn't a person: add it to your
 * story, copy the link, or hand it to a specific outside app. WhatsApp, SMS,
 * and Mail get real one-tap deep links (all three have a documented,
 * key-free share URL scheme). Facebook opens its own web sharer, which is
 * the only prefilled-content path Facebook exposes without their SDK.
 * Instagram Direct and Snapchat don't expose *any* deep link for prefilled
 * text/link content without registering for their respective developer
 * kits — for those, "Share to…" (the system sheet) is the honest answer,
 * not a button that quietly does nothing.
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
  const { height } = useWindowDimensions();
  const { followingUsers, followerUsers, topCreators, currentUser, isBlocked, userFor } = useData();
  const { conversations, otherIds, sendMessage, startDirect, createGroup } = useMessages();

  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [groupMode, setGroupMode] = useState(false);
  const [groupPicked, setGroupPicked] = useState<string[]>([]);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [copied, setCopied] = useState(false);

  // One list, recents-first: every conversation you already have (groups
  // included), then anyone you could message but haven't yet — how search
  // reaches people who aren't in your recents.
  const targets = useMemo<ShareTarget[]>(() => {
    const out: ShareTarget[] = [];
    const seenUserIds = new Set<string>();
    for (const c of conversations) {
      if (c.isGroup) {
        const others = otherIds(c);
        out.push({
          key: c.id,
          isGroup: true,
          conversationId: c.id,
          name: c.title || others.map((o) => userFor(o).name).join(', '),
          subtitle: `${others.length + 1} members`,
          avatarUri: c.avatarUrl,
          memberAvatars: others.map((o) => userFor(o).avatar),
        });
      } else {
        const other = otherIds(c)[0];
        if (!other || isBlocked(other)) continue;
        seenUserIds.add(other);
        const u = userFor(other);
        out.push({
          key: c.id,
          isGroup: false,
          conversationId: c.id,
          userId: other,
          name: u.name,
          subtitle: `@${u.handle}`,
          avatarUri: u.avatar,
        });
      }
    }
    const pool = new Map<string, ReturnType<typeof userFor>>();
    for (const u of [...followingUsers(), ...followerUsers(), ...topCreators()]) {
      if (u.id === currentUser.id || isBlocked(u.id) || seenUserIds.has(u.id) || pool.has(u.id)) continue;
      pool.set(u.id, u);
    }
    for (const u of pool.values()) {
      out.push({ key: `u:${u.id}`, isGroup: false, userId: u.id, name: u.name, subtitle: `@${u.handle}`, avatarUri: u.avatar });
    }
    return out;
  }, [conversations, otherIds, userFor, followingUsers, followerUsers, topCreators, currentUser.id, isBlocked]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Picking people for a new group — an existing group thread can't be
    // folded into a new one, so only person-shaped targets make sense here.
    const pool = groupMode ? targets.filter((t) => !t.isGroup && t.userId) : targets;
    if (!q) return pool;
    return pool.filter((t) => t.name.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q));
  }, [targets, query, groupMode]);

  const sheetHeight = Math.round(height * 0.76);

  const close = () => {
    setQuery('');
    setNote('');
    setGroupMode(false);
    setGroupPicked([]);
    setSentKeys(new Set());
    setCopied(false);
    onClose();
  };

  const buildDraft = (): MessageDraft =>
    forward
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

  const sendToTarget = async (t: ShareTarget) => {
    if ((!payload && !forward) || sendingKey) return;
    tapLight();
    setSendingKey(t.key);
    const draft = buildDraft();
    let conversationId = t.conversationId ?? null;
    if (!conversationId && t.userId) conversationId = await startDirect(t.userId);
    if (conversationId) {
      await sendMessage(conversationId, draft).catch(() => {});
      success();
      setSentKeys((p) => new Set(p).add(t.key));
    } else {
      showAlert('Couldn’t send', 'Please try again.');
    }
    setSendingKey(null);
  };

  const toggleGroupPick = (userId: string) => {
    tick();
    setGroupPicked((prev) => (prev.includes(userId) ? prev.filter((p) => p !== userId) : [...prev, userId]));
  };

  const onCreateGroupAndSend = async () => {
    if ((!payload && !forward) || creatingGroup || groupPicked.length < 2) return;
    setCreatingGroup(true);
    const conversationId = await createGroup(groupPicked);
    if (!conversationId) {
      setCreatingGroup(false);
      showAlert('Couldn’t create group', 'Please try again.');
      return;
    }
    await sendMessage(conversationId, buildDraft()).catch(() => {});
    setCreatingGroup(false);
    success();
    close();
    router.push(`/messages/${conversationId}`);
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

  const shareText = forward ? forward.text : payload?.shareMessage;

  const onExternalShare = () => {
    if (!shareText) return;
    tapLight();
    close();
    // iOS can't present the system share sheet while this Modal is still on
    // its way out — the presentation is swallowed and nothing appears. Wait
    // for the dismissal to finish first. (Same reason ActionSheet delays.)
    setTimeout(() => {
      Share.share({ message: shareText }).catch(() => {});
    }, 400);
  };

  // WhatsApp/SMS/Mail all have a real, documented, key-free "compose with
  // this prefilled" URL scheme — Facebook's own sharer.php is the closest
  // equivalent it offers without its SDK (link only, no custom text; that's
  // a Facebook restriction, not a shortcut taken here). If the specific app
  // isn't installed, openURL rejects and this falls back to the system sheet
  // rather than silently doing nothing.
  const openOrFallback = async (url: string) => {
    tapLight();
    close();
    setTimeout(async () => {
      try {
        await Linking.openURL(url);
      } catch {
        Share.share({ message: shareText ?? '' }).catch(() => {});
      }
    }, 400);
  };

  const onWhatsApp = () => shareText && openOrFallback(`whatsapp://send?text=${encodeURIComponent(shareText)}`);
  const onSms = () =>
    shareText &&
    openOrFallback(Platform.OS === 'ios' ? `sms:&body=${encodeURIComponent(shareText)}` : `sms:?body=${encodeURIComponent(shareText)}`);
  const onMail = () =>
    shareText && openOrFallback(`mailto:?subject=${encodeURIComponent('Check this out on Plated')}&body=${encodeURIComponent(shareText)}`);
  const onFacebook = () => {
    const link = forward ? undefined : payload?.link;
    if (!link) {
      onExternalShare();
      return;
    }
    openOrFallback(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, height: sheetHeight }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />

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
                  tick();
                  setGroupMode((g) => !g);
                  setGroupPicked([]);
                }}
                style={[
                  styles.groupBtn,
                  { backgroundColor: groupMode ? colors.accent : colors.surface, borderColor: colors.border },
                ]}>
                <Ionicons
                  name={groupMode ? 'close' : 'people-outline'}
                  size={19}
                  color={groupMode ? colors.accentText : colors.text}
                />
              </Pressable>
            </View>

            {/* A caption rides along with whatever gets sent — typed once,
                before picking anyone, since sending itself is now a single
                tap per recipient rather than a separate confirm step. */}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a message… (optional)"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.note,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
            />

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {filtered.map((t) => {
                const sent = sentKeys.has(t.key);
                const picked = groupMode && t.userId ? groupPicked.includes(t.userId) : false;
                const sending = sendingKey === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => (groupMode ? t.userId && toggleGroupPick(t.userId) : sendToTarget(t))}
                    disabled={sending}
                    style={({ pressed }) => [styles.row, { opacity: pressed || sending ? 0.6 : 1 }]}>
                    {t.isGroup ? (
                      <GroupAvatar avatarUrl={t.avatarUri} memberAvatars={t.memberAvatars ?? []} size={48} />
                    ) : (
                      <Avatar uri={t.avatarUri ?? ''} size={48} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                        {t.name}
                      </Text>
                      <Text style={[styles.rowSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                        {t.subtitle}
                      </Text>
                    </View>
                    {groupMode ? (
                      <Ionicons
                        name={picked ? 'checkmark-circle' : 'ellipse-outline'}
                        size={24}
                        color={picked ? colors.accent : colors.border}
                      />
                    ) : sent ? (
                      <View style={[styles.sentBadge, { backgroundColor: colors.success }]}>
                        <Ionicons name="checkmark" size={13} color="#fff" />
                      </View>
                    ) : (
                      <View
                        style={[styles.sendPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.sendPillText, { color: colors.text }]}>Send</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
              {filtered.length === 0 && (
                <Text style={[styles.noPeople, { color: colors.textMuted }]}>
                  {query.trim()
                    ? `No one matches “${query.trim()}”.`
                    : groupMode
                      ? 'Follow someone to add them to a group.'
                      : 'Follow someone to send them plates.'}
                </Text>
              )}
            </ScrollView>

            {groupMode ? (
              <View style={[styles.sendBar, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
                <Pressable
                  onPress={onCreateGroupAndSend}
                  disabled={groupPicked.length < 2 || creatingGroup}
                  style={[
                    styles.createGroupBtn,
                    { backgroundColor: colors.accent, opacity: groupPicked.length < 2 || creatingGroup ? 0.5 : 1 },
                  ]}>
                  <Text style={[styles.sendText, { color: colors.accentText }]}>
                    {creatingGroup
                      ? 'Creating…'
                      : `New group${groupPicked.length > 0 ? ` · ${groupPicked.length}` : ''}`}
                  </Text>
                </Pressable>
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
                <ShareAction icon="logo-whatsapp" label="WhatsApp" onPress={onWhatsApp} />
                <ShareAction icon="chatbubble-outline" label="Messages" onPress={onSms} />
                <ShareAction icon="logo-facebook" label="Facebook" onPress={onFacebook} />
                <ShareAction icon="mail-outline" label="Email" onPress={onMail} />
                <ShareAction icon="ellipsis-horizontal" label="More" onPress={onExternalShare} />
              </ScrollView>
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
  note: {
    marginHorizontal: spacing.lg,
    marginTop: 10,
    height: 42,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  sentBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  sendPillText: { fontSize: 12, fontWeight: '700' },
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
  sendBar: { paddingHorizontal: spacing.lg, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  createGroupBtn: { height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  sendText: { fontSize: 15, fontWeight: '800' },
});
