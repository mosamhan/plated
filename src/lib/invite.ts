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
