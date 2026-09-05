import { formatDuration } from '@/components/VoiceNote';
import { Message } from '@/data/messages';
import { PlatoVideo } from '@/data/platos';
import { Order, Restaurant } from '@/data/types';
import { postMedia } from '@/lib/post';

/**
 * What a reply-quote strip shows for the message it answers — shared by the
 * sent-message quote (`MessageBubble.tsx`) and the live composer's reply
 * banner (`messages/[id].tsx`), so the two can't drift the way they did
 * before this existed (the banner had no `image` case at all).
 *
 * A thumbnail where there's a real picture to show (a specific album photo,
 * a plate's dish shot, a Plato's poster, a restaurant's cover), an icon
 * where there isn't but the kind still has its own visual language (a play
 * glyph for a voice note, standing in for its waveform), and a plain-
 * language line under either — no emoji doing the thumbnail's job for it.
 */
export interface QuotePreview {
  thumbnail?: string;
  icon?: 'play';
  text: string;
}

/** `photoIndex` is the page of `message`'s album a reply actually pointed at. */
export function resolveQuote(
  message: Message,
  photoIndex: number | undefined,
  orders: Order[],
  platos: PlatoVideo[],
  restaurantFor: (id: string) => Restaurant | undefined,
): QuotePreview {
  if (message.kind === 'voice') {
    return { icon: 'play', text: formatDuration(message.durationMs ?? 0) };
  }

  if (message.kind === 'plate') {
    const order = orders.find((o) => o.id === message.attachmentId);
    if (!order) return { text: 'Shared a plate' };
    const plates = postMedia(order);
    const plate = plates[Math.min(message.attachmentIndex ?? 0, plates.length - 1)] ?? plates[0];
    return { thumbnail: plate?.uri, text: plate?.dishName || order.dishName || 'Shared a plate' };
  }

  if (message.kind === 'plato') {
    const plato = platos.find((p) => p.id === message.attachmentId);
    if (!plato) return { text: 'Shared a Plato' };
    return { thumbnail: plato.poster, text: plato.dishName || 'Shared a Plato' };
  }

  if (message.kind === 'restaurant') {
    const restaurant = message.attachmentId ? restaurantFor(message.attachmentId) : undefined;
    if (!restaurant) return { text: 'Shared a restaurant' };
    return { thumbnail: restaurant.image, text: restaurant.name };
  }

  if (message.kind === 'image') {
    const count = message.attachmentIds?.length ?? (message.attachmentId ? 1 : 0);
    const thumbnail = message.attachmentIds?.[photoIndex ?? 0] ?? message.attachmentId;
    const text =
      count > 1 && photoIndex != null
        ? `Photo ${photoIndex + 1} of ${count}`
        : count > 1
          ? `${count} photos`
          : 'Photo';
    return { thumbnail, text };
  }

  if (message.kind === 'video') {
    // No thumbnail to show for a raw video URL (no poster-frame pipeline) —
    // the play glyph is the same "here's a icon, not a still image" language
    // a voice note's quote already uses.
    return { icon: 'play', text: 'Video' };
  }

  return { text: message.text };
}
