import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { HANDLE_MAX, handleProblem, isHandleAvailable, normalizeHandle } from '@/lib/handles';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

import { onboardingStyles as styles } from './styles';

export function UsernameStep({
  handle,
  onChangeHandle,
  onContinue,
}: {
  handle: string;
  onChangeHandle: (handle: string) => void;
  onContinue: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [handleFree, setHandleFree] = useState<boolean | null>(null);
  const [checkingHandle, setCheckingHandle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSeq = useRef(0);

  // Same debounced-availability pattern as sign-up.tsx — kept in step so both
  // screens rank a handle identically instead of drifting apart over time.
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
      if (seq !== handleSeq.current) return;
      setHandleFree(free);
      setCheckingHandle(false);
    }, 400);
    return () => clearTimeout(t);
  }, [handle]);

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

  const continueFromUsername = () => {
    const issue = handleProblem(handle);
    if (issue) {
      setError(issue);
      return;
    }
    if (handleFree === false) {
      setError(`@${normalizeHandle(handle)} is already taken.`);
      return;
    }
    setError(null);
    onContinue();
  };

  return (
    <>
      <Text style={[typography.title, { color: colors.text, marginBottom: 4 }]}>Choose a username</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>This is how people on Plated will find you.</Text>
      <TextField
        label="Username"
        prefix="@"
        value={handle}
        onChangeText={onChangeHandle}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={HANDLE_MAX + 1}
        placeholder="samhan"
        autoFocus
      />
      {handleStatus && (
        <Text style={[styles.handleStatus, { color: handleStatus.ok ? colors.ratingHigh : colors.textMuted }]}>
          {handleStatus.text}
        </Text>
      )}
      {error && <Text style={[styles.msg, { color: colors.ratingLow }]}>{error}</Text>}
      <Button label="Continue" size="lg" onPress={continueFromUsername} style={{ marginTop: 8 }} />
      <Text
        style={[styles.claimLink, { color: colors.accent, marginTop: spacing.lg }]}
        onPress={() => router.push('/find-restaurant')}>
        Own a restaurant? Claim it here
      </Text>
    </>
  );
}
