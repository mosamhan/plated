import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
import { buildProfileShareMessage, profileLink } from '@/lib/invite';
import { success, tapLight } from '@/lib/haptics';
import { pickImage, uploadAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PHOTO_SIZE = 260;

interface Props {
  visible: boolean;
  onClose: () => void;
  uri: string;
  name: string;
  handle: string;
  /** Own profile gets "Add avatar" instead of a follow control. */
  isCurrent: boolean;
  following?: boolean;
  onToggleFollow?: () => void;
}

/**
 * Held-down preview of a profile picture — the photo blown up over a dimmed
 * backdrop, with the same three actions everywhere: no QR code, since nothing
 * in Plated scans a profile into a camera the way Instagram's does.
 */
export function AvatarViewerSheet({
  visible,
  onClose,
  uri,
  name,
  handle,
  isCurrent,
  following,
  onToggleFollow,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { updateProfile } = useData();
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);

  const editAvatar = async () => {
    tapLight();
    const asset = await pickImage({ square: true });
    if (!asset || !userId) return;
    setUploading(true);
    const url = await uploadAsset('avatars', userId, asset);
    setUploading(false);
    if (url) {
      updateProfile({ avatar: url });
    } else {
      showAlert('Upload failed', 'Could not upload that photo — please try again.');
    }
  };

  const share = () => {
    tapLight();
    Share.share({ message: buildProfileShareMessage({ name, handle }) }).catch(() => {});
  };

  const copyLink = async () => {
    tapLight();
    await Clipboard.setStringAsync(profileLink(handle));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.photoWrap}>
          <Image
            source={{ uri }}
            style={[styles.photo, { backgroundColor: colors.surface }]}
            contentFit="cover"
            transition={150}
          />
          {isCurrent && (
            <Pressable
              onPress={editAvatar}
              disabled={uploading}
              style={[styles.editBadge, { backgroundColor: colors.surface, borderColor: colors.background }]}>
              <Ionicons name="pencil" size={16} color={colors.text} />
            </Pressable>
          )}
          {uploading && (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>
          {isCurrent ? (
            <>
              <ActionButton icon="share-outline" label="Share" onPress={share} />
              <ActionButton
                icon={copied ? 'checkmark' : 'link-outline'}
                label={copied ? 'Copied' : 'Copy link'}
                onPress={copyLink}
              />
              <ActionButton icon="camera-outline" label="Add avatar" onPress={editAvatar} disabled={uploading} />
            </>
          ) : (
            <>
              <ActionButton
                icon={following ? 'checkmark' : 'person-add-outline'}
                label={following ? 'Following' : 'Follow'}
                accent={!following}
                onPress={() => {
                  following ? tapLight() : success();
                  onToggleFollow?.();
                }}
              />
              <ActionButton icon="share-outline" label="Share" onPress={share} />
              <ActionButton
                icon={copied ? 'checkmark' : 'link-outline'}
                label={copied ? 'Copied' : 'Copy link'}
                onPress={copyLink}
              />
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  accent,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      disabled={disabled}
      style={[styles.actionBtn, disabled && { opacity: 0.5 }]}>
      <View
        style={[
          styles.actionCircle,
          {
            backgroundColor: accent ? colors.accent : 'rgba(255,255,255,0.12)',
            borderColor: accent ? colors.accent : 'rgba(255,255,255,0.2)',
          },
        ]}>
        <Ionicons name={icon} size={22} color={accent ? colors.accentText : '#FFFFFF'} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoWrap: { width: PHOTO_SIZE, height: PHOTO_SIZE },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: PHOTO_SIZE / 2 },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  actionBtn: { alignItems: 'center', gap: 8, width: 76 },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
});
