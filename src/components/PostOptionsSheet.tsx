import { useState } from 'react';
import { useRouter } from 'expo-router';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { confirmAction } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import type { Order } from '@/data/types';
import { useData } from '@/store/DataContext';

/**
 * The "⋯" menu for a post, opened from the feed card and the post detail.
 *
 * Its own post: change audience (public / friends / only me), archive or
 * restore, delete. Someone else's: report. Kept in one component so both
 * entry points show the same options and the owner/other split lives in one
 * place. Audience/archive/delete are enforced in the DB (RLS + the mutations
 * in DataContext); this is just the control surface.
 */
export function PostOptionsSheet({
  order,
  visible,
  onClose,
  onDeleted,
}: {
  order: Order;
  visible: boolean;
  onClose: () => void;
  /** Called after a delete, so a detail screen can pop back. */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { currentUser, deleteOrder, setOrderVisibility, setOrderArchived } = useData();
  const isOwner = order.userId === currentUser.id;
  const [audienceOpen, setAudienceOpen] = useState(false);

  const visibility = order.visibility ?? 'public';
  const audienceLabel =
    visibility === 'friends' ? 'Friends' : visibility === 'private' ? 'Only me' : 'Public';

  const ownerActions: SheetAction[] = [
    {
      label: `Audience · ${audienceLabel}`,
      icon: visibility === 'private' ? 'lock-closed-outline' : visibility === 'friends' ? 'people-outline' : 'earth-outline',
      onPress: () => setAudienceOpen(true),
    },
    {
      label: order.archived ? 'Restore from archive' : 'Archive',
      icon: order.archived ? 'refresh-outline' : 'archive-outline',
      onPress: () => {
        tapLight();
        setOrderArchived(order.id, !order.archived);
      },
    },
    {
      label: 'Delete post',
      icon: 'trash-outline',
      destructive: true,
      onPress: () =>
        confirmAction({
          title: 'Delete this post?',
          message: 'This removes it for everyone. It can’t be undone.',
          confirmLabel: 'Delete',
          destructive: true,
          onConfirm: () => {
            deleteOrder(order.id);
            onDeleted?.();
          },
        }),
    },
  ];

  const otherActions: SheetAction[] = [
    {
      label: 'Report',
      icon: 'flag-outline',
      destructive: true,
      onPress: () => router.push(`/report?targetType=plate&targetId=${order.id}`),
    },
  ];

  const audienceActions: SheetAction[] = (
    [
      { v: 'public', label: 'Public', hint: 'Anyone on Plated', icon: 'earth-outline' },
      { v: 'friends', label: 'Friends', hint: 'People you follow who follow you back', icon: 'people-outline' },
      { v: 'private', label: 'Only me', hint: 'Just you', icon: 'lock-closed-outline' },
    ] as const
  ).map((o) => ({
    label: visibility === o.v ? `${o.label} ✓` : o.label,
    icon: o.icon,
    onPress: () => {
      tapLight();
      setOrderVisibility(order.id, o.v);
    },
  }));

  return (
    <>
      <ActionSheet
        visible={visible && !audienceOpen}
        onClose={onClose}
        actions={isOwner ? ownerActions : otherActions}
      />
      <ActionSheet
        visible={audienceOpen}
        onClose={() => {
          setAudienceOpen(false);
          onClose();
        }}
        title="Who can see this post?"
        actions={audienceActions}
      />
    </>
  );
}
