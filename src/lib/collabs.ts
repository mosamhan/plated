import { Collaborator } from '@/data/types';

/**
 * Credit line for a post's co-creators — "@mia", "@mia and @leo",
 * "@mia and 2 others".
 *
 * Only accepted collaborators are named. A pending invite is nobody's business
 * but the two people involved, and a declined one must never show at all.
 */
export function collabLabel(
  collaborators: Collaborator[] | undefined,
  handleFor: (userId: string) => string,
): string | null {
  const accepted = (collaborators ?? []).filter((c) => c.status === 'accepted');
  if (accepted.length === 0) return null;

  const handles = accepted.map((c) => `@${handleFor(c.userId)}`);
  if (handles.length === 1) return handles[0];
  if (handles.length === 2) return `${handles[0]} and ${handles[1]}`;
  return `${handles[0]} and ${handles.length - 1} others`;
}

/**
 * Appended to the commission explainer when a post has collaborators, so the
 * label can't be read as a revenue split: the original poster earns, full stop.
 */
export function collabEarningsNote(ownerHandle: string): string {
  return `Collaborators are credited on this post but don't earn from it — @${ownerHandle} posted it, so any commission is theirs.`;
}
