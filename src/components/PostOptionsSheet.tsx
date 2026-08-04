import { useState } from 'react';
import { useRouter } from 'expo-router';

import { ActionSheet, type SheetAction } from '@/components/ActionSheet';
import { confirmAction } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';

type Visibility = 'public' | 'friends' | 'private';

/**
 * The "⋯" menu for a post — a plate or a Plato. Opened from the feed card,
 * the post detail, and the profile grid tiles.
 *
 * Its own post: change audience (public / friends / only me), archive/restore,
 * delete. Someone else's: report. Content-type-agnostic — the caller passes the
 * current state and the mutations, so one component drives both plates
 * (DataContext) and Platos (PlatosContext). The actual enforcement lives in the
 * DB (RLS + those mutations); this is just the control surface.
 */
export function PostOptionsSheet({
  visible,
  onClose,
  isOwner,
  visibility,
  archived,
  reportTarget,
  onSetVisibility,
  onSetArchived,
  onDelete,
  onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  isOwner: boolean;
  visibility: Visibility;
  archived: boolean;
  /** `report?targetType=…&targetId=…` path for the non-owner Report action. */
  reportTarget: string;
  onSetVisibility: (v: Visibility) => void;
  onSetArchived: (archived: boolean) => void;
  onDelete: () => void;
  /** Fired after a confirmed delete, so a detail screen can pop back. */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [audienceOpen, setAudienceOpen] = useState(false);

  const audienceLabel = visibility === 'friends' ? 'Friends' : visibility === 'private' ? 'Only me' : 'Public';

  const ownerActions: SheetAction[] = [
    {
      label: `Audience · ${audienceLabel}`,
      icon: visibility === 'private' ? 'lock-closed-outline' : visibility === 'friends' ? 'people-outline' : 'earth-outline',
      onPress: () => setAudienceOpen(true),
    },
    {
      label: archived ? 'Restore from archive' : 'Archive',
      icon: archived ? 'refresh-outline' : 'archive-outline',
      onPress: () => {
        tapLight();
        onSetArchived(!archived);
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
            onDelete();
            onDeleted?.();
          },
        }),
    },
  ];

  const otherActions: SheetAction[] = [
    { label: 'Report', icon: 'flag-outline', destructive: true, onPress: () => router.push(reportTarget as never) },
  ];

  const audienceActions: SheetAction[] = (
    [
      { v: 'public', label: 'Public', icon: 'earth-outline' },
      { v: 'friends', label: 'Friends', icon: 'people-outline' },
      { v: 'private', label: 'Only me', icon: 'lock-closed-outline' },
    ] as const
  ).map((o) => ({
    label: visibility === o.v ? `${o.label} ✓` : o.label,
    icon: o.icon,
    onPress: () => {
      tapLight();
      onSetVisibility(o.v);
    },
  }));

  return (
    <>
      <ActionSheet visible={visible && !audienceOpen} onClose={onClose} actions={isOwner ? ownerActions : otherActions} />
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
