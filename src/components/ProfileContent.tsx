import { ProfileView } from '@/components/ProfileView';
import { useData } from '@/store/DataContext';

export function ProfileContent() {
  const { currentUser } = useData();
  return <ProfileView user={currentUser} isCurrent />;
}
