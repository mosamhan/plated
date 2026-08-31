import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AccountRow } from '@/components/AccountRow';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { confirmAction, showAlert } from '@/lib/dialog';
import { useAuth } from '@/store/AuthContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Account Center — every account signed into on this device, switchable
 * without re-entering credentials (see AuthContext's `switchAccount`, which
 * just swaps the live Supabase session to a saved refresh token).
 */
export default function AccountsScreen() {
  const { colors } = useTheme();
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
    router.replace('/(tabs)');
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Accounts" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              active={account.id === userId}
              onPress={() => handleSwitch(account.id)}
              onLongPress={account.id === userId ? undefined : () => handleRemove(account.id)}
              onRemove={account.id === userId ? undefined : () => handleRemove(account.id)}
            />
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Button
            label="Use another profile"
            variant="secondary"
            onPress={() => router.push('/(auth)/sign-in')}
          />
          <Button
            label="Create new account"
            variant="ghost"
            style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: colors.accent }}
            onPress={() => router.push('/(auth)/sign-up')}
          />
        </View>
      </ScrollView>
    </View>
  );
}
