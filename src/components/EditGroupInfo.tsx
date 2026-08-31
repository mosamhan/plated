import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GroupAvatar } from '@/components/GroupAvatar';
import { showAlert } from '@/lib/dialog';
import { pickImage, uploadAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Rename a group and/or change its photo — the group settings screen's
 * "Edit group info" link. Cloned from NameInputModal's shell, extended with
 * a photo control since groups can now have their own picture (0049).
 */
export function EditGroupInfo({
  visible,
  initialName,
  initialAvatarUrl,
  memberAvatars,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialName: string;
  initialAvatarUrl?: string;
  memberAvatars: string[];
  onSave: (name: string, avatarUrl?: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setAvatarUrl(initialAvatarUrl);
    }
  }, [visible, initialName, initialAvatarUrl]);

  const changePhoto = async () => {
    if (!userId) return;
    const asset = await pickImage({ square: true });
    if (!asset) return;
    setUploading(true);
    const url = await uploadAsset('chat-media', userId, asset);
    setUploading(false);
    if (url) setAvatarUrl(url);
    else showAlert('Upload failed', 'Could not upload that photo — please try again.');
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, avatarUrl);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>Edit group info</Text>

            <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
              <Pressable onPress={changePhoto}>
                <GroupAvatar avatarUrl={avatarUrl} memberAvatars={memberAvatars} size={84} />
                {uploading && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </Pressable>
              <Text style={[styles.change, { color: colors.accent }]} onPress={changePhoto}>
                Change photo
              </Text>
            </View>

            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="Group name"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={submit}
              returnKeyType="done"
              maxLength={60}
              style={[
                styles.input,
                { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
              ]}
            />
            <Button label="Save" size="lg" style={{ marginTop: 16 }} disabled={!name.trim()} onPress={submit} />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 14, textAlign: 'center' },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  change: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
  },
});
