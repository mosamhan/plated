import { InboxView } from '@/components/InboxView';

/**
 * Pushed from the Home header, the same way Notifications is — Messages
 * isn't a pager page anymore, it's a destination you go *to*, not one of the
 * sections you swipe between.
 */
export default function MessagesScreen() {
  return <InboxView />;
}
