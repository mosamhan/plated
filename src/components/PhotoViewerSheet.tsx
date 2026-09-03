import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Message, QUICK_REACTIONS } from '@/data/messages';
import { dayLabel } from '@/lib/conversation';
import { showAlert } from '@/lib/dialog';
import { success, tapLight } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { useTheme } from '@/theme/ThemeContext';

/** "Today 5:47 PM" — dayLabel's Today/Yesterday/date plus a time-of-day. */
function timestampLabel(iso: string): string {
  const time = new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dayLabel(iso)} ${time}`;
}

/**
 * The real extension a chat image's own URL ends in — a photo from the
 * library uploads as `.jpg` (`uploadAsset`'s own fixed mime type), but a
 * GIF sent via the Giphy picker is a genuine `https://...giphy.com/.../*.gif`
 * URL, and `saveToLibraryAsync` needs the local file's extension to
 * actually match its bytes. Falls back to jpg for anything unrecognized
 * (a query string, no extension at all) rather than guessing further.
 */
function imageExtension(uri: string): string {
  const match = uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();
  return ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
}

// The two fastest reactions, for the quick-tap row — same set QUICK_REACTIONS
// already leads with, not a new curated list.
const QUICK_PICKS = QUICK_REACTIONS.slice(0, 2);

/**
 * Full-screen photo viewer for a sent/received image message — a proper
 * header (sender + timestamp) and toolbar (quick reply, quick react,
 * download, forward) over the bare pinch-zoom `ZoomableImage` already gives
 * chat photos elsewhere. A plain `Modal`, same as every other full-screen
 * sheet in messaging (`PhotoPickerSheet`, `SendToSheet`) — opened by a
 * discrete tap rather than continuing an in-flight gesture, so there's no
 * need for `ZoomPortal`'s unmount-avoidance.
 */
export function PhotoViewerSheet({
  message,
  initialIndex = 0,
  onClose,
  onForward,
}: {
  /** The image message being viewed — the sheet is closed when this is null. */
  message: Message | null;
  /** Which photo of an album to open on, if opened from a specific page. */
  initialIndex?: number;
  onClose: () => void;
  /** Opens the thread's own forward sheet — it already owns one. */
  onForward: (message: Message) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userFor } = useData();
  const { sendMessage, react } = useMessages();
  const [index, setIndex] = useState(initialIndex);
  const [reply, setReply] = useState('');
  const [pageWidth, setPageWidth] = useState(0);
  const [saving, setSaving] = useState(false);

  // Resets the page/draft whenever a *different* message is opened — adjusted
  // during render (React's documented pattern for this) rather than in an
  // effect, so opening a new photo doesn't flash the previous one's state
  // for a frame first.
  const [openedFor, setOpenedFor] = useState(message?.id);
  if (message?.id !== openedFor) {
    setOpenedFor(message?.id);
    setIndex(initialIndex);
    setReply('');
  }

  const uris = message
    ? message.attachmentIds?.length
      ? message.attachmentIds
      : message.attachmentId
        ? [message.attachmentId]
        : []
    : [];
  const sender = message ? userFor(message.senderId) : null;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  };

  const sendReply = () => {
    if (!message) return;
    const text = reply.trim();
    if (!text) return;
    tapLight();
    setReply('');
    sendMessage(message.conversationId, { text, replyTo: message.id }).catch(() => {});
  };

  const sendQuickReact = (emoji: string) => {
    if (!message) return;
    tapLight();
    react(message.id, emoji);
  };

  const save = async () => {
    if (saving || uris.length === 0) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showAlert(
          'Photo library access needed',
          "Plated can't save this photo without permission — enable it in Settings and try again.",
        );
        return;
      }
      const remoteUri = uris[index];
      // Not always a jpg: a GIF sent via the Giphy picker (AttachSheet's
      // "GIFs" tab / the predictive suggestion rail) is a real .gif URL, and
      // writing its bytes to a file *named* .jpg is exactly the kind of
      // mismatch that makes MediaLibrary.saveToLibraryAsync silently fail or
      // import a file iOS Photos can't actually open — the extension has to
      // match what's really being downloaded, not assume every chat image
      // is a JPEG.
      const target = `${FileSystem.cacheDirectory}${Date.now()}.${imageExtension(remoteUri)}`;
      const { uri: localUri } = await FileSystem.downloadAsync(remoteUri, target);
      await MediaLibrary.saveToLibraryAsync(localUri);
      success();
    } catch (e) {
      if (__DEV__) console.warn('[Plated] photo save failed', e);
      showAlert('Couldn’t save that photo', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!message} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {message && sender && (
          <>
            <View style={styles.header}>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="chevron-back" size={26} color="#fff" />
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.headerName}>{sender.name}</Text>
                <Text style={styles.headerTime}>{timestampLabel(message.createdAt)}</Text>
              </View>
              <Pressable onPress={save} hitSlop={10} disabled={saving}>
                <Ionicons name="download-outline" size={22} color={saving ? 'rgba(255,255,255,0.4)' : '#fff'} />
              </Pressable>
            </View>

            <View style={styles.pager} onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}>
              {pageWidth > 0 && (
                <FlatList
                  data={uris}
                  horizontal
                  pagingEnabled
                  initialScrollIndex={initialIndex}
                  getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(uri, i) => `${uri}-${i}`}
                  onMomentumScrollEnd={onScrollEnd}
                  renderItem={({ item }) => (
                    <Image
                      source={{ uri: item }}
                      style={{ width: pageWidth, height: '100%' }}
                      contentFit="contain"
                    />
                  )}
                />
              )}
              {uris.length > 1 && (
                <View style={styles.dots} pointerEvents="none">
                  {uris.map((_, i) => (
                    <View key={i} style={[styles.dot, { opacity: i === index ? 1 : 0.4 }]} />
                  ))}
                </View>
              )}
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={[styles.toolbar, { paddingBottom: insets.bottom + 10 }]}>
                {QUICK_PICKS.map((emoji) => (
                  <Pressable key={emoji} onPress={() => sendQuickReact(emoji)} hitSlop={6}>
                    <Text style={styles.quickEmoji}>{emoji}</Text>
                  </Pressable>
                ))}
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder={`Message ${sender.name.split(' ')[0]}`}
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={styles.input}
                  onSubmitEditing={sendReply}
                  returnKeyType="send"
                />
                {reply.trim() ? (
                  <Pressable onPress={sendReply} hitSlop={6}>
                    <Ionicons name="send" size={22} color={colors.accent} />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => onForward(message)} hitSlop={6}>
                    <Ionicons name="arrow-redo-outline" size={24} color="#fff" />
                  </Pressable>
                )}
              </View>
            </KeyboardAvoidingView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerTime: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', marginTop: 1 },
  pager: { flex: 1 },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  quickEmoji: { fontSize: 24 },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
