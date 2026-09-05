import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'plated.platoPlayback';

export interface PlatoPlaybackSettings {
  /** Playback rate applied to every reel — a global preference, matching
   *  TikTok's own Speed control, not a per-video setting. */
  speed: number;
  /** When on, a reel advances to the next one instead of looping once it
   *  plays to the end. */
  autoScroll: boolean;
}

const DEFAULT_SETTINGS: PlatoPlaybackSettings = { speed: 1, autoScroll: false };

/**
 * Module-level store (same `useSyncExternalStore` shape as `linkPreview.ts`)
 * so every open `PlatoReel` and the controls sheet that changes these values
 * stay in sync without a context provider wrapping the whole app for two
 * small, infrequently-changed preferences.
 */
let settings: PlatoPlaybackSettings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
}

// Fires once, the first time any component reads these settings — after that
// `loaded` is already true and every later mount sees the resolved value
// straight from the module-level snapshot.
function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PlatoPlaybackSettings>;
      settings = {
        speed: typeof parsed.speed === 'number' ? parsed.speed : DEFAULT_SETTINGS.speed,
        autoScroll: typeof parsed.autoScroll === 'boolean' ? parsed.autoScroll : DEFAULT_SETTINGS.autoScroll,
      };
      notify();
    })
    .catch(() => {});
}

function setSpeed(speed: number) {
  settings = { ...settings, speed };
  notify();
  persist();
}

function setAutoScroll(autoScroll: boolean) {
  settings = { ...settings, autoScroll };
  notify();
  persist();
}

export function usePlatoPlaybackSettings(): PlatoPlaybackSettings & {
  setSpeed: (speed: number) => void;
  setAutoScroll: (autoScroll: boolean) => void;
} {
  ensureLoaded();
  const snapshot = useSyncExternalStore(subscribe, () => settings);
  return { ...snapshot, setSpeed, setAutoScroll };
}
