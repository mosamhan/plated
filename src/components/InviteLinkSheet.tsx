import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A shareable link — QR code, the raw link, copy/share/reset. Fetches (or
 * mints, if there isn't one yet) the link itself the moment it opens, the
 * same self-contained shape the other on-demand sheets in this app
 * (ChatBubbleColorSheet, SaveToSheet) already use.
 *
 * Two callers, one component: a group's invite link (`group-info/[id].tsx`,
 * owner-only, resettable — `getLink` wraps `getInviteCode` + `groupInviteLink`)
 * and a person's own referral link (the profile tab, static — `getLink`
 * just resolves `inviteLink()`). Kept as one sheet rather than two so the
 * two can't drift in how "here's a link and a QR code" looks — the profile
 * tab's button explicitly promises "the same screen."
 */
export function InviteLinkSheet({
  visible,
  onClose,
  getLink,
  allowReset = true,
  title = 'Invite link',
  subtitle = 'Anyone with this link or QR code can join the group.',
  shareMessage,
}: {
  visible: boolean;
  onClose: () => void;
  /** `(regenerate?) => Promise<full link|null>` — owner-gating (for a group link) happens server-side (0058). */
  getLink: (regenerate?: boolean) => Promise<string | null>;
  /** Off for a static personal link — there's nothing to invalidate/reissue. */
  allowReset?: boolean;
  title?: string;
  subtitle?: string;
  /** Defaults to a group-invite phrasing; the profile tab passes its own. */
  shareMessage?: (link: string) => string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getLink().then((l) => {
      if (!alive) return;
      setLink(l);
      setLoading(false);
    });
    return () => {
      alive = false;
      // Reset for the next time this sheet opens, rather than at the top
      // of the effect body — setState directly in an effect (not inside
      // the async callback above) is what the lint rule actually flags.
      setLoading(true);
    };
  }, [visible, getLink]);

  const onCopy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    tapLight();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const onShare = () => {
    if (!link) return;
    tapLight();
    const message = shareMessage ? shareMessage(link) : `Join my group on Plated: ${link}`;
    Share.share({ message }).catch(() => {});
  };

  const onReset = async () => {
    setResetting(true);
    const fresh = await getLink(true);
    setResetting(false);
    if (fresh) {
      setLink(fresh);
      showAlert('Link reset', 'The old invite link no longer works.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>

          <View style={styles.qrWrap}>
            {loading || !link ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <View style={styles.qrCard}>
                <QRCode value={link} size={180} />
              </View>
            )}
          </View>

          {link && (
            <Text
              style={[styles.linkText, { color: colors.textMuted, borderColor: colors.border }]}
              numberOfLines={1}>
              {link}
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={onCopy}
              disabled={!link}
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={17} color={colors.accent} />
              <Text style={[styles.actionText, { color: colors.text }]}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
            <Pressable onPress={onShare} disabled={!link} style={[styles.actionBtn, { backgroundColor: colors.accent }]}>
              <Ionicons name="share-outline" size={17} color={colors.accentText} />
              <Text style={[styles.actionText, { color: colors.accentText }]}>Share</Text>
            </Pressable>
          </View>

          {allowReset && (
            <Pressable onPress={onReset} disabled={resetting} style={styles.resetRow} hitSlop={8}>
              <Text style={[styles.resetText, { color: colors.ratingLow }]}>
                {resetting ? 'Resetting…' : 'Reset link'}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    alignItems: 'center',
  },
  grabber: { width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 4, marginBottom: 18 },
  qrWrap: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  qrCard: { padding: 16, borderRadius: radius.lg, backgroundColor: '#fff' },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 14, fontWeight: '800' },
  resetRow: { marginTop: 18, paddingVertical: 6 },
  resetText: { fontSize: 13, fontWeight: '700' },
});
