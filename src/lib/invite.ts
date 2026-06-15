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
