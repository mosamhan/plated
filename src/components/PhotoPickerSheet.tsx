import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
// Both packages moved their main export to a new API in this SDK (a
// class-based `File`/`Directory` model for expo-file-system, a class-based
// `Asset`/`Query` model for expo-media-library); the classic Promise-based
// functions this component is built around (readAsStringAsync,
// getAssetsAsync/getAssetInfoAsync, plain Asset objects) still live under
// each package's `/legacy` subpath, without the new API's deprecation warning
// the main entry point emits for them.
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { showAlert } from '@/lib/dialog';
import { tapLight, tick } from '@/lib/haptics';
import { formatDuration } from '@/components/VoiceNote';
import { uploadAsset, uploadVideo } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const COLUMNS = 3;
const CELL_GAP = 3;
const PAGE_SIZE = 60;
/** `MediaLibrary.Asset` has no mimeType field — inferred from the filename
 *  extension for `uploadVideo`'s content-type header. Falls back to mp4,
 *  the common case, for anything unrecognized rather than guessing wrong. */
function videoMimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  return 'video/mp4';
}

/**
 * Plated's own multi-select photo grid — replaces `expo-image-picker`'s
 * native single-photo cropping UI for the messaging composer specifically
 * (other pickers in the app, like avatars, still use the native picker on
 * purpose). Reads the library directly via `expo-media-library` so it can
 * offer real multi-select with numbered badges; permission is requested the
 * first time this sheet opens, not at app launch.
 */
export function PhotoPickerSheet({
  visible,
  onClose,
  onSend,
  onSendVideo,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with the uploaded public URLs, in the order they were tapped. */
  onSend: (urls: string[]) => void;
  /**
   * A video sends the moment it's tapped — like the GIF picker, not folded
   * into the multi-select photo batch above, since one video is already its
   * own whole message (kind: 'video'), not a page in a photo album. Omit
   * this prop to keep a picker photo-only (e.g. Plate/Plato comments, which
   * never allow video) — video assets then simply won't send when tapped.
   */
  onSendVideo?: (url: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { width } = useWindowDimensions();
  const cellSize = (width - spacing.lg * 2 - (COLUMNS - 1) * CELL_GAP) / COLUMNS;

  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [after, setAfter] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); // asset ids, in tap order
  const [sending, setSending] = useState(false);
  const [sendingVideoId, setSendingVideoId] = useState<string | null>(null);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  // null = the whole library ("Recents", matching the native picker's default).
  const [selectedAlbum, setSelectedAlbum] = useState<MediaLibrary.Album | null>(null);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);

  // Video assets show at all only where the caller actually wants them —
  // comments never pass `onSendVideo`, so their grid stays photo-only exactly
  // as it always has, with no dead "can't tap this" cells.
  const mediaType = useMemo<MediaLibrary.MediaTypeValue | MediaLibrary.MediaTypeValue[]>(
    () => (onSendVideo ? ['photo', 'video'] : 'photo'),
    [onSendVideo],
  );

  const loadFirstPage = useCallback(
    async (album: MediaLibrary.Album | null) => {
      setReady(false);
      setSelected([]);
      const page = await MediaLibrary.getAssetsAsync({
        mediaType,
        sortBy: 'creationTime',
        first: PAGE_SIZE,
        ...(album ? { album } : {}),
      });
      setAssets(page.assets);
      setAfter(page.endCursor);
      setHasMore(page.hasNextPage);
      setReady(true);
    },
    [mediaType],
  );

  // `onClose` is a fresh closure from the parent on every one of its
  // renders (`onClose={() => setPhotoPickerOpen(false)}`) — read it through
  // a ref instead of putting it in the effect below's deps, otherwise any
  // parent re-render while this sheet is open (a new message arriving,
  // composer state changing, anything) would re-run the permission check +
  // asset fetch and flash the grid back to its loading state, which is what
  // was reading as constant flicker/refreshing.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Pull a fresh page from the gallery once, right when the sheet opens —
  // not on every render while it's open. `loadFirstPage` is a stable
  // (empty-deps) callback, so `visible` toggling true is the only thing
  // that re-triggers this.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setSelectedAlbum(null);
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        showAlert(
          'Photo library access needed',
          "Plated can't show your photos without permission — enable it in Settings and try again.",
        );
        onCloseRef.current();
        return;
      }
      const albumList = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
      if (cancelled) return;
      // An all-video smart album (Videos, Slo-mo, …) used to be a dead end
      // here — `mediaType: 'photo'` alone would show it empty. Now that video
      // is included whenever the caller allows it, every non-empty album is
      // worth listing; a photo-only caller (comments) just won't populate
      // those albums' grids, same as before.
      setAlbums(albumList.filter((a) => a.assetCount > 0));
      await loadFirstPage(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, loadFirstPage]);

  const selectAlbum = (album: MediaLibrary.Album | null) => {
    tick();
    setAlbumPickerOpen(false);
    if (album?.id === selectedAlbum?.id) return;
    setSelectedAlbum(album);
    loadFirstPage(album);
  };

  const loadMore = useCallback(async () => {
    if (!ready || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const page = await MediaLibrary.getAssetsAsync({
      mediaType,
      sortBy: 'creationTime',
      first: PAGE_SIZE,
      after,
      ...(selectedAlbum ? { album: selectedAlbum } : {}),
    });
    setAssets((prev) => [...prev, ...page.assets]);
    setAfter(page.endCursor);
    setHasMore(page.hasNextPage);
    setLoadingMore(false);
  }, [ready, loadingMore, hasMore, after, selectedAlbum, mediaType]);

  const toggle = (id: string) => {
    tapLight();
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const sendVideo = async (asset: MediaLibrary.Asset) => {
    if (!userId || sendingVideoId) return;
    setSendingVideoId(asset.id);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      const localUri = info.localUri ?? asset.uri;
      const url = await uploadVideo(
        userId,
        { uri: localUri, mimeType: videoMimeFromFilename(asset.filename) },
        'chat-media',
      );
      if (!url) {
        showAlert('Couldn’t send that video', 'Please try again.');
        return;
      }
      onSendVideo?.(url);
      onClose();
    } catch (e) {
      if (__DEV__) console.warn('[Plated] video read/upload failed', e);
      showAlert('Couldn’t send that video', 'Please try again.');
    } finally {
      setSendingVideoId(null);
    }
  };

  const send = async () => {
    if (!userId || selected.length === 0 || sending) return;
    setSending(true);
    const chosen = selected
      .map((id) => assets.find((a) => a.id === id))
      .filter((a): a is MediaLibrary.Asset => !!a);

    const urls: string[] = [];
    for (const asset of chosen) {
      try {
        // `asset.uri` (used for the grid's thumbnails) can be a bare
        // `ph://` id on iOS — reading it as base64 needs the resolved local
        // file uri instead, which `getAssetInfoAsync` provides.
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        const localUri = info.localUri ?? asset.uri;
        const base64 = await FileSystem.readAsStringAsync(localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const url = await uploadAsset('chat-media', userId, { base64, mimeType: 'image/jpeg' });
        if (url) urls.push(url);
      } catch (e) {
        if (__DEV__) console.warn('[Plated] photo read/upload failed', e);
      }
    }
    setSending(false);
    if (urls.length === 0) {
      showAlert('Couldn’t send those photos', 'Please try again.');
      return;
    }
    onSend(urls);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.cancel, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              tick();
              setAlbumPickerOpen((o) => !o);
            }}
            style={styles.albumTrigger}
            hitSlop={8}>
            <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]} numberOfLines={1}>
              {selectedAlbum?.title ?? 'Recents'}
            </Text>
            <Ionicons
              name={albumPickerOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.text}
            />
          </Pressable>
          <View style={{ width: 50 }} />
        </View>

        {albumPickerOpen && (
          <>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setAlbumPickerOpen(false)}
            />
            <View
              style={[
                styles.albumSheet,
                { top: insets.top + 54, backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <AlbumRow
                  label="Recents"
                  selected={!selectedAlbum}
                  onPress={() => selectAlbum(null)}
                />
                {albums.map((a) => (
                  <AlbumRow
                    key={a.id}
                    label={a.title}
                    count={a.assetCount}
                    selected={selectedAlbum?.id === a.id}
                    onPress={() => selectAlbum(a)}
                  />
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {!ready ? (
          <View style={styles.loadingFill}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(a) => a.id}
            numColumns={COLUMNS}
            onEndReached={loadMore}
            onEndReachedThreshold={0.6}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 110 }}
            columnWrapperStyle={{ gap: CELL_GAP }}
            ItemSeparatorComponent={() => <View style={{ height: CELL_GAP }} />}
            renderItem={({ item }) => {
              const order = selected.indexOf(item.id);
              const isSelected = order >= 0;
              const isVideo = item.mediaType === 'video';
              // A video is its own message the instant it's tapped — never
              // added to the multi-select batch, so it gets no number badge,
              // just the play glyph + length every gallery uses for this.
              return (
                <Pressable
                  onPress={() => (isVideo ? sendVideo(item) : toggle(item.id))}
                  disabled={isVideo && sendingVideoId === item.id}
                  style={{ width: cellSize, height: cellSize }}>
                  <Image
                    source={{ uri: item.uri }}
                    recyclingKey={item.id}
                    cachePolicy="memory-disk"
                    // No fade here (unlike every other Image in this app) —
                    // this grid is a real virtualized FlatList recycling
                    // view instances as you scroll, and a plain `ph://`
                    // asset uri with no cache/recyclingKey meant each
                    // recycled cell briefly re-decoded and faded in from
                    // blank, reading as the whole grid flickering rather
                    // than a smooth scroll.
                    transition={0}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                  {isVideo ? (
                    <>
                      <View style={styles.videoDuration}>
                        <Text style={styles.videoDurationText}>{formatDuration(item.duration * 1000)}</Text>
                      </View>
                      {sendingVideoId === item.id ? (
                        <View style={styles.videoPlayBadge}>
                          <ActivityIndicator size="small" color="#fff" />
                        </View>
                      ) : (
                        <View style={styles.videoPlayBadge}>
                          <Ionicons name="play" size={13} color="#fff" />
                        </View>
                      )}
                    </>
                  ) : (
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isSelected ? colors.accent : 'rgba(0,0,0,0.35)',
                          borderColor: '#fff',
                        },
                      ]}>
                      {isSelected && <Text style={styles.badgeText}>{order + 1}</Text>}
                    </View>
                  )}
                </Pressable>
              );
            }}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          />
        )}

        {selected.length > 0 && (
          <View style={[styles.sendBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background }]}>
            <Button label={`Send (${selected.length})`} size="lg" loading={sending} onPress={send} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function AlbumRow({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  /** Omitted for "Recents" — the whole-library count isn't cheap to compute. */
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.albumRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.albumRowLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {count != null && (
          <Text style={[styles.albumRowCount, { color: colors.textMuted }]}>{count.toLocaleString()}</Text>
        )}
      </View>
      {selected && <Ionicons name="checkmark" size={18} color={colors.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  cancel: { fontSize: 15, fontWeight: '600', width: 50 },
  albumTrigger: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '60%' },
  title: { fontSize: 17, fontWeight: '600' },
  albumSheet: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    zIndex: 10,
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  albumRowLabel: { fontSize: 15, fontWeight: '600' },
  albumRowCount: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  loadingFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: '100%', height: '100%', borderRadius: radius.sm },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  videoDuration: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  videoDurationText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  videoPlayBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sendBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
});
