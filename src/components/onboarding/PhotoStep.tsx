import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { showAlert } from '@/lib/dialog';
import { pickImage, uploadAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

import { onboardingStyles as styles } from './styles';

export function PhotoStep({
  avatar,
  onChangeAvatar,
  onFinish,
  busy,
  error,
}: {
  avatar: string;
  onChangeAvatar: (uri: string) => void;
  onFinish: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const [uploading, setUploading] = useState(false);

  const changePhoto = async () => {
    const asset = await pickImage({ square: true });
    if (!asset || !userId) return;
    setUploading(true);
    const url = await uploadAsset('avatars', userId, asset);
    setUploading(false);
    if (url) {
      onChangeAvatar(url);
    } else {
      showAlert('Upload failed', 'Could not upload that photo — please try again.');
    }
  };

  return (
    <>
      <Text style={[typography.title, { color: colors.text, marginBottom: 4 }]}>Add a profile photo</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>Optional — you can always add one later.</Text>
      <View style={{ alignItems: 'center', marginVertical: spacing.xl }}>
        <Pressable onPress={changePhoto}>
          <Avatar uri={avatar} size={120} ring />
          {uploading && (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </Pressable>
        <Text style={[styles.change, { color: colors.accent }]} onPress={changePhoto}>
          Choose photo
        </Text>
      </View>
      {error && <Text style={[styles.msg, { color: colors.ratingLow }]}>{error}</Text>}
      <Button label="Finish" size="lg" onPress={onFinish} loading={busy} />
    </>
  );
}
