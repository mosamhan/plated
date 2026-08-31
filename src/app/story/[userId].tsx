import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Avatar } from '@/components/Avatar';
import { SendToSheet } from '@/components/SendToSheet';
import { HEART_EMOJI } from '@/data/messages';
import { Story, STORY_DURATION_MS, timeLeft } from '@/data/stories';
import { shortTime } from '@/lib/conversation';
import { confirmAction } from '@/lib/dialog';
import { success, tapLight, warn } from '@/lib/haptics';
import { exploreFocusHref } from '@/lib/inAppRoute';
import { plateLink } from '@/lib/invite';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { useStories } from '@/store/StoriesContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Full-screen story viewer.
 *
 * Tap the right two-thirds for next, the left third for previous, hold anywhere
 * to pause — the gestures everyone already knows, so nothing has to be taught.
 * Advancing past the last story closes the viewer rather than silently looping,
 * which would leave you stuck in someone's stories with no obvious way out.
 *
 * Replies go to DMs (kind `story_reply`, carrying the story id), so the answer
 * to "where was that?" lands in a real conversation instead of a reaction that
 * expires with the story.
 */
export default function StoryViewer() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { userFor, currentUser, restaurantFor, isFollowing, toggleFollow } = useData();
  const { storiesFor, markSeen, deleteStory, viewersFor, loadViewers, isStoryMuted, toggleStoryMute } =
    useStories();
  const { startDirect, sendMessage } = useMessages();

  const stories = useMemo(() => (userId ? storiesFor(userId) : []), [userId, storiesFor]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState('');
  const [replySent, setReplySent] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [ownMoreOpen, setOwnMoreOpen] = useState(false);

  const author = userFor(userId ?? '');
  const isMine = userId === currentUser.id;
  const mutedStories = isStoryMuted(userId ?? '');
  const story: Story | undefined = stories[index];

  const progress = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => router.back(), [router]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) {
        setIndex(0);
        return;
      }
      if (next >= stories.length) {
        close();
        return;
      }
      setIndex(next);
    },
    [stories.length, close],
  );

  // Each story starts its bar from zero.
  useEffect(() => {
    if (!story) return;
    markSeen(story.id);
    progress.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // Run (or hold) the bar and the advance timer together, so the bar is always
  // telling the truth about when the story turns over. Pausing freezes where it
  // is and resumes from there — restarting the bar on every long-press would
  // make holding to read a caption cost you the story.
  useEffect(() => {
    if (!story) return;
    if (paused) {
      cancelAnimation(progress);
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    const remaining = Math.max(300, STORY_DURATION_MS * (1 - progress.value));
    progress.value = withTiming(1, { duration: remaining });
    timer.current = setTimeout(() => goTo(index + 1), remaining);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, index]);

  useEffect(() => {
    if (isMine && story) loadViewers(story.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMine, story?.id]);

  const onReply = async (preset?: string) => {
    const text = preset ?? reply.trim();
    if (!story || !text) return;
    tapLight();
    if (!preset) setReply('');
    const conversationId = await startDirect(story.userId);
    if (!conversationId) return;
    await sendMessage(conversationId, { kind: 'story_reply', attachmentId: story.id, text });
    success();
    setReplySent(true);
    setTimeout(() => setReplySent(false), 1600);
  };

  if (!story) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center', gap: 10 }]}>
        <Ionicons name="time-outline" size={38} color="rgba(255,255,255,0.7)" />
        <Text style={styles.expired}>These stories have expired.</Text>
        <Pressable onPress={close} hitSlop={10} style={styles.expiredBtn}>
          <Text style={styles.expiredBtnText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StoryMedia story={story} paused={paused} />

      {/* Tap zones sit under the chrome so the header and composer stay tappable. */}
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Pressable
            style={{ width: width / 3 }}
            onPress={() => goTo(index - 1)}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            delayLongPress={180}
          />
          <Pressable
            style={{ flex: 1 }}
            onPress={() => goTo(index + 1)}
            onLongPress={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            delayLongPress={180}
          />
        </View>
      </View>

      <LinearGradient colors={['rgba(0,0,0,0.65)', 'transparent']} style={styles.topScrim} pointerEvents="none" />

      {/* Same reason as the bottom bar: the modal reports no top inset, and the
          progress bars would sit under the status bar. */}
      <View style={[styles.top, { paddingTop: Math.max(insets.top, 44) + 8 }]}>
        <View style={styles.bars}>
          {stories.map((s, i) => (
            <ProgressBar key={s.id} state={i < index ? 'done' : i === index ? 'active' : 'todo'} progress={progress} />
          ))}
        </View>

        <View style={styles.identity}>
          <Pressable
            style={styles.identityLeft}
            onPress={() => {
              close();
              router.push(`/user/${author.id}`);
            }}>
            <Avatar uri={author.avatar} size={34} verified={author.verified} />
            <View>
              <Text style={styles.name} numberOfLines={1}>
                {isMine ? 'Your story' : author.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {shortTime(story.createdAt)} · {timeLeft(story)}
              </Text>
            </View>
          </Pressable>

          {/* Someone else's story: the controls that are about *them* live up
              here beside the X, out of the way of replying. Your own story's
              controls are all in the bottom bar instead — there's nothing to
              report or unfollow about yourself. */}
          {!isMine && (
            <Pressable
              hitSlop={10}
              onPress={() => {
                tapLight();
                setPaused(true);
                setOverflowOpen(true);
              }}>
              <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
            </Pressable>
          )}
          <Pressable hitSlop={10} onPress={close}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </View>

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      {/* The padding lives on the inner View, not the KeyboardAvoidingView:
          `behavior="padding"` *sets* paddingBottom itself (to 0 with no
          keyboard up), so anything passed in its style is overwritten and the
          controls end up under the home indicator.

          `useSafeAreaInsets` also reports 0 inside a fullScreenModal
          presentation, so the clearance is floored at 34 — what a notched
          iPhone would have reported — rather than trusted. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottom}>
        <View style={{ gap: 10, paddingBottom: Math.max(insets.bottom, 34) + 18 }}>
        {!!story.caption && <Text style={styles.caption}>{story.caption}</Text>}

        {/* The anchor back into durable content — a story that names a place is
            only useful if you can get to the place. */}
        {story.restaurantId && (
          <Pressable
            onPress={() => {
              close();
              router.navigate(exploreFocusHref(story.restaurantId!));
            }}
            style={styles.place}>
            <Ionicons name="location" size={13} color="#fff" />
            <Text style={styles.placeText} numberOfLines={1}>
              {restaurantFor(story.restaurantId)?.name ?? 'View place'}
            </Text>
          </Pressable>
        )}

        {isMine ? (
          <View style={styles.ownBar}>
            <OwnAction
              icon="people-outline"
              label={`${viewersFor(story.id).length || ''} Activity`.trim()}
              onPress={() => {
                tapLight();
                setPaused(true);
                setViewersOpen(true);
              }}
            />
            <OwnAction
              icon="paper-plane-outline"
              label="Send"
              onPress={() => {
                tapLight();
                setPaused(true);
                setSendOpen(true);
              }}
            />
            <OwnAction
              icon="ellipsis-horizontal"
              label="More"
              onPress={() => {
                tapLight();
                setPaused(true);
                setOwnMoreOpen(true);
              }}
            />
          </View>
        ) : replySent ? (
          <View style={styles.replySent}>
            <Ionicons name="checkmark-circle" size={17} color="#fff" />
            <Text style={styles.replySentText}>Sent</Text>
          </View>
        ) : (
          <View style={styles.replyRow}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              placeholder="Send message…"
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.replyInput}
            />
            {reply.trim() ? (
              <Pressable onPress={() => onReply()} hitSlop={8} style={styles.replyIcon}>
                <Ionicons name="arrow-up-circle" size={32} color="#fff" />
              </Pressable>
            ) : (
              <>
                {/* Heart sends a ❤️ straight to their DMs — the same thing the
                    reply field does, minus the typing. */}
                <Pressable onPress={() => onReply(HEART_EMOJI)} hitSlop={8} style={styles.replyIcon}>
                  <Ionicons name="heart-outline" size={27} color="#fff" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    tapLight();
                    setPaused(true);
                    setSendOpen(true);
                  }}
                  hitSlop={8}
                  style={styles.replyIcon}>
                  <Ionicons name="paper-plane-outline" size={25} color="#fff" />
                </Pressable>
              </>
            )}
          </View>
        )}
        </View>
      </KeyboardAvoidingView>

      {/* Sharing a story means sharing what it's about — the plate it points at
          if there is one, since the story itself is gone tomorrow. */}
      <SendToSheet
        visible={sendOpen}
        onClose={() => {
          setSendOpen(false);
          setPaused(false);
        }}
        payload={
          story.orderId
            ? {
                kind: 'plate',
                attachmentId: story.orderId,
                shareMessage: `${author.name} on Plated: ${story.caption || 'take a look'} ${plateLink(story.orderId)}`,
                link: plateLink(story.orderId),
                label: 'this plate',
              }
            : null
        }
      />

      {/* Someone else's story — the three things you might want to do about the
          person whose story it is. */}
      <ActionSheet
        visible={overflowOpen}
        onClose={() => {
          setOverflowOpen(false);
          setPaused(false);
        }}
        title={`@${author.handle}`}
        actions={[
          {
            label: 'Report',
            icon: 'flag-outline',
            destructive: true,
            onPress: () => router.push(`/report?targetType=user&targetId=${author.id}`),
          },
          {
            label: mutedStories ? 'Unmute stories' : 'Mute stories',
            icon: mutedStories ? 'notifications-outline' : 'notifications-off-outline',
            onPress: () => {
              toggleStoryMute(author.id);
              close();
            },
          },
          ...(isFollowing(author.id)
            ? [
                {
                  label: 'Unfollow',
                  icon: 'person-remove-outline' as const,
                  onPress: () => {
                    toggleFollow(author.id);
                    close();
                  },
                },
              ]
            : []),
        ]}
      />

      {/* Your own story — everything you can do to the post itself. */}
      <ActionSheet
        visible={ownMoreOpen}
        onClose={() => {
          setOwnMoreOpen(false);
          setPaused(false);
        }}
        title="Your story"
        actions={[
          {
            label: 'Delete story',
            icon: 'trash-outline',
            destructive: true,
            onPress: () => {
              warn();
              confirmAction({
                title: 'Delete this story?',
                message: 'It disappears for everyone right away.',
                confirmLabel: 'Delete',
                destructive: true,
                onConfirm: () => {
                  deleteStory(story.id);
                  if (stories.length <= 1) close();
                  else setIndex((i) => Math.max(0, i - 1));
                },
              });
            },
          },
          {
            label: 'Story settings',
            icon: 'settings-outline',
            onPress: () => {
              close();
              router.push('/settings/story');
            },
          },
        ]}
      />

      <ViewersSheet
        visible={viewersOpen}
        storyId={story.id}
        onClose={() => {
          setViewersOpen(false);
          setPaused(false);
        }}
      />
    </View>
  );
}

/**
 * Image or short clip, whichever the story is — full-bleed.
 *
 * A blurred copy sits underneath so a photo that isn't 9:16 has something of
 * its own behind the letterbox rather than flat black, but the story itself
 * fills the screen. Stories are a full-screen format; insetting the media makes
 * it read as a post someone shared instead of a moment.
 */
function StoryMedia({ story, paused }: { story: Story; paused: boolean }) {
  return (
    <>
      <Image
        source={{ uri: story.mediaUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={60}
        transition={150}
      />
      {story.mediaType === 'clip' ? (
        <StoryClip uri={story.mediaUrl} paused={paused} />
      ) : (
        <Image
          source={{ uri: story.mediaUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      )}
    </>
  );
}

function StoryClip({ uri, paused }: { uri: string; paused: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

/** One of the three controls under your own story. */
function OwnAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ownAction, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={24} color="#fff" />
      <Text style={styles.ownActionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProgressBar({
  state,
  progress,
}: {
  state: 'done' | 'active' | 'todo';
  progress: { value: number };
}) {
  const animated = useAnimatedStyle(() => ({
    width: `${(state === 'done' ? 1 : state === 'active' ? progress.value : 0) * 100}%`,
  }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, animated]} />
    </View>
  );
}

/** Who watched this one — author-only, enforced by RLS on story_views. */
function ViewersSheet({
  visible,
  storyId,
  onClose,
}: {
  visible: boolean;
  storyId: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userFor } = useData();
  const { viewersFor } = useStories();
  const viewers = viewersFor(storyId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.text, fontFamily: displayFont }]}>
            {viewers.length} {viewers.length === 1 ? 'view' : 'views'}
          </Text>
          {viewers.length === 0 ? (
            <Text style={[styles.sheetBlank, { color: colors.textMuted }]}>
              Nobody’s seen this one yet.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {viewers.map((id) => {
                const u = userFor(id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      onClose();
                      router.push(`/user/${id}`);
                    }}
                    style={({ pressed }) => [
                      styles.viewerRow,
                      { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Avatar uri={u.avatar} size={40} verified={u.verified} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.viewerName, { color: colors.text }]} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <Text style={[styles.viewerHandle, { color: colors.textMuted }]} numberOfLines={1}>
                        @{u.handle}
                      </Text>
                    </View>
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
  root: { flex: 1, backgroundColor: '#000' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 190 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 300 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.md },
  bars: { flexDirection: 'row', gap: 3, marginBottom: 12 },
  bar: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  identityLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: '#fff', fontSize: 14, fontWeight: '800' },
  meta: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 1 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, gap: 10 },
  caption: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  placeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  replyIcon: { width: 34, alignItems: 'center' },
  replySent: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 },
  replySentText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  ownBar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, paddingBottom: 4 },
  ownAction: { alignItems: 'center', gap: 6, minWidth: 76, paddingVertical: 2 },
  ownActionLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  expired: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' },
  expiredBtn: {
    marginTop: 6,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  expiredBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  sheetBlank: { fontSize: 14, fontWeight: '500', textAlign: 'center', paddingVertical: 26 },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  viewerName: { fontSize: 15, fontWeight: '700' },
  viewerHandle: { fontSize: 13, fontWeight: '500', marginTop: 1 },
});
