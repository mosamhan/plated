import { MainPager } from '@/components/MainPager';

/**
 * The one real screen in the tab group — hosts the live pager for
 * Home/Platos/Discover/Messages/Profile. The other three route files
 * (explore/inbox/profile) are redirect shims that hand off into this same
 * pager and bounce back here, so external deep links to them keep working
 * without each mounting a separate, disconnected tree.
 */
export default function IndexScreen() {
  return <MainPager />;
}
