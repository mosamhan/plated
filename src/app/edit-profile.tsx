import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityIndicator } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { showAlert } from '@/lib/dialog';
import { pickImage, uploadAsset } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function EditProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentUser, updateProfile } = useData();
  const { userId } = useAuth();

  const [name, setName] = useState(currentUser.name);
  const [bio, setBio] = useState(currentUser.bio);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [instagram, setInstagram] = useState(currentUser.socials.instagram ?? '');
  const [tiktok, setTiktok] = useState(currentUser.socials.tiktok ?? '');
  const [youtube, setYoutube] = useState(currentUser.socials.youtube ?? '');
  const [uploading, setUploading] = useState(false);

  const changePhoto = async () => {
    const asset = await pickImage({ square: true });
    if (!asset) return;
    if (!userId) {
      setAvatar(asset.uri);
      return;
    }
    setUploading(true);
    const url = await uploadAsset('avatars', userId, asset);
    setUploading(false);
    if (url) {
      setAvatar(url);
      updateProfile({ avatar: url });
    } else {
      showAlert('Upload failed', 'Could not upload that photo — please try again.');
    }
  };

  const onSave = () => {
    updateProfile({
      name: name.trim() || currentUser.name,
      bio: bio.trim(),
      avatar,
      socials: {
        instagram: instagram.trim() || undefined,
        tiktok: tiktok.trim() || undefined,
        youtube: youtube.trim() || undefined,
      },
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Edit profile" closeMode />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Pressable onPress={changePhoto}>
            <Avatar uri={avatar} size={96} ring />
            <View style={[styles.cam, { backgroundColor: colors.accent, borderColor: colors.background }]}>
              <Ionicons name="camera" size={16} color={colors.accentText} />
            </View>
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </Pressable>
          <Text style={[styles.change, { color: colors.accent }]}>Change photo</Text>
        </View>

        <TextField label="Name" value={name} onChangeText={setName} />
        <TextField
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          style={{ minHeight: 70, textAlignVertical: 'top' }}
        />

        <Text style={[styles.section, { color: colors.text }]}>Social links</Text>
        <TextField label="Instagram" prefix="@" value={instagram} onChangeText={setInstagram} autoCapitalize="none" placeholder="username" />
        <TextField label="TikTok" prefix="@" value={tiktok} onChangeText={setTiktok} autoCapitalize="none" placeholder="username" />
        <TextField label="YouTube" prefix="@" value={youtube} onChangeText={setYoutube} autoCapitalize="none" placeholder="channel" />

        <Button label="Save changes" size="lg" onPress={onSave} style={{ marginTop: spacing.md }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cam: {
    position: 'absolute',
    right: -2,
    bottom: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  change: { fontSize: 14, fontWeight: '700', marginTop: 12 },
  section: { fontSize: 16, fontWeight: '800', marginTop: spacing.md, marginBottom: spacing.md },
});
