import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { TextField } from '@/components/TextField';
import { showAlert } from '@/lib/dialog';
import { useAuth } from '@/store/AuthContext';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function SignIn() {
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace('/(tabs)');
  };

  const comingSoon = () =>
    showAlert('Coming soon', 'Apple & Google sign-in are on the roadmap — use email to sign in for now.');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 60, paddingBottom: 40 }]}
        keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
          <Logo size={34} />
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            Rate the dish. Order what&apos;s actually good.
          </Text>
        </View>

        <Text style={[typography.title, { color: colors.text, marginBottom: spacing.lg }]}>
          Welcome back
        </Text>

        <TextField
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@email.com"
        />
        <TextField
          label="Password"
          icon="lock-closed-outline"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
        />

        <Pressable style={{ alignSelf: 'flex-end', marginBottom: spacing.lg }}>
          <Text style={[styles.link, { color: colors.accent }]}>Forgot password?</Text>
        </Pressable>

        {error && (
          <Text style={[styles.error, { color: colors.ratingLow }]}>{error}</Text>
        )}

        <Button label="Sign in" size="lg" onPress={handleSignIn} loading={busy} />

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.or, { color: colors.textMuted }]}>or</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <View style={{ gap: 10 }}>
          <SocialButton icon="logo-apple" label="Continue with Apple" onPress={comingSoon} />
          <SocialButton icon="logo-google" label="Continue with Google" onPress={comingSoon} />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>New to Plated? </Text>
          <Pressable onPress={() => router.push('/(auth)/sign-up')}>
            <Text style={[styles.link, { color: colors.accent }]}>Create account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SocialButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.social,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={[styles.socialText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl },
  tagline: { fontSize: 14, fontWeight: '500', marginTop: 12, textAlign: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
  error: { fontSize: 13, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: spacing.xl },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
  or: { fontSize: 13, fontWeight: '600' },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  socialText: { fontSize: 15, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xxl },
  footerText: { fontSize: 14, fontWeight: '500' },
});
