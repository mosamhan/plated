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
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/store/AuthContext';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function SignUp() {
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Apple 1.2: UGC apps must require terms acceptance before account creation.
  const [agreed, setAgreed] = useState(false);

  const handleSignUp = () => {
    if (!agreed) return;
    signUp();
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Logo size={30} />
        </View>
        <Text style={[typography.title, { color: colors.text, marginBottom: 4 }]}>
          Create your account
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Start rating plates and building your taste profile.
        </Text>

        <TextField
          label="Full name"
          icon="person-outline"
          value={name}
          onChangeText={setName}
          placeholder="Sam Han"
        />
        <TextField
          label="Username"
          prefix="@"
          value={handle}
          onChangeText={setHandle}
          autoCapitalize="none"
          placeholder="samhan"
        />
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
          placeholder="Create a password"
        />

        <Pressable style={styles.termsRow} onPress={() => setAgreed((v) => !v)}>
          <Ionicons
            name={agreed ? 'checkbox' : 'square-outline'}
            size={22}
            color={agreed ? colors.accent : colors.textMuted}
          />
          <Text style={[styles.termsText, { color: colors.textMuted }]}>
            I agree to the{' '}
            <Text
              style={{ color: colors.accent, fontWeight: '700' }}
              onPress={() => router.push('/legal/terms')}>
              Terms &amp; Community Guidelines
            </Text>{' '}
            and{' '}
            <Text
              style={{ color: colors.accent, fontWeight: '700' }}
              onPress={() => router.push('/legal/privacy')}>
              Privacy Policy
            </Text>
            . No tolerance for objectionable content or abusive behavior.
          </Text>
        </Pressable>

        <Button label="Create account" size="lg" onPress={handleSignUp} disabled={!agreed} style={{ marginTop: 8 }} />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>Already have an account? </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.link, { color: colors.accent }]}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl },
  sub: { fontSize: 14, fontWeight: '500', marginBottom: spacing.xl },
  termsRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: spacing.md },
  termsText: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { fontSize: 14, fontWeight: '500' },
  link: { fontSize: 14, fontWeight: '700' },
});
