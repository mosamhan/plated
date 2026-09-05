import type { VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

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
 *
 * The drag itself is a `Gesture.Pan`, not the older `PanResponder` — a plain
 * PanResponder claims a touch the instant it starts moving at all, so a
 * vertical swipe meant for the reel pager (change Plato) that happened to
 * start within this bar's hit area got eaten as a scrub instead. `Gesture.Pan`
 * only activates once the drag is clearly horizontal (`activeOffsetX`) and
 * explicitly fails — releasing the touch to whatever's underneath, here the
 * reel's own vertical paging — once it's clearly vertical (`failOffsetY`),
 * the same negotiation `MessageBubble`'s swipe-to-reply already relies on for
 * an identical horizontal-gesture-inside-a-vertical-scroll conflict.
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
  // `player` is a stateful imperative handle (an expo-video controller), not
  // render data — aliased so seeking it (`vp.currentTime = ...`) reads as a
  // local, not a prop mutation.
  const vp = player;
  const [width, setWidth] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1, playback
  const [dragging, setDragging] = useState(false);
  const [dragFrac, setDragFrac] = useState(0); // 0..1, finger
  const [duration, setDuration] = useState(0);
  // Shared values, not plain refs: they're what the gesture callbacks below
  // (constructed at render time, invoked later off of a UI-thread worklet)
  // are actually allowed to read — same convention as MessageBubble's swipe.
  const widthSV = useSharedValue(0);
  const draggingSV = useSharedValue(false);

  // Poll playback position. Cheap, and paused implicitly while dragging.
  useEffect(() => {
    const id = setInterval(() => {
      if (draggingSV.value) return;
      const dur = vp.duration || 0;
      setDuration(dur);
      if (dur > 0) setProgress(Math.min(1, Math.max(0, vp.currentTime / dur)));
    }, 250);
    return () => clearInterval(id);
  }, [vp, draggingSV]);

  const fracFromX = (x: number, w: number) => (w > 0 ? Math.min(1, Math.max(0, x / w)) : 0);

  // Plain JS functions, called from the gesture's worklets via runOnJS —
  // they touch React state and the player's own `currentTime` setter
  // (a seek), both of which belong on the JS thread, not the UI thread the
  // gesture callbacks themselves run on.
  const beginScrub = (x: number, w: number) => {
    draggingSV.value = true;
    setDragging(true);
    onScrubbingChange?.(true);
    setDragFrac(fracFromX(x, w));
  };
  const updateScrub = (x: number, w: number) => setDragFrac(fracFromX(x, w));
  const seekTo = (x: number, w: number) => {
    const frac = fracFromX(x, w);
    const dur = vp.duration || 0;
    // Seek by setting the player's time — expo-video treats an assignment to
    // currentTime as a seek, not render data being mutated. The lint rule
    // can't tell an imperative native handle apart from a plain prop.
    // eslint-disable-next-line react-hooks/immutability
    if (dur > 0) vp.currentTime = frac * dur;
    setProgress(frac);
  };
  const endScrub = (x: number, w: number) => {
    seekTo(x, w);
    draggingSV.value = false;
    setDragging(false);
    onScrubbingChange?.(false);
  };
  const cancelScrub = () => {
    draggingSV.value = false;
    setDragging(false);
    onScrubbingChange?.(false);
  };

  // Drag-to-scrub and tap-to-seek are two different gestures composed via
  // Race rather than one gesture trying to do both: Pan only ever activates
  // once the touch is clearly horizontal (activeOffsetX) so a stationary tap
  // never reaches it, and Tap only fires on a real tap (RNGH's own small
  // built-in movement tolerance rules out anything that moved enough to be
  // a drag). Both independently fail out — Pan via failOffsetY, Tap via its
  // own movement tolerance — for a vertical swipe, releasing the touch to
  // whatever's underneath: the reel's own vertical paging between Platos.
  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-10, 10])
    .onStart((e) => runOnJS(beginScrub)(e.x, widthSV.value))
    .onUpdate((e) => runOnJS(updateScrub)(e.x, widthSV.value))
    .onEnd((e) => runOnJS(endScrub)(e.x, widthSV.value))
    .onFinalize((_e, success) => {
      // Only a safety net for a cancel that never reached onEnd (e.g. the
      // gesture failed via failOffsetY before ever activating) — onEnd
      // already did the real cleanup for a normal release.
      if (!success) runOnJS(cancelScrub)();
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e, success) => {
      if (success) runOnJS(seekTo)(e.x, widthSV.value);
    });

  const scrub = Gesture.Race(pan, tap);

  const shown = dragging ? dragFrac : progress;
  const fillW = width * shown;

  return (
    // A tall transparent hit area so the thin line is easy to grab; the visible
    // bar sits at its bottom.
    <GestureDetector gesture={scrub}>
      <View
        style={[styles.hit, { bottom }]}
        onLayout={(ev) => {
          widthSV.value = ev.nativeEvent.layout.width;
          setWidth(ev.nativeEvent.layout.width);
        }}>
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
    </GestureDetector>
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
