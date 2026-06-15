import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics layer — single place that maps app events to feedback.
 * No-ops on web so call sites never need a Platform check.
 */

const native = Platform.OS === 'ios' || Platform.OS === 'android';

/** Light tick — likes, saves, small toggles. */
export function tapLight() {
  if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium thump — opening the order sheet, provider hand-off. */
export function tapMedium() {
  if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Selection tick — rating steps, theme switching, segmented controls. */
export function tick() {
  if (native) Haptics.selectionAsync().catch(() => {});
}

/** Success — posting a plate, following someone. */
export function success() {
  if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Warning — destructive confirms (block, delete account). */
export function warn() {
  if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
