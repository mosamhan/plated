import { ProfileView } from '@/components/ProfileView';
import { useData } from '@/store/DataContext';

export default function ProfileTab() {
  const { currentUser } = useData();
  return <ProfileView user={currentUser} isCurrent />;
}
