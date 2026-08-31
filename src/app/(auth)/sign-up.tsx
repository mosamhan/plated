import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { HANDLE_MAX, handleProblem, isHandleAvailable, isProbablyEmail, normalizeHandle } from '@/lib/handles';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** null = not checked yet (too short, or still typing). */
  const [handleFree, setHandleFree] = useState<boolean | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const handleSeq = useRef(0);

  // Debounced so a check fires when someone pauses, not on every keystroke.
  // The DB de-duplicates a collision anyway (see 0046) — this exists so people
  // find out *before* submitting that the name they wanted is gone.
  useEffect(() => {
    const normalized = normalizeHandle(handle);
    if (handleProblem(handle)) {
      setHandleFree(null);
      setCheckingHandle(false);
      return;
    }
    setCheckingHandle(true);
    const seq = ++handleSeq.current;
    const t = setTimeout(async () => {
      const free = await isHandleAvailable(normalized);
      // Ignore a response for a handle the user has already typed past.
      if (seq !== handleSeq.current) return;
      setHandleFree(free);
      setCheckingHandle(false);
    }, 400);
    return () => clearTimeout(t);
  }, [handle]);

  const handleSignUp = async () => {
    // Checked one at a time so the message names the actual problem instead of
    // listing every rule and leaving the user to work out which one they broke.
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    const handleIssue = handleProblem(handle);
    if (handleIssue) {
      setError(handleIssue);
      return;
    }
    if (handleFree === false) {
      setError(`@${normalizeHandle(handle)} is already taken.`);
      return;
    }
    if (!isProbablyEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password needs at least 6 characters.');
      return;
    }
    if (!agreed) {
      setError('Please accept the terms to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err, needsConfirmation } = await signUp({
      email: email.trim(),
      password,
      name: name.trim(),
      handle: handle.trim(),
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsConfirmation) {
      setNotice('Check your email to confirm your account, then sign in.');
      return;
    }
    router.replace('/(tabs)');
  };

  const handleIssueNow = handle.trim() ? handleProblem(handle) : null;
  const handleStatus: { text: string; ok: boolean } | null = !handle.trim()
    ? null
    : handleIssueNow
      ? { text: handleIssueNow, ok: false }
      : checkingHandle
        ? { text: 'Checking availability…', ok: false }
        : handleFree === true
          ? { text: `@${normalizeHandle(handle)} is available`, ok: true }
          : handleFree === false
            ? { text: `@${normalizeHandle(handle)} is already taken`, ok: false }
            : null;

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
          autoCorrect={false}
          maxLength={HANDLE_MAX + 1}
          placeholder="samhan"
        />
        {/* Sits directly under the field it's about — pulled up over the
            TextField's own bottom margin so it reads as part of the field. */}
        {handleStatus && (
          <Text style={[styles.handleStatus, { color: handleStatus.ok ? colors.ratingHigh : colors.textMuted }]}>
            {handleStatus.text}
          </Text>
        )}
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

        {error && <Text style={[styles.msg, { color: colors.ratingLow }]}>{error}</Text>}
        {notice && <Text style={[styles.msg, { color: colors.success }]}>{notice}</Text>}

        <Button
          label="Create account"
          size="lg"
          onPress={handleSignUp}
          loading={busy}
          disabled={!agreed}
          style={{ marginTop: 8 }}
        />

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>Already have an account? </Text>
          {/* Explicit navigation, not router.back() — sign-up isn't only ever
              reached by pushing from sign-in anymore (it's also reachable
              directly from the Account Center/switcher's "Create new
              account"), and back() from there can be a no-op if this screen
              ends up as the root of its own stack instance. */}
          <Pressable onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={[styles.link, { color: colors.accent }]}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl },
  handleStatus: { fontSize: 12, fontWeight: '600', marginTop: -8, marginBottom: 14, marginLeft: 2 },
  sub: { fontSize: 14, fontWeight: '500', marginBottom: spacing.xl },
  termsRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: spacing.md },
  termsText: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  msg: { fontSize: 13, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { fontSize: 14, fontWeight: '500' },
  link: { fontSize: 14, fontWeight: '700' },
});
