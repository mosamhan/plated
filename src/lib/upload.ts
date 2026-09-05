import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

import { showAlert } from '@/lib/dialog';
import { supabase } from '@/lib/supabase';

export type Bucket = 'plates' | 'avatars' | 'platos' | 'stories' | 'voice' | 'chat-media';
/** Buckets that are NOT public-read — see 0034_restaurant_verification_docs.sql. */
export type PrivateBucket = 'restaurant-verification';

function alertPermissionDenied(camera: boolean) {
  showAlert(
    camera ? 'Camera access needed' : 'Photo library access needed',
    `Plated can't ${camera ? 'take a photo or video' : 'pick a photo or video'} without permission — enable it in Settings and try again.`,
  );
}

/**
 * Launch the camera or photo library and return the picked asset (with base64).
 * Returns null if the user cancels or permission is denied — permission
 * denial also surfaces an alert, since silently returning null there is
 * indistinguishable from a cancel and leaves the user tapping a dead button.
 */
export async function pickImage(opts: { camera?: boolean; square?: boolean } = {}): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = opts.camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    alertPermissionDenied(!!opts.camera);
    return null;
  }

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
 * Pick several photos at once for a multi-plate post (up to `limit`, default
 * 20). Uses the OS picker's own multi-selection — no custom grid — and returns
 * the picked assets in selection order. Empty array on cancel or denial (with
 * the same permission alert as pickImage).
 */
export async function pickImages(limit = 20): Promise<ImagePicker.ImagePickerAsset[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    alertPermissionDenied(false);
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.slice(0, limit);
}

/**
 * Record or pick a short vertical video for a Plato. Caps duration so uploads
 * stay reasonable. Returns null if the user cancels or permission is denied —
 * permission denial also surfaces an alert (see pickImage above).
 */
export async function pickVideo(opts: { camera?: boolean; maxSeconds?: number } = {}): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = opts.camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    alertPermissionDenied(!!opts.camera);
    return null;
  }

  const common: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    quality: 0.8,
    videoMaxDuration: opts.maxSeconds ?? 60,
  };
  const result = opts.camera
    ? await ImagePicker.launchCameraAsync(common)
    : await ImagePicker.launchImageLibraryAsync(common);

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

/**
 * Upload a picked video to a public bucket under the user's folder (`platos`
 * by default; story clips go to `stories`, which has its own 24h-content
 * lifecycle; chat videos go to `chat-media`). Streams the file via fetch →
 * ArrayBuffer (videos are too large for base64). Returns the public URL, or
 * null on failure (caller can fall back to the local uri).
 *
 * Takes a minimal `{ uri, mimeType }` shape rather than the full
 * `ImagePicker.ImagePickerAsset` type — both that and `MediaLibrary.Asset`
 * (the in-chat gallery picker's own asset type, which has no `mimeType`
 * field at all) satisfy it structurally, so callers from either picker can
 * share this one function.
 */
export async function uploadVideo(
  userId: string,
  asset: { uri: string; mimeType?: string },
  bucket: Bucket = 'platos',
): Promise<string | null> {
  try {
    const mime = asset.mimeType ?? 'video/mp4';
    const ext = (mime.split('/')[1] ?? 'mp4').split(';')[0];
    const path = `${userId}/${Date.now()}.${ext}`;
    const body = await fetch(asset.uri).then((r) => r.arrayBuffer());
    const { error } = await supabase.storage.from(bucket).upload(path, body, {
      contentType: mime,
      upsert: false,
    });
    if (error) {
      if (__DEV__) console.warn('[Plated] video upload failed', error);
      return null;
    }
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    if (__DEV__) console.warn('[Plated] video upload threw', e);
    return null;
  }
}

/**
 * Upload a recorded voice note to the public `voice` bucket. Takes a local file
 * uri (from expo-audio) rather than an ImagePicker asset, so it can't reuse
 * uploadVideo's signature. Returns the public URL, or null on failure — the
 * caller falls back to the local uri so the note still plays on this device.
 */
export async function uploadVoiceNote(userId: string, uri: string): Promise<string | null> {
  try {
    const ext = (uri.split('.').pop() ?? 'm4a').split('?')[0];
    const path = `${userId}/${Date.now()}.${ext}`;
    const body = await fetch(uri).then((r) => r.arrayBuffer());
    const { error } = await supabase.storage.from('voice').upload(path, body, {
      contentType: ext === 'caf' ? 'audio/x-caf' : 'audio/m4a',
      upsert: false,
    });
    if (error) {
      if (__DEV__) console.warn('[Plated] voice upload failed', error);
      return null;
    }
    return supabase.storage.from('voice').getPublicUrl(path).data.publicUrl;
  } catch (e) {
    if (__DEV__) console.warn('[Plated] voice upload threw', e);
    return null;
  }
}

/** The only fields uploadAsset actually reads off a picked asset. */
export type UploadableAsset = { base64?: string | null; mimeType?: string | null };

/**
 * Upload a picked asset to a public Storage bucket under the user's folder.
 * Returns the public URL, or null on failure. Takes the narrower
 * `UploadableAsset` shape (not the full `ImagePicker.ImagePickerAsset`) so
 * callers building an asset from `expo-media-library` + `expo-file-system`
 * (which don't hand back an `ImagePickerAsset`) can call this unchanged.
 */
export async function uploadAsset(bucket: Bucket, userId: string, asset: UploadableAsset): Promise<string | null> {
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

/**
 * Upload to a *private* bucket (no public-read policy — see the bucket's own
 * migration for why). Returns the raw storage path, not a URL: calling
 * `getPublicUrl` on a private bucket returns a URL that will 403, so there's
 * nothing useful to hand back except the path a signed URL can later be
 * generated from (by whoever reviews it — the admin, via service_role).
 */
export async function uploadPrivateAsset(
  bucket: PrivateBucket,
  userId: string,
  asset: ImagePicker.ImagePickerAsset,
): Promise<string | null> {
  if (!asset.base64) return null;
  const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, decode(asset.base64), {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: false,
  });
  if (error) {
    if (__DEV__) console.warn('[Plated] private upload failed', error);
    return null;
  }
  return path;
}
