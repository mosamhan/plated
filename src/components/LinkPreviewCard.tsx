import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LinkPreview } from '@/lib/linkPreview';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const WIDTH = 232;

/**
 * A pasted URL's Open Graph card — title/description/image scraped by the
 * `link-preview` Edge Function. Sits below the text bubble (not inside it,
 * unlike SharedItemCard's in-app attachments) since a link preview is
 * commentary on the message, not the message's own content.
 *
 * A `Pressable` of its own is fine here, unlike SharedItemCard — a plain
 * external link has no double-tap-to-react/long-press meaning of its own
 * beyond what the bubble around it already offers, so swallowing a single
 * tap to open the URL doesn't lose anything the surrounding bubble needed.
 */
export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const { colors } = useTheme();
  const domain = (() => {
    try {
      return new URL(preview.url).hostname.replace(/^www\./, '');
    } catch {
      return preview.url;
    }
  })();

  if (!preview.title && !preview.description && !preview.imageUrl) return null;

  return (
    <Pressable
      onPress={() => Linking.openURL(preview.url).catch(() => {})}
      style={({ pressed }) => [
        styles.card,
        { width: WIDTH, backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      {preview.imageUrl && (
        <Image source={{ uri: preview.imageUrl }} style={styles.image} contentFit="cover" transition={150} />
      )}
      <View style={styles.body}>
        {preview.title && (
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {preview.title}
          </Text>
        )}
        {preview.description && (
          <Text style={[styles.description, { color: colors.textMuted }]} numberOfLines={2}>
            {preview.description}
          </Text>
        )}
        <View style={styles.domainRow}>
          <Ionicons name="link-outline" size={11} color={colors.textMuted} />
          <Text style={[styles.domain, { color: colors.textMuted }]} numberOfLines={1}>
            {domain}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginTop: 4 },
  image: { width: '100%', aspectRatio: 1.9 },
  body: { padding: 9, gap: 2 },
  title: { fontSize: 13, fontWeight: '700' },
  description: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  domainRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  domain: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
});
