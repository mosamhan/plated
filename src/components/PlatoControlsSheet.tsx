import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedPill } from '@/components/discover/SegmentedPill';
import { SettingsRow, SettingsSection, SettingsToggle } from '@/components/SettingsKit';
import { usePlatoPlaybackSettings } from '@/lib/platoPlaybackSettings';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const SPEEDS = [
  { key: '0.5', label: '0.5x' },
  { key: '1', label: '1.0x' },
  { key: '1.5', label: '1.5x' },
  { key: '2', label: '2.0x' },
] as const;

/**
 * The long-press control menu on a Plato — TikTok's own long-press sheet,
 * trimmed to what this app actually supports. Deliberately missing (per
 * product scope, not an oversight): captions/translation, casting,
 * picture-in-picture, "why this post", and promote/duet/stitch — those stay
 * out until there's a real feature behind them.
 */
export function PlatoControlsSheet({
  visible,
  onClose,
  onAddToStory,
  onDownload,
  onExclude,
  onReport,
  onClearDisplay,
}: {
  visible: boolean;
  onClose: () => void;
  onAddToStory: () => void;
  onDownload: () => void;
  /** "Do not include in taste profile." */
  onExclude: () => void;
  onReport: () => void;
  onClearDisplay: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { speed, autoScroll, setSpeed, setAutoScroll } = usePlatoPlaybackSettings();

  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <SettingsSection>
            <SettingsRow icon="add-circle-outline" label="Add to story" onPress={() => act(onAddToStory)} />
            <SettingsRow icon="download-outline" label="Download" onPress={() => act(onDownload)} />
            <SettingsRow
              icon="heart-dislike-outline"
              label="Do not include in taste profile"
              onPress={() => act(onExclude)}
            />
            <SettingsRow icon="flag-outline" label="Report" destructive onPress={() => act(onReport)} last />
          </SettingsSection>

          <SettingsSection>
            <View
              style={[styles.speedRow, { borderBottomColor: colors.border }]}>
              <SegmentedPill
                value={String(speed)}
                onChange={(v) => setSpeed(Number(v))}
                options={[...SPEEDS]}
                minWidth={0}
                fontSize={13}
                compact
              />
            </View>
            <SettingsRow icon="scan-outline" label="Clear display" onPress={() => act(onClearDisplay)} />
            <SettingsToggle
              icon="play-skip-forward-outline"
              label="Auto scroll"
              value={autoScroll}
              onValueChange={setAutoScroll}
              last
            />
          </SettingsSection>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: 10, paddingHorizontal: spacing.lg },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  speedRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
