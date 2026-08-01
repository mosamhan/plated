import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RouteStep } from '@/lib/directions';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** Google's maneuver tokens → a glyph. Unknown or absent falls back to "carry on". */
const MANEUVER_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  'turn-left': 'arrow-back',
  'turn-right': 'arrow-forward',
  'turn-slight-left': 'return-up-back',
  'turn-slight-right': 'return-up-forward',
  'turn-sharp-left': 'arrow-undo',
  'turn-sharp-right': 'arrow-redo',
  'uturn-left': 'arrow-undo-circle',
  'uturn-right': 'arrow-redo-circle',
  'keep-left': 'return-up-back',
  'keep-right': 'return-up-forward',
  'roundabout-left': 'refresh-circle',
  'roundabout-right': 'refresh-circle',
  merge: 'git-merge',
  fork: 'git-branch',
  ramp: 'trending-up',
  'ramp-left': 'trending-up',
  'ramp-right': 'trending-up',
  straight: 'arrow-up',
  ferry: 'boat',
  'ferry-train': 'train',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  destination: string;
  distanceText: string;
  durationText: string;
  steps: RouteStep[];
  /** Hands off to a real maps app for actual driving. */
  onNavigate: () => void;
}

/**
 * The written directions for a route.
 *
 * Reading, not guidance: there's no live position tracking or voice here, and
 * deliberately so — turn-by-turn navigation built on the Directions API isn't
 * permitted by its terms (that needs Google's separate Navigation SDK). This
 * covers "how do I actually get there" while you're deciding, and the Navigate
 * button hands off for the drive itself.
 */
export function RouteStepsSheet({
  visible,
  onClose,
  destination,
  distanceText,
  durationText,
  steps,
  onNavigate,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabberWrap}>
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.title, { color: colors.text, fontFamily: displayFont }]}
                numberOfLines={1}>
                {destination}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {distanceText} · {durationText} drive · {steps.length}{' '}
                {steps.length === 1 ? 'step' : 'steps'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            {steps.map((step, i) => (
              <View
                key={`${i}-${step.instruction}`}
                style={[
                  styles.step,
                  i < steps.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <View style={[styles.stepIcon, { backgroundColor: colors.surface }]}>
                  <Ionicons
                    name={(step.maneuver && MANEUVER_ICON[step.maneuver]) || 'arrow-up'}
                    size={17}
                    color={colors.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.instruction, { color: colors.text }]}>{step.instruction}</Text>
                  {!!step.distanceText && (
                    <Text style={[styles.stepMeta, { color: colors.textMuted }]}>
                      {step.distanceText}
                      {step.durationText ? ` · ${step.durationText}` : ''}
                    </Text>
                  )}
                </View>
              </View>
            ))}

            {steps.length === 0 && (
              <Text style={[styles.meta, { color: colors.textMuted, paddingVertical: spacing.lg }]}>
                No written directions came back for this route.
              </Text>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
            <Pressable onPress={onNavigate} style={[styles.navBtn, { backgroundColor: colors.accent }]}>
              <Ionicons name="navigate" size={17} color={colors.accentText} />
              <Text style={[styles.navText, { color: colors.accentText }]}>Navigate in Maps</Text>
            </Pressable>
            <Text style={[styles.footNote, { color: colors.textMuted }]}>
              Live turn-by-turn happens in your maps app, where it can talk to you and keep the
              screen awake.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  grabberWrap: { alignItems: 'center', paddingTop: 10 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 21 },
  meta: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instruction: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  stepMeta: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: 10 },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.lg,
  },
  navText: { fontSize: 15, fontWeight: '800' },
  footNote: { fontSize: 12, fontWeight: '500', lineHeight: 17, textAlign: 'center' },
});
