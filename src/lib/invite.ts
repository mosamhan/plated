export const INVITE_LINK = 'joinplated.app/invite/samhan';

/** Full invite URL — for the `url` field of `Share.share`, alongside `buildInviteMessage`. */
export function inviteLink(): string {
  return `https://${INVITE_LINK}`;
}

/**
 * Canonical links for a plate / Plato — what Copy link puts on the clipboard,
 * and the same URL the share copy below embeds. Kept here so the two can never
 * drift into pointing at different things.
 */
export function plateLink(orderId: string): string {
  return `https://joinplated.app/p/${orderId}`;
}

export function platoLink(platoId: string): string {
  return `https://joinplated.app/plato/${platoId}`;
}

export function restaurantLink(restaurantId: string): string {
  return `https://joinplated.app/r/${restaurantId}`;
}

/**
 * Single source for invite-share copy. When the sharer earns commission,
 * the FTC "#ad" disclosure is appended automatically — the creator dashboard
 * promises exactly that, so every share path must go through here.
 */
export function buildInviteMessage(opts: { earns: boolean }): string {
  const base = `Join me on Plated — rate dishes and order the exact plates people rated. ${inviteLink()}`;
  return opts.earns ? `${base} I earn when you order through Plated #ad` : base;
}

/** Canonical profile URL — what Copy link puts on the clipboard. */
export function profileLink(handle: string): string {
  return `https://joinplated.app/@${handle}`;
}

/** Share copy for a profile — the handle is the findable part, so it leads. */
export function buildProfileShareMessage(opts: { name: string; handle: string }): string {
  return `${opts.name} (@${opts.handle}) on Plated — see what they're rating. ${profileLink(opts.handle)}`;
}

/**
 * Share copy for one rated plate. The dish is the subject — the restaurant is
 * context — because "this specific thing was good" is what Plated is for, and
 * it's what distinguishes a plate share from a restaurant share.
 *
 * Embeds `plateLink(orderId)` — the same URL "Copy link" puts on the
 * clipboard (see SendToSheet's `SharePayload.link`) — rather than the site
 * root, so the text a recipient reads and the link they'd get from Copy link
 * always point at the same place.
 *
 * `earns` should come from this specific plate's `monetizable` flag, not the
 * poster's general `compensationEligible` status — commission is locked in
 * per-post at creation time (see 0038_post_monetization_flags.sql), so a
 * plate posted before the poster qualified, or against a restaurant that has
 * since blocked them, must not carry the disclosure.
 */
export function buildPlateShareMessage(opts: {
  orderId: string;
  dishName: string;
  restaurantName?: string;
  rating?: number;
  handle?: string;
  earns?: boolean;
}): string {
  const score = opts.rating != null && opts.rating > 0 ? ` (${opts.rating.toFixed(1)})` : '';
  const at = opts.restaurantName ? ` at ${opts.restaurantName}` : '';
  const who = opts.handle ? ` — rated by @${opts.handle}` : '';
  // Some dish names already start with "The" ("The Classic Smash") — don't double it up.
  const dish = /^the\s/i.test(opts.dishName) ? opts.dishName : `The ${opts.dishName}`;
  const base = `${dish}${at}${score}${who}. On Plated: ${plateLink(opts.orderId)}`;
  return opts.earns ? `${base} #ad` : base;
}

/**
 * Share copy for a restaurant. Leads with Plated's own rating when there is
 * one, because that's the part someone can't get from a maps link. Embeds
 * `restaurantLink(restaurantId)`, same reason as `buildPlateShareMessage`.
 */
export function buildRestaurantShareMessage(opts: {
  restaurantId: string;
  name: string;
  cuisine?: string;
  location?: string;
  rating?: number;
}): string {
  const where = [opts.cuisine, opts.location].filter(Boolean).join(' · ');
  const score = opts.rating != null && opts.rating > 0 ? ` — ${opts.rating.toFixed(1)} on Plated` : ' on Plated';
  return `${opts.name}${where ? ` (${where})` : ''}${score}. ${restaurantLink(opts.restaurantId)}`;
}

/**
 * Share copy for a single Plato (creator video). `earns` should come from
 * this Plato's own `monetizable` flag (see `buildPlateShareMessage`), not the
 * creator's general `compensationEligible` status. Embeds
 * `platoLink(platoId)`, same reason as `buildPlateShareMessage`.
 */
export function buildPlatoShareMessage(opts: {
  platoId: string;
  dishName: string;
  restaurantName: string;
  creatorHandle: string;
  rating?: number;
  earns?: boolean;
}): string {
  const score = opts.rating != null ? ` (${opts.rating.toFixed(1)})` : '';
  const base = `Watch @${opts.creatorHandle} on the ${opts.dishName} at ${opts.restaurantName}${score} — on Plated. ${platoLink(opts.platoId)}`;
  return opts.earns ? `${base} #ad` : base;
}
