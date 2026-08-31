/**
 * Post-date formatting — shared by the home feed (relative) and a post's own
 * detail screen (absolute, under the comments). Deliberately its own module
 * rather than another file-local `timeAgo`: notifications/comments/activity
 * each already have their own short "Xm/Xh/Xd" timestamp for a different
 * purpose (a notification list, a comment thread) and aren't changed here —
 * this is specifically the granularity a *post* wants, spelled out in full
 * words ("2 hours ago") rather than abbreviated.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * "5 minutes ago" under an hour, "2 hours ago" under a day, "6 days ago"
 * under a week, "1 week ago" under a month, "1 month ago" under a year,
 * "1 year ago" beyond that.
 */
export function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < MINUTE) return 'Just now';

  const minutes = Math.floor(diff / MINUTE);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;

  const hours = Math.floor(diff / HOUR);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.floor(diff / DAY);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;

  const weeks = Math.floor(diff / WEEK);
  if (weeks < 4) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;

  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

/** "August 25" within the current year, "August 25, 2025" otherwise — the
 *  absolute date shown under a post's own comments section. */
export function formatAbsoluteDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('en-US', opts);
}
