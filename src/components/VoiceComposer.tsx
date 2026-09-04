import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { formatDuration } from '@/components/VoiceNote';
import { showAlert } from '@/lib/dialog';
import { success, tapLight, tapMedium, warn } from '@/lib/haptics';
import { uploadVoiceNote } from '@/lib/upload';
import { useAuth } from '@/store/AuthContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** Anything shorter than this is a fumbled tap, not a message. */
const MIN_MS = 700;
/** Voice notes are asides, not podcasts — also keeps upload size in check. */
const MAX_MS = 60_000;
/** How many segments the locked-recording progress bar renders. */
const WAVEFORM_DOTS = 14;
/** Drag the mic this far left to cancel — the WhatsApp/Instagram gesture. */
const CANCEL_THRESHOLD = -90;
/** Drag the mic this far up to lock hands-free recording. */
const LOCK_THRESHOLD = -70;
/** How far the "drag to cancel" hint text nudges — a cue, not a tracked drag. */
const HINT_NUDGE_PX = 10;

type Phase = 'idle' | 'recording' | 'locked';

/**
 * Hold-to-record voice notes, with the standard slide-to-cancel and
 * lock-to-record gestures — what was actually missing before (the sent
 * bubble, VoiceNote.tsx, was already fine): dragging left cancels without
 * sending, dragging up locks the recording so it keeps going after you let
 * go, switching to an explicit Send/Trash bar since it's no longer a hold.
 */
export function VoiceComposer({
  onRecorded,
  onActiveChange,
  disabled,
}: {
  /** Called with the uploaded (or local, in demo mode) uri and its length. */
  onRecorded: (uri: string, durationMs: number) => void;
  /**
   * Fires whenever recording starts/stops (phase leaves/returns to 'idle') —
   * the composer uses this to hide the attach/photo buttons and text input
   * while recording, so this component gets the whole bar to work with
   * instead of being squeezed into the leftover sliver next to them.
   */
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>('idle');
  // Mirrors `overCancel` in plain React state — the icon's own glyph color
  // can't be driven by a worklet-only shared value the way the background
  // fill can, so it needs a real re-render to flip white once the fill
  // finishes (a red glyph on the now-solid red background would vanish).
  const [pastCancel, setPastCancel] = useState(false);
  // Same mirroring, for the lock bubble's glyph once dragging up crosses
  // into "this will lock on release."
  const [pastLock, setPastLock] = useState(false);
  const busy = useRef(false);
  const cancelled = useRef(false);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When this press began — read on release to tell a tap from a hold. */
  const pressStartedAt = useRef(0);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // Mirrors `phase === 'locked'`, but readable synchronously from the UI
  // thread — the gesture worklet decides whether a release should still be
  // interpreted as a cancel/send before React's own state has caught up.
  const locked = useSharedValue(false);
  // Whether the drag has already crossed into "this will cancel" territory —
  // gates the haptic to fire once on the crossing, not on every frame spent
  // past it, and resets if the drag comes back out so re-crossing fires again.
  const overCancel = useSharedValue(false);

  useEffect(() => () => {
    if (capTimer.current) clearTimeout(capTimer.current);
  }, []);

  const resetDrag = () => {
    dragX.value = withTiming(0, { duration: 150 });
    dragY.value = withTiming(0, { duration: 150 });
    overCancel.value = false;
    setPastCancel(false);
    setPastLock(false);
  };

  // start/handleRelease read Date.now() to time a press, but — same as the
  // refs they close over — only ever run once a gesture callback actually
  // fires at touch time via runOnJS, never during render. The purity rule
  // can't see that deferral and flags the impure call as if render read it.
  /* eslint-disable react-hooks/purity */
  const start = async () => {
    if (disabled || busy.current || state.isRecording) return;
    busy.current = true;
    pressStartedAt.current = Date.now();

    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      showAlert(
        'Microphone access needed',
        'Plated can’t record a voice message without permission — enable it in Settings and try again.',
      );
      busy.current = false;
      return;
    }
    // Recording on iOS is silent unless the session is explicitly told it's
    // allowed; without this the file comes back empty.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

    cancelled.current = false;
    tapMedium();
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase('recording');
    // Fired here, not from a useEffect watching `phase` — that ran a beat
    // after this render committed, so the parent hid the attach/photo/text
    // input a whole frame late: the recording bar had already painted
    // squeezed into the leftover sliver next to them, then jumped to full
    // width once they finally vanished. Calling it in the same tick as the
    // phase flip lets both updates land in one render instead of two.
    onActiveChange?.(true);
    busy.current = false;

    // Stop ourselves at the cap rather than letting a pocket-hold (or a
    // locked recording nobody comes back to) run forever.
    capTimer.current = setTimeout(() => finish(), MAX_MS);
  };

  const finish = async () => {
    if (capTimer.current) clearTimeout(capTimer.current);
    if (!recorder.isRecording) return;

    const durationMs = state.durationMillis ?? 0;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    setPhase('idle');
    onActiveChange?.(false);
    locked.value = false;
    resetDrag();

    if (cancelled.current || !uri) return;
    if (durationMs < MIN_MS) {
      // Too short to be intentional — say so rather than sending a blip.
      warn();
      showAlert('Hold to record', 'Press and hold the mic to record a voice message.');
      return;
    }

    let finalUri = uri;
    if (userId) {
      const uploaded = await uploadVoiceNote(userId, uri);
      if (uploaded) finalUri = uploaded;
    }
    success();
    onRecorded(finalUri, durationMs);
  };

  const cancel = async () => {
    cancelled.current = true;
    if (capTimer.current) clearTimeout(capTimer.current);
    if (recorder.isRecording) {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    }
    setPhase('idle');
    onActiveChange?.(false);
    locked.value = false;
    resetDrag();
    tapLight();
  };

  const onLock = () => {
    tapMedium();
    setPhase('locked');
  };

  /**
   * Release without cancelling or already being locked. Compared against
   * MIN_MS (not a separate, smaller "tap" threshold) — a shorter, second
   * threshold left a dead zone between the two: a release just past a small
   * tap window but still under MIN_MS used to fall through to `finish()`,
   * which then rejected it as "too short" with an error popup instead of
   * doing anything useful. One threshold means every release is either long
   * enough to send outright, or short enough to keep going hands-free —
   * never a surprise rejection.
   */
  const handleRelease = () => {
    if (locked.value) return; // Already locked via drag-up during the hold.
    if (Date.now() - pressStartedAt.current < MIN_MS) {
      locked.value = true;
      onLock();
    } else {
      finish();
    }
  };
  /* eslint-enable react-hooks/purity */

  // start/cancel/finish close over refs (busy, cancelled, capTimer), but only
  // ever *read* them once a gesture callback actually fires at touch time —
  // runOnJS just schedules that call on the JS thread, same as this codebase's
  // existing Gesture.Pan usage in useMediaZoom.ts. The "refs" lint rule can't
  // see that deferral and flags the gesture-chain construction itself (which
  // does run on every render) as if it read the ref right then.
  /* eslint-disable react-hooks/refs */
  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(start)();
    })
    .onUpdate((e) => {
      if (locked.value) return;
      dragX.value = Math.min(0, e.translationX);
      dragY.value = Math.min(0, e.translationY);
      // One haptic exactly on the crossing (in either direction), not a
      // buzz on every frame spent past the threshold.
      if (dragX.value <= CANCEL_THRESHOLD && !overCancel.value) {
        overCancel.value = true;
        runOnJS(warn)();
        runOnJS(setPastCancel)(true);
      } else if (dragX.value > CANCEL_THRESHOLD && overCancel.value) {
        overCancel.value = false;
        runOnJS(setPastCancel)(false);
      }
      if (dragY.value <= LOCK_THRESHOLD) {
        locked.value = true;
        runOnJS(setPastLock)(true);
        runOnJS(onLock)();
      }
    })
    .onFinalize(() => {
      if (locked.value) return; // Locked: keeps recording, Send/Trash take over.
      if (dragX.value <= CANCEL_THRESHOLD) {
        runOnJS(cancel)();
      } else {
        runOnJS(handleRelease)();
      }
    });
  /* eslint-enable react-hooks/refs */

  const hintStyle = useAnimatedStyle(() => {
    // The hint nudges a few px, not the actual drag distance — it's a cue
    // that something is happening, not a second thing to physically track
    // alongside the trash icon while you're already watching your thumb.
    const progress = Math.min(1, Math.abs(dragX.value) / Math.abs(CANCEL_THRESHOLD));
    return {
      transform: [{ translateX: -progress * HINT_NUDGE_PX }],
      // Fades out as you drag toward the cancel threshold — the further left,
      // the closer the drag is to actually letting go.
      opacity: 1 - progress * 0.7,
    };
  });
  const lockStyle = useAnimatedStyle(() => {
    // Same idea as the trash icon below: fills in solid the closer the drag
    // gets to actually locking, so the moment it does is something you saw
    // coming rather than a sudden flip. Visibility itself ramps in fast
    // (the first ~12px of the drag) and then stays fully opaque — tying
    // opacity to the full lock progress the way this used to left the
    // bubble nearly invisible for almost the whole drag, unlike the trash
    // button below, which is always fully visible and only ever animates
    // its fill and size.
    const progress = Math.min(1, Math.abs(dragY.value) / Math.abs(LOCK_THRESHOLD));
    const appear = Math.min(1, Math.abs(dragY.value) / 12);
    return {
      transform: [{ translateY: dragY.value * 0.6 }, { scale: 1 + progress * 0.3 }],
      opacity: appear,
      backgroundColor: interpolateColor(progress, [0, 1], [colors.surface, colors.accent]),
      borderColor: interpolateColor(progress, [0, 1], [colors.border, colors.accent]),
    };
  });
  const trashStyle = useAnimatedStyle(() => {
    // Grows and fills solid the moment a drag has gone far enough to
    // actually cancel on release — the same signal the haptic gives, in a
    // form you can see while your thumb is covering the mic.
    const progress = Math.min(1, Math.abs(dragX.value) / Math.abs(CANCEL_THRESHOLD));
    return {
      transform: [{ scale: 1 + progress * 0.3 }],
      backgroundColor: interpolateColor(progress, [0, 1], [colors.surface, colors.ratingLow]),
      borderColor: interpolateColor(progress, [0, 1], [colors.border, colors.ratingLow]),
    };
  });

  const elapsed = state.durationMillis ?? 0;
  const litDots = Math.min(WAVEFORM_DOTS, Math.round((elapsed / MAX_MS) * WAVEFORM_DOTS));
  // The waveform itself is identical whether or not the recording is locked
  // yet — a plain pulsing dot here (as this used to show pre-lock) read as a
  // visibly different, less-finished-looking bar than the one you land on
  // after locking. One shared look end to end; only the trailing hint text
  // (drag-to-cancel is still live pre-lock) is unique to that phase.
  const waveform = (
    <View style={styles.waveform}>
      {Array.from({ length: WAVEFORM_DOTS }).map((_, i) => (
        <View
          key={i}
          style={[styles.waveformDot, { backgroundColor: i < litDots ? colors.accent : colors.border }]}
        />
      ))}
    </View>
  );

  if (phase === 'locked') {
    return (
      <View style={styles.composerRow}>
        <Pressable onPress={cancel} hitSlop={8} style={[styles.trashBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="trash-outline" size={18} color={colors.ratingLow} />
        </Pressable>
        <View style={[styles.recording, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
          {waveform}
          <Text style={[styles.time, { color: colors.text }]}>{formatDuration(elapsed)}</Text>
        </View>
        <Pressable onPress={finish} hitSlop={8} style={[styles.sendLocked, { backgroundColor: colors.accent }]}>
          <Ionicons name="send" size={15} color={colors.accentText} />
        </Pressable>
      </View>
    );
  }

  // `idle` and `recording` share one GestureDetector-wrapped mic View — the
  // pan gesture starts on touch-down (phase flips to 'recording' inside
  // `onBegin`, before any drag happens), so that View must never unmount
  // mid-touch (it did, briefly, when this returned two separate JSX trees):
  // the recognizer's underlying native view would be torn down and never
  // deliver another onUpdate/onFinalize — no slide-to-cancel, no
  // lock-to-record, not even a release-to-send, just a stuck recording until
  // the MAX_MS safety cap kicks in. The trash icon and timer/hint bar are
  // deliberately siblings of the mic View, not children of it — a `Pressable`
  // nested inside the gesture-wrapped View would race the pan recognizer for
  // the same touch, so cancel-by-tap only works from outside it.
  return (
    <View style={phase === 'recording' ? styles.composerRow : undefined}>
      {phase === 'recording' && (
        <>
          <Pressable onPress={cancel} hitSlop={8}>
            <Animated.View style={[styles.trashBtn, trashStyle]}>
              <Ionicons name="trash-outline" size={18} color={pastCancel ? '#fff' : colors.ratingLow} />
            </Animated.View>
          </Pressable>
          <View
            style={[styles.recording, { flex: 1, backgroundColor: colors.surface, borderColor: colors.ratingLow }]}>
            {waveform}
            <Text style={[styles.time, { color: colors.text }]}>{formatDuration(elapsed)}</Text>
            <Animated.Text style={[styles.hint, hintStyle, { color: colors.textMuted }]} numberOfLines={1}>
              {'«'} Drag to cancel
            </Animated.Text>
          </View>
        </>
      )}
      <GestureDetector gesture={pan}>
        <View>
          {phase === 'recording' && (
            <Animated.View style={[styles.lockHint, lockStyle]}>
              <Ionicons name="lock-closed-outline" size={16} color={pastLock ? '#fff' : colors.textMuted} />
              <Ionicons name="chevron-up" size={12} color={pastLock ? '#fff' : colors.textMuted} />
            </Animated.View>
          )}
          <View style={[styles.mic, { opacity: disabled ? 0.5 : 1 }]}>
            <Ionicons name="mic-outline" size={19} color={colors.accent} />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // Bare — sits directly inside the composer's message pill, not its own
  // bubble, matching every other idle icon in that pill.
  mic: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  composerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  trashBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  lockHint: {
    position: 'absolute',
    right: -4,
    bottom: 44,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  recording: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // A real width, not a minWidth — the digits never exceed "1:00" over the
  // 60s cap, but a proportional font can still render that a few px
  // narrower than "0:04" would, and a minWidth lets the box itself shrink
  // to match, nudging the hint text over frame to frame. tabular-nums keeps
  // each digit the same width too, so nothing shifts within the box either.
  time: { fontSize: 14, fontWeight: '800', width: 40, fontVariant: ['tabular-nums'] },
  hint: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  waveform: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  waveformDot: { width: 3, height: 14, borderRadius: 1.5 },
  sendLocked: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
