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
/** Voice notes are asides, not podcasts. */
const MAX_MS = 120_000;
/** Drag the mic this far left to cancel — the WhatsApp/Instagram gesture. */
const CANCEL_THRESHOLD = -90;
/** Drag the mic this far up to lock hands-free recording. */
const LOCK_THRESHOLD = -70;

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
  disabled,
}: {
  /** Called with the uploaded (or local, in demo mode) uri and its length. */
  onRecorded: (uri: string, durationMs: number) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<Phase>('idle');
  const busy = useRef(false);
  const cancelled = useRef(false);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // Mirrors `phase === 'locked'`, but readable synchronously from the UI
  // thread — the gesture worklet decides whether a release should still be
  // interpreted as a cancel/send before React's own state has caught up.
  const locked = useSharedValue(false);

  useEffect(() => () => {
    if (capTimer.current) clearTimeout(capTimer.current);
  }, []);

  const resetDrag = () => {
    dragX.value = withTiming(0, { duration: 150 });
    dragY.value = withTiming(0, { duration: 150 });
  };

  const start = async () => {
    if (disabled || busy.current || state.isRecording) return;
    busy.current = true;

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
    locked.value = false;
    resetDrag();
    tapLight();
  };

  const onLock = () => {
    tapMedium();
    setPhase('locked');
  };

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
      if (dragY.value <= LOCK_THRESHOLD) {
        locked.value = true;
        runOnJS(onLock)();
      }
    })
    .onFinalize(() => {
      if (locked.value) return; // Locked: keeps recording, Send/Trash take over.
      if (dragX.value <= CANCEL_THRESHOLD) {
        runOnJS(cancel)();
      } else {
        runOnJS(finish)();
      }
    });
  /* eslint-enable react-hooks/refs */

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));
  const hintStyle = useAnimatedStyle(() => ({
    // Fades out as you drag toward the cancel threshold — the further left,
    // the closer the drag is to actually letting go.
    opacity: 1 - Math.min(1, Math.abs(dragX.value) / Math.abs(CANCEL_THRESHOLD)) * 0.7,
  }));
  const lockStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value * 0.6 }],
    opacity: Math.min(1, Math.abs(dragY.value) / Math.abs(LOCK_THRESHOLD)),
  }));

  if (phase === 'locked') {
    return (
      <View style={[styles.recording, { backgroundColor: colors.surface, borderColor: colors.ratingLow }]}>
        <View style={[styles.dot, { backgroundColor: colors.ratingLow }]} />
        <Text style={[styles.time, { color: colors.text }]}>{formatDuration(state.durationMillis ?? 0)}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={cancel} hitSlop={8} style={{ marginRight: 14 }}>
          <Ionicons name="trash-outline" size={20} color={colors.ratingLow} />
        </Pressable>
        <Pressable onPress={finish} hitSlop={8} style={[styles.sendLocked, { backgroundColor: colors.accent }]}>
          <Ionicons name="arrow-up" size={17} color={colors.accentText} />
        </Pressable>
      </View>
    );
  }

  // `idle` and `recording` share one GestureDetector-wrapped View — the pan
  // gesture starts on touch-down (phase flips to 'recording' inside
  // `onBegin`, before any drag happens), so if that view were unmounted at
  // the same moment (as it was when this returned two separate JSX trees),
  // the recognizer's underlying native view would be torn down mid-touch and
  // never deliver another onUpdate/onFinalize — no slide-to-cancel, no
  // lock-to-record, not even a release-to-send, just a stuck recording until
  // the MAX_MS safety cap kicks in.
  return (
    <GestureDetector gesture={pan}>
      <View style={phase === 'recording' ? styles.recordingWrap : undefined}>
        {phase === 'recording' && (
          <Animated.View
            style={[styles.lockHint, lockStyle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Ionicons name="chevron-up" size={12} color={colors.textMuted} />
          </Animated.View>
        )}
        <Animated.View
          style={
            phase === 'recording'
              ? [styles.recording, barStyle, { backgroundColor: colors.surface, borderColor: colors.ratingLow }]
              : [
                  styles.mic,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
                ]
          }>
          {phase === 'recording' ? (
            <>
              <View style={[styles.dot, { backgroundColor: colors.ratingLow }]} />
              <Text style={[styles.time, { color: colors.text }]}>{formatDuration(state.durationMillis ?? 0)}</Text>
              <Animated.Text style={[styles.hint, hintStyle, { color: colors.textMuted }]} numberOfLines={1}>
                ◁ Slide to cancel
              </Animated.Text>
            </>
          ) : (
            <Ionicons name="mic-outline" size={19} color={colors.accent} />
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  mic: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  recordingWrap: { flex: 1 },
  lockHint: {
    position: 'absolute',
    right: 4,
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
  dot: { width: 9, height: 9, borderRadius: 5 },
  time: { fontSize: 14, fontWeight: '800', minWidth: 38 },
  hint: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  sendLocked: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
