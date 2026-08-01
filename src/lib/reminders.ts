import * as Notifications from 'expo-notifications';

/**
 * Local check-in reminders.
 *
 * Deliberately local, not push: these fire on a clock, not on anything the
 * server knows, so they need no token, no backend, and work in Expo Go. Social
 * pings (someone liked/followed/reordered) are a different thing — those are
 * remote push and need a development build.
 *
 * Each slot is scheduled as a series of one-off DATE triggers rather than one
 * repeating DAILY trigger. A repeating trigger can't skip a single occurrence,
 * and the whole promise here is that we don't nag someone who already showed up
 * today — so the schedule is rebuilt on every app open from what we know.
 */

export interface ReminderSlot {
  hour: number;
  minute: number;
  title: string;
  body: string;
}

/** Times people are actually deciding what to eat or drink. */
export const SLOTS: ReminderSlot[] = [
  {
    hour: 9,
    minute: 30,
    title: 'Coffee run?',
    body: 'Rate what’s in the cup — cafés count on Plated too. ☕️',
  },
  {
    hour: 12,
    minute: 30,
    title: 'What’s for lunch?',
    body: 'See the plates people actually vouched for near you. 🍽️',
  },
  {
    hour: 18,
    minute: 30,
    title: 'Dinner’s the main event',
    body: 'Log tonight’s plate and keep your streak alive. 🔥',
  },
];

/** "9:30am" — one formatter, so nothing can advertise a time that isn't the slot. */
export const slotLabel = (slot: { hour: number; minute: number }) => {
  const suffix = slot.hour < 12 ? 'am' : 'pm';
  const h = slot.hour % 12 === 0 ? 12 : slot.hour % 12;
  return `${h}:${String(slot.minute).padStart(2, '0')}${suffix}`;
};

/** How far ahead to schedule. Rebuilt every app open, so two days is plenty. */
const DAYS_AHEAD = 2;

const HANDLER_SET = { current: false };

/** Show reminders while the app is foregrounded too, rather than silently dropping them. */
function ensureHandler() {
  if (HANDLER_SET.current) return;
  HANDLER_SET.current = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** True when the user has granted (or already had) notification permission. */
export async function requestReminderPermission(): Promise<boolean> {
  ensureHandler();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  // canAskAgain === false means they've denied it in Settings; asking again is a
  // no-op, so report the truth instead of pretending we asked.
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return asked.granted;
}

export async function cancelReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * How many reminders the OS is actually holding.
 *
 * Only the count is read back, never the fire times: iOS rewrites a date
 * trigger into a UNTimeIntervalNotificationTrigger carrying a *relative*
 * `seconds`, so reconstructing a wall-clock time from the queue means
 * re-deriving what {@link upcomingSlots} already knows exactly. The count is
 * the part worth asking the OS — it's the proof anything got scheduled.
 */
export async function queuedReminderCount(): Promise<number> {
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}

/**
 * Every reminder due in the window, soonest first. The single definition of the
 * schedule: both the scheduler and the "next reminder" readout come from here,
 * so what the UI promises can't drift from what was queued.
 */
export function upcomingSlots(
  checkedInToday: boolean,
  now = new Date(),
): { at: Date; slot: ReminderSlot }[] {
  const out: { at: Date; slot: ReminderSlot }[] = [];
  for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
    // SLOTS is in chronological order, so each day's are appended in order too.
    for (const slot of SLOTS) {
      const at = new Date(now);
      at.setDate(at.getDate() + dayOffset);
      at.setHours(slot.hour, slot.minute, 0, 0);

      // A time already gone by can't be scheduled, and today is skipped
      // entirely once they've checked in.
      if (at <= now) continue;
      if (dayOffset === 0 && checkedInToday) continue;

      out.push({ at, slot });
    }
  }
  return out;
}

/** When the next reminder is due, or null when nothing is scheduled. */
export function nextReminderAt(checkedInToday: boolean): Date | null {
  return upcomingSlots(checkedInToday)[0]?.at ?? null;
}

/**
 * Rebuild the reminder schedule.
 *
 * @returns how many reminders were queued.
 */
export async function scheduleReminders(checkedInToday: boolean): Promise<number> {
  ensureHandler();
  // Always clear first: this runs on every open, and without it each launch
  // would stack another copy of every slot.
  await cancelReminders();

  const due = upcomingSlots(checkedInToday);
  for (const { at, slot } of due) {
    await Notifications.scheduleNotificationAsync({
      content: { title: slot.title, body: slot.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
  return due.length;
}
