import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { tapLight } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeContext';

const BARS = 26;

/** "0:07" — a voice note's length or position. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A voice note bubble: play/pause, a waveform, and the length.
 *
 * The waveform is generated from the message id rather than decoded from the
 * audio — real amplitude analysis needs the whole file downloaded and processed
 * before anything can render. A stable pseudo-random shape per message reads as
 * "a voice note" instantly and never changes between renders, which is all the
 * bars are actually communicating.
 */
export function VoiceNote({
  uri,
  durationMs,
  seed,
  onAccent,
}: {
  uri: string;
  durationMs?: number;
  /** Stable input for the waveform shape — the message id. */
  seed: string;
  onAccent?: boolean;
}) {
  const { colors } = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const trackWidth = useSharedValue(0);
  // Non-null only while a finger is actually on the waveform — overrides the
  // player's own reported position so the bars/timer track the touch
  // immediately instead of lagging behind the next status update.
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);

  const tint = onAccent ? colors.accentText : colors.text;
  const dim = onAccent ? 'rgba(255,255,255,0.4)' : colors.border;

  const heights = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const bars: number[] = [];
    for (let i = 0; i < BARS; i++) {
      h = (h * 1103515245 + 12345 + i * 7919) | 0;
      bars.push(6 + (Math.abs(h) % 16));
    }
    return bars;
  }, [seed]);

  const total = status.duration ? status.duration * 1000 : (durationMs ?? 0);
  const playedProgress = total > 0 ? Math.min(1, (status.currentTime * 1000) / total) : 0;
  const progress = scrubProgress ?? playedProgress;
  const position = scrubProgress != null ? scrubProgress * total : status.currentTime * 1000;
  const playing = status.playing;

  const toggle = () => {
    tapLight();
    if (playing) {
      player.pause();
      return;
    }
    // Replay from the top once it's finished, rather than sitting at the end
    // doing nothing when you tap play again.
    if (total > 0 && position >= total - 250) player.seekTo(0);
    player.play();
  };

  const scrubTo = (fraction: number) => {
    setScrubProgress(fraction);
    if (total > 0) player.seekTo((fraction * total) / 1000);
  };
  const endScrub = () => setScrubProgress(null);

  // Tap-to-seek and drag-to-scrub share one gesture: onBegin fires
  // immediately at touch-down (a plain tap never gets past this), and
  // onUpdate keeps seeking as the finger moves. activeOffsetX/failOffsetY
  // let a vertical swipe starting on the waveform fall through to the
  // message list's own scroll instead of being captured here.
  const seek = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onBegin((e) => {
      const w = trackWidth.value;
      if (w > 0) runOnJS(scrubTo)(Math.min(1, Math.max(0, e.x / w)));
    })
    .onUpdate((e) => {
      const w = trackWidth.value;
      if (w > 0) runOnJS(scrubTo)(Math.min(1, Math.max(0, e.x / w)));
    })
    .onFinalize(() => {
      runOnJS(endScrub)();
    });

  return (
    <View style={styles.wrap}>
      <Pressable onPress={toggle} hitSlop={6} style={[styles.play, { borderColor: dim }]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={17} color={tint} style={!playing && { marginLeft: 2 }} />
      </Pressable>

      <GestureDetector gesture={seek}>
        <View
          style={styles.wave}
          onLayout={(e) => {
            trackWidth.value = e.nativeEvent.layout.width;
          }}>
          {heights.map((h, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                { height: h, backgroundColor: i / BARS <= progress ? tint : dim },
              ]}
            />
          ))}
        </View>
      </GestureDetector>

      <Text style={[styles.time, { color: onAccent ? 'rgba(255,255,255,0.85)' : colors.textMuted }]}>
        {formatDuration(playing || position > 0 ? total - position : total)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  play: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  bar: { flex: 1, borderRadius: 1.5, minWidth: 2 },
  time: { fontSize: 12, fontWeight: '700', minWidth: 32, textAlign: 'right' },
});
