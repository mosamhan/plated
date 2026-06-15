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

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { useData } from '@/store/DataContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function EditProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentUser, updateProfile } = useData();

  const [name, setName] = useState(currentUser.name);
  const [bio, setBio] = useState(currentUser.bio);
  const [instagram, setInstagram] = useState(currentUser.socials.instagram ?? '');
  const [tiktok, setTiktok] = useState(currentUser.socials.tiktok ?? '');
  const [youtube, setYoutube] = useState(currentUser.socials.youtube ?? '');

  const onSave = () => {
    updateProfile({
      name: name.trim() || currentUser.name,
      bio: bio.trim(),
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
          <Pressable>
            <Avatar uri={currentUser.avatar} size={96} ring />
            <View style={[styles.cam, { backgroundColor: colors.accent, borderColor: colors.background }]}>
              <Ionicons name="camera" size={16} color={colors.accentText} />
            </View>
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
  change: { fontSize: 14, fontWeight: '700', marginTop: 12 },
  section: { fontSize: 16, fontWeight: '800', marginTop: spacing.md, marginBottom: spacing.md },
});
