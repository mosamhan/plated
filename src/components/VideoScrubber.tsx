import type { VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

/**
 * TikTok-style seek bar pinned to the bottom of a reel.
 *
 * Idle: a thin line that fills as the video plays. Press and hold: it thickens
 * into a draggable scrubber with a knob and a current / total time readout;
 * dragging seeks the video. Reads/sets the expo-video player directly.
 *
 * Progress is polled (250ms) rather than event-driven so it works regardless of
 * how the player was configured; while dragging, the finger drives the fill and
 * polling is ignored so the bar doesn't fight the touch.
 */
function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoScrubber({
  player,
  bottom,
  onScrubbingChange,
}: {
  player: VideoPlayer;
  bottom: number;
  /** Fires true on grab, false on release — lets the reel clear its overlay
   *  chrome (caption, title, rail) while the user is scrubbing. */
  onScrubbingChange?: (scrubbing: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1, playback
  const [dragging, setDragging] = useState(false);
  const [dragFrac, setDragFrac] = useState(0); // 0..1, finger
  const [duration, setDuration] = useState(0);
  const widthRef = useRef(0);
  const draggingRef = useRef(false);

  // Poll playback position. Cheap, and paused implicitly while dragging.
  useEffect(() => {
    const id = setInterval(() => {
      if (draggingRef.current) return;
      const dur = player.duration || 0;
      setDuration(dur);
      if (dur > 0) setProgress(Math.min(1, Math.max(0, player.currentTime / dur)));
    }, 250);
    return () => clearInterval(id);
  }, [player]);

  const fracFromX = (x: number) => (widthRef.current > 0 ? Math.min(1, Math.max(0, x / widthRef.current)) : 0);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        draggingRef.current = true;
        setDragging(true);
        onScrubbingChange?.(true);
        setDragFrac(fracFromX(e.nativeEvent.locationX));
      },
      onPanResponderMove: (e) => setDragFrac(fracFromX(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        const frac = fracFromX(e.nativeEvent.locationX);
        const dur = player.duration || 0;
        // Seek by setting the player's time — expo-video treats an assignment
        // to currentTime as a seek.
        if (dur > 0) player.currentTime = frac * dur;
        setProgress(frac);
        draggingRef.current = false;
        setDragging(false);
        onScrubbingChange?.(false);
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        setDragging(false);
        onScrubbingChange?.(false);
      },
    }),
  ).current;

  const shown = dragging ? dragFrac : progress;
  const fillW = width * shown;

  return (
    // A tall transparent hit area so the thin line is easy to grab; the visible
    // bar sits at its bottom. pointerEvents auto so it captures the drag.
    <View
      style={[styles.hit, { bottom }]}
      onLayout={(ev) => {
        widthRef.current = ev.nativeEvent.layout.width;
        setWidth(ev.nativeEvent.layout.width);
      }}
      {...responder.panHandlers}>
      {dragging && (
        <View style={styles.timeRow} pointerEvents="none">
          <Text style={styles.time}>
            <Text style={styles.timeNow}>{fmt(dragFrac * duration)}</Text>
            <Text style={styles.timeTotal}> / {fmt(duration)}</Text>
          </Text>
        </View>
      )}
      <View style={[styles.track, dragging && styles.trackActive]} pointerEvents="none">
        <View style={styles.trackBg} />
        <View style={[styles.trackFill, { width: fillW }]} />
        {dragging && <View style={[styles.knob, { left: Math.max(0, fillW - 7) }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute', left: 0, right: 0, height: 44, justifyContent: 'flex-end' },
  timeRow: { alignItems: 'center', marginBottom: 10 },
  time: { fontSize: 15, fontWeight: '800' },
  timeNow: { color: '#fff' },
  timeTotal: { color: 'rgba(255,255,255,0.6)' },
  track: { height: 3, justifyContent: 'center' },
  trackActive: { height: 6 },
  trackBg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3 },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#fff', borderRadius: 3 },
  knob: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
  },
});
