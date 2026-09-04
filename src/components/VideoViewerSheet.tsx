import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

/** Same reasoning as `PhotoViewerSheet`'s `imageExtension` — the saved
 *  file's name has to match its real bytes, not assume every chat video
 *  is an mp4 (a device-recorded .mov is common on iOS). */
function videoExtension(uri: string): string {
  const match = uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();
  return ext && ['mp4', 'mov', 'm4v'].includes(ext) ? ext : 'mp4';
}

const QUICK_PICKS = QUICK_REACTIONS.slice(0, 2);

/**
 * Full-screen video viewer for a sent/received video message — same header/
 * toolbar shell as `PhotoViewerSheet` (sender + timestamp, quick reply, quick
 * react, download, forward), swapping the paged photo `FlatList` for a
 * single `VideoView` with real playback controls, since a video message is
 * always exactly one clip (see `PhotoPickerSheet`'s "a video sends the
 * moment it's tapped" note) rather than a pageable album.
 */
export function VideoViewerSheet({
  message,
  onClose,
  onForward,
}: {
  /** The video message being viewed — the sheet is closed when this is null. */
  message: Message | null;
  onClose: () => void;
  /** Opens the thread's own forward sheet — it already owns one. */
  onForward: (message: Message) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userFor } = useData();
  const { sendMessage, react } = useMessages();
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  const uri = message?.attachmentId;
  const sender = message ? userFor(message.senderId) : null;

  const player = useVideoPlayer(uri ?? null, (p) => {
    p.loop = false;
  });

  // Resets the draft whenever a *different* message is opened — same
  // during-render adjustment `PhotoViewerSheet` uses, so opening a new video
  // doesn't flash the previous one's typed-but-unsent reply for a frame.
  const [openedFor, setOpenedFor] = useState(message?.id);
  if (message?.id !== openedFor) {
    setOpenedFor(message?.id);
    setReply('');
  }

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
    if (saving || !uri) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showAlert(
          'Photo library access needed',
          "Plated can't save this video without permission — enable it in Settings and try again.",
        );
        return;
      }
      const target = `${FileSystem.cacheDirectory}${Date.now()}.${videoExtension(uri)}`;
      const { uri: localUri } = await FileSystem.downloadAsync(uri, target);
      await MediaLibrary.saveToLibraryAsync(localUri);
      success();
    } catch (e) {
      if (__DEV__) console.warn('[Plated] video save failed', e);
      showAlert('Couldn’t save that video', 'Please try again.');
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

            <View style={styles.pager}>
              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                nativeControls
                contentFit="contain"
              />
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
