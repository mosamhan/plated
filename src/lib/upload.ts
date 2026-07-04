import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export type Bucket = 'plates' | 'avatars';

/**
 * Launch the camera or photo library and return the picked asset (with base64).
 * Returns null if the user cancels or permission is denied.
 */
export async function pickImage(opts: { camera?: boolean; square?: boolean } = {}): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = opts.camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const common: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: opts.square ? [1, 1] : [4, 5],
    quality: 0.7,
    base64: true,
  };
  const result = opts.camera
    ? await ImagePicker.launchCameraAsync(common)
    : await ImagePicker.launchImageLibraryAsync(common);

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

/**
 * Upload a picked asset to a public Storage bucket under the user's folder.
 * Returns the public URL, or null on failure.
 */
export async function uploadAsset(bucket: Bucket, userId: string, asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  if (!asset.base64) return null;
  const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, decode(asset.base64), {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: false,
  });
  if (error) {
    if (__DEV__) console.warn('[Plated] upload failed', error);
    return null;
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
