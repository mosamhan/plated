import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IntroCarousel } from '@/components/onboarding/IntroCarousel';
import { NameStep } from '@/components/onboarding/NameStep';
import { PermissionsStep } from '@/components/onboarding/PermissionsStep';
import { PhotoStep } from '@/components/onboarding/PhotoStep';
import { onboardingStyles as styles } from '@/components/onboarding/styles';
import { UsernameStep } from '@/components/onboarding/UsernameStep';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { normalizeHandle } from '@/lib/handles';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';
import { useData } from '@/store/DataContext';
import { useTheme } from '@/theme/ThemeContext';

type Step = 'intro' | 'username' | 'name' | 'photo' | 'welcome' | 'permissions';
/** Dots only cover the personal-setup steps — intro/welcome/permissions have their own pacing. */
const DOT_STEPS: Step[] = ['username', 'name', 'photo'];

/**
 * First-run setup for a brand-new Google/Apple signup (see the
 * `needs_onboarding` column added in 0047 — email/password signup already
 * collects name+username inline and never lands here). A single screen with
 * internal steps rather than a route stack: there's nothing to go "back" to,
 * and `gestureEnabled: false` on this route (see `_layout.tsx`) plus no back
 * button here means the only way through is finishing it.
 */
export default function Onboarding() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { currentUser, refresh } = useData();

  const [step, setStep] = useState<Step>('intro');
  const [handle, setHandle] = useState('');
  const [name, setName] = useState(currentUser.name === 'New Guest' ? '' : currentUser.name);
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        handle: normalizeHandle(handle),
        name: name.trim(),
        avatar_url: avatar,
        date_of_birth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : null,
        needs_onboarding: false,
      })
      .eq('id', userId);
    setBusy(false);
    if (err) {
      // Most likely someone else claimed the handle in the last few seconds.
      setError('That username was just taken — pick another.');
      setStep('username');
      return;
    }
    refresh();
    setStep('welcome');
  };

  const getStarted = () => {
    router.replace('/(tabs)');
  };

  if (step === 'intro') {
    return <IntroCarousel onDone={() => setStep('username')} />;
  }
  if (step === 'welcome') {
    return <WelcomeStep handle={normalizeHandle(handle)} onContinue={() => setStep('permissions')} />;
  }
  if (step === 'permissions') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 20 }}>
        <View style={styles.content}>
          <PermissionsStep onFinish={getStarted} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.dots, { paddingTop: insets.top + 20 }]}>
        {DOT_STEPS.map((s) => (
          <View key={s} style={[styles.dot, { backgroundColor: s === step ? colors.accent : colors.border }]} />
        ))}
      </View>

      <View style={styles.content}>
        {step === 'username' && (
          <UsernameStep handle={handle} onChangeHandle={setHandle} onContinue={() => setStep('name')} />
        )}
        {step === 'name' && (
          <NameStep
            name={name}
            onChangeName={setName}
            dateOfBirth={dateOfBirth}
            onChangeDateOfBirth={setDateOfBirth}
            onContinue={() => setStep('photo')}
          />
        )}
        {step === 'photo' && (
          <PhotoStep avatar={avatar} onChangeAvatar={setAvatar} onFinish={finish} busy={busy} error={error} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
