export const INVITE_LINK = 'plated.app/invite/samhan';

/**
 * Single source for invite-share copy. When the sharer earns commission,
 * the FTC "#ad" disclosure is appended automatically — the creator dashboard
 * promises exactly that, so every share path must go through here.
 */
export function buildInviteMessage(opts: { earns: boolean }): string {
  const base = `Join me on Plated — rate dishes and order the exact plates people rated. https://${INVITE_LINK}`;
  return opts.earns ? `${base} I earn when you order through Plated #ad` : base;
}

/** Share copy for a profile — the handle is the findable part, so it leads. */
export function buildProfileShareMessage(opts: { name: string; handle: string }): string {
  return `${opts.name} (@${opts.handle}) on Plated — see what they're rating. https://plated.app/@${opts.handle}`;
}

/**
 * Share copy for one rated plate. The dish is the subject — the restaurant is
 * context — because "this specific thing was good" is what Plated is for, and
 * it's what distinguishes a plate share from a restaurant share.
 */
export function buildPlateShareMessage(opts: {
  dishName: string;
  restaurantName?: string;
  rating?: number;
  handle?: string;
}): string {
  const score = opts.rating != null && opts.rating > 0 ? ` (${opts.rating.toFixed(1)})` : '';
  const at = opts.restaurantName ? ` at ${opts.restaurantName}` : '';
  const who = opts.handle ? ` — rated by @${opts.handle}` : '';
  return `The ${opts.dishName}${at}${score}${who}. On Plated: https://plated.app`;
}

/**
 * Share copy for a restaurant. Leads with Plated's own rating when there is
 * one, because that's the part someone can't get from a maps link.
 */
export function buildRestaurantShareMessage(opts: {
  name: string;
  cuisine?: string;
  location?: string;
  rating?: number;
}): string {
  const where = [opts.cuisine, opts.location].filter(Boolean).join(' · ');
  const score = opts.rating != null && opts.rating > 0 ? ` — ${opts.rating.toFixed(1)} on Plated` : ' on Plated';
  return `${opts.name}${where ? ` (${where})` : ''}${score}. https://plated.app`;
}

/**
 * Share copy for a single Plato (creator video). When the creator earns
 * commission on orders, the FTC "#ad" disclosure is appended — same rule as
 * invite shares, so both share paths route through this file.
 */
export function buildPlatoShareMessage(opts: {
  dishName: string;
  restaurantName: string;
  creatorHandle: string;
  rating?: number;
  earns?: boolean;
}): string {
  const score = opts.rating != null ? ` (${opts.rating.toFixed(1)})` : '';
  const base = `Watch @${opts.creatorHandle} on the ${opts.dishName} at ${opts.restaurantName}${score} — on Plated. https://plated.app`;
  return opts.earns ? `${base} #ad` : base;
}
