import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { radius, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

import { onboardingStyles as styles } from './styles';

/** Farthest-back a birthdate could reasonably be, so the wheel doesn't default to the 1900s. */
const DEFAULT_DOB = new Date(2000, 0, 1);

export function NameStep({
  name,
  onChangeName,
  dateOfBirth,
  onChangeDateOfBirth,
  onContinue,
}: {
  name: string;
  onChangeName: (name: string) => void;
  dateOfBirth: Date | null;
  onChangeDateOfBirth: (date: Date | null) => void;
  onContinue: () => void;
}) {
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const continueFromName = () => {
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    setError(null);
    onContinue();
  };

  return (
    <>
      <Text style={[typography.title, { color: colors.text, marginBottom: 4 }]}>What should we call you?</Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>This is the name shown on your profile.</Text>
      <TextField label="Full name" value={name} onChangeText={onChangeName} placeholder="Sam Han" autoFocus />

      <Pressable
        onPress={() => setPickerOpen((v) => !v)}
        style={[dobStyles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="gift-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <Text style={[dobStyles.rowText, { color: dateOfBirth ? colors.text : colors.textMuted }]}>
          {dateOfBirth
            ? dateOfBirth.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Date of birth (optional)'}
        </Text>
        {dateOfBirth && (
          <Pressable hitSlop={8} onPress={() => onChangeDateOfBirth(null)}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </Pressable>
      {pickerOpen && (
        <DateTimePicker
          value={dateOfBirth ?? DEFAULT_DOB}
          mode="date"
          display="spinner"
          maximumDate={new Date()}
          onChange={(_event, date) => {
            if (date) onChangeDateOfBirth(date);
          }}
        />
      )}

      {error && <Text style={[styles.msg, { color: colors.ratingLow }]}>{error}</Text>}
      <Button label="Continue" size="lg" onPress={continueFromName} style={{ marginTop: 8 }} />
    </>
  );
}

const dobStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    minHeight: 50,
    marginBottom: 14,
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '500' },
});
