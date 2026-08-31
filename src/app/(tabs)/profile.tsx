import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useMainPagerControl } from '@/store/MainPagerControl';

/**
 * Redirect shim — Profile is a page of the pager hosted by `index.tsx` now,
 * not its own screen. Kept as a real route so `router.push('/(tabs)/profile')`
 * (used elsewhere in the app) still works.
 */
export default function ProfileRedirect() {
  const router = useRouter();
  const { jumpTo } = useMainPagerControl();

  useEffect(() => {
    jumpTo('profile');
    router.replace('/(tabs)');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
