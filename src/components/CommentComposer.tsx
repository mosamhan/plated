import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { GifPickerModal } from '@/components/GifPickerSheet';
import { PhotoPickerSheet } from '@/components/PhotoPickerSheet';
import { tapLight } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The comment input shared by Plate and Plato comments — same bare-icon pill
 * language as the messaging composer redesign (`messages/[id].tsx`), reused
 * here rather than re-invented per screen since both converged on an
 * identical shape: a wide text pill, a photo icon that hides once there's a
 * draft, a sticker icon that never does. The one real difference is the
 * fourth control — comments have no voice notes, so where the messaging
 * composer's mic/send toggle lives, this has an always-present "@" mention
 * button instead (send is its own separate button here, since a comment can
 * carry text *and* an attachment together, unlike a message).
 *
 * Mentioning someone here is scoped to people *you* follow (see migration
 * 0069) — it's for showing a friend a post you like, not for addressing
 * another commenter (replying to a specific comment already covers that, on
 * threads that support it). Tapping the mention button inserts a literal
 * "@" the same way typing it would, so it's the same underlying
 * autocomplete either way.
 */
export interface CommentComposerHandle {
  /** Focuses the text field — used when starting a reply (Plato threading). */
  focus: () => void;
}

export const CommentComposer = forwardRef<CommentComposerHandle, {
  /** Called with the typed text and, if one was attached, a photo/sticker URL. */
  onSubmit: (text: string, imageUrl?: string) => void;
  /** True when commenting is turned off for this post. */
  disabled?: boolean;
  placeholder?: string;
}>(function CommentComposer({ onSubmit, disabled, placeholder = 'Add a comment…' }, ref) {
  const { colors } = useTheme();
  const { followingUsers } = useData();
  const [draft, setDraft] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const mentionQuery = draft.match(/(?:^|\s)@([a-zA-Z0-9_.]{0,30})$/)?.[1] ?? null;
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return followingUsers()
      .filter((u) => u.handle.toLowerCase().startsWith(q))
      .slice(0, 5);
  }, [mentionQuery, followingUsers]);

  const insertMention = (handle: string) => {
    tapLight();
    setDraft((d) => d.replace(/(?:^|\s)@([a-zA-Z0-9_.]{0,30})$/, (m) => `${m.startsWith(' ') ? ' ' : ''}@${handle} `));
  };

  const onMentionButton = () => {
    tapLight();
    setDraft((d) => (d.length === 0 || d.endsWith(' ') ? `${d}@` : `${d} @`));
    inputRef.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text && !pendingImage) return;
    onSubmit(text, pendingImage ?? undefined);
    setDraft('');
    setPendingImage(null);
    tapLight();
  };

  if (disabled) return null;

  return (
    <View>
      {pendingImage && (
        <View style={styles.previewRow}>
          <Image source={{ uri: pendingImage }} style={styles.previewThumb} contentFit="cover" />
          <Pressable onPress={() => setPendingImage(null)} hitSlop={8} style={styles.previewRemove}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      )}

      {mentionCandidates.length > 0 && (
        <View style={[styles.mentionList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {mentionCandidates.map((u) => (
            <Pressable key={u.id} onPress={() => insertMention(u.handle)} style={styles.mentionRow}>
              <Avatar uri={u.avatar} size={26} />
              <Text style={[styles.mentionName, { color: colors.text }]} numberOfLines={1}>
                {u.name}
              </Text>
              <Text style={[styles.mentionHandle, { color: colors.textMuted }]} numberOfLines={1}>
                @{u.handle}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.row}>
        <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={submit}
            returnKeyType="send"
            multiline
            style={[styles.pillInput, { color: colors.text }]}
          />
          {!draft.trim() && (
            <Pressable
              onPress={() => {
                tapLight();
                setPhotoPickerOpen(true);
              }}
              hitSlop={8}
              style={styles.pillIconBtn}>
              <Ionicons name="image-outline" size={19} color={colors.accent} />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              tapLight();
              setGifOpen(true);
            }}
            hitSlop={8}
            style={styles.pillIconBtn}>
            <Ionicons name="happy-outline" size={19} color={colors.accent} />
          </Pressable>
          <Pressable onPress={onMentionButton} hitSlop={8} style={styles.pillIconBtn}>
            <Ionicons name="at-outline" size={19} color={colors.accent} />
          </Pressable>
        </View>
        <Pressable
          onPress={submit}
          disabled={!draft.trim() && !pendingImage}
          hitSlop={6}
          style={[
            styles.send,
            { backgroundColor: draft.trim() || pendingImage ? colors.accent : colors.border },
          ]}>
          <Ionicons
            name="arrow-up"
            size={18}
            color={draft.trim() || pendingImage ? colors.accentText : colors.textMuted}
          />
        </Pressable>
      </View>

      <GifPickerModal
        visible={gifOpen}
        onClose={() => setGifOpen(false)}
        onPick={(url) => {
          setPendingImage(url);
          setGifOpen(false);
        }}
      />

      <PhotoPickerSheet
        visible={photoPickerOpen}
        onClose={() => setPhotoPickerOpen(false)}
        singleSelect
        onSend={(urls) => {
          if (urls[0]) setPendingImage(urls[0]);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  previewRow: { flexDirection: 'row', marginBottom: 8 },
  previewThumb: { width: 64, height: 64, borderRadius: radius.md },
  previewRemove: { position: 'absolute', top: -6, left: 56 },
  mentionList: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    overflow: 'hidden',
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mentionName: { fontSize: 13, fontWeight: '700' },
  mentionHandle: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    maxHeight: 120,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 6,
    gap: 2,
  },
  pillInput: { flex: 1, minHeight: 40, maxHeight: 120, paddingVertical: 10, fontSize: 14, fontWeight: '500' },
  pillIconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
