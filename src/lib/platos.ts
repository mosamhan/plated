import type { PlatoVideo } from '@/data/platos';

/** One grid tile's worth of a Plato — the video/poster it's still tied to, plus which plate it's fronting. */
export interface PlatoTileEntry {
  key: string;
  video: PlatoVideo;
  title: string;
  rating: number;
}

/**
 * A Plato covering several plates shouldn't collapse to one grid tile titled
 * only with the headline dish — someone curious about the *second* plate in
 * the video has no way to find it. Expands to one tile per plate, each
 * pointing at the same video (tapping any of them opens the one Plato); a
 * Plato with 0-1 plates yields its single headline tile, unchanged.
 */
export function expandPlatoPlates(video: PlatoVideo): PlatoTileEntry[] {
  if (!video.plates || video.plates.length <= 1) {
    return [{ key: video.id, video, title: video.dishName, rating: video.rating }];
  }
  return video.plates.map((p, i) => ({
    key: `${video.id}-${i}`,
    video,
    title: p.dishName,
    rating: p.rating,
  }));
}
