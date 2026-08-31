import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountRow } from '@/components/AccountRow';
import { Button } from '@/components/Button';
import { confirmAction, showAlert } from '@/lib/dialog';
import { useAuth } from '@/store/AuthContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The profile tab's quick account switcher — reached by tapping the @handle
 * at the top of your own profile. Same actions as the full Account Center
 * (`settings/accounts.tsx`), just as a sheet so switching doesn't require
 * leaving the profile tab.
 */
export function AccountSwitchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accounts, userId, switchAccount, removeAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleSwitch = async (id: string) => {
    if (id === userId || busy) return;
    setBusy(true);
    const { error } = await switchAccount(id);
    setBusy(false);
    if (error) {
      showAlert('Couldn’t switch accounts', error);
      return;
    }
    onClose();
  };

  const handleRemove = (id: string) => {
    if (id === userId) return;
    confirmAction({
      title: 'Remove account',
      message: 'This forgets it on this device — you’d need to sign in again to use it here.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => removeAccount(id),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                active={account.id === userId}
                onPress={() => handleSwitch(account.id)}
                onLongPress={account.id === userId ? undefined : () => handleRemove(account.id)}
              />
            ))}
          </View>

          <View style={{ gap: spacing.sm }}>
            <Button
              label="Use another profile"
              variant="secondary"
              onPress={() => {
                onClose();
                setTimeout(() => router.push('/(auth)/sign-in'), 120);
              }}
            />
            <Button
              label="Create new account"
              variant="ghost"
              style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent }}
              onPress={() => {
                onClose();
                setTimeout(() => router.push('/(auth)/sign-up'), 120);
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
});
