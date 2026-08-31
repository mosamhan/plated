import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsSection } from '@/components/SettingsKit';
import { tapLight } from '@/lib/haptics';
import { useSettings } from '@/store/SettingsContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A personal filter list. Matching is a plain substring check, deliberately —
 * people add "spam" expecting it to catch "spammer", and a word-boundary match
 * would quietly not.
 */
export default function HiddenWords() {
  const { colors } = useTheme();
  const { hiddenWords, addHiddenWord, removeHiddenWord } = useSettings();
  const [draft, setDraft] = useState('');

  const add = () => {
    if (!draft.trim()) return;
    tapLight();
    addHiddenWord(draft);
    setDraft('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Hidden words" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled">
          <Text style={[styles.intro, { color: colors.textMuted }]}>
            Comments containing any of these words are hidden from your plates and Platos. Only you
            can see this list, and the person who commented isn't told.
          </Text>

          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a word or phrase"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              onSubmitEditing={add}
              returnKeyType="done"
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            />
            <Button label="Add" onPress={add} disabled={!draft.trim()} style={{ height: 46 }} />
          </View>

          {hiddenWords.length > 0 ? (
            <SettingsSection title={`${hiddenWords.length} hidden`}>
              {hiddenWords.map((w, i) => (
                <View
                  key={w}
                  style={[
                    styles.row,
                    i < hiddenWords.length - 1 && {
                      borderBottomColor: colors.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <Text style={[styles.word, { color: colors.text }]}>{w}</Text>
                  <Pressable onPress={() => removeHiddenWord(w)} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </SettingsSection>
          ) : (
            <Text style={[styles.blank, { color: colors.textMuted }]}>
              Nothing hidden yet.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginBottom: spacing.lg },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: spacing.xl },
  input: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '500',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  word: { flex: 1, fontSize: 15, fontWeight: '600' },
  blank: { textAlign: 'center', marginTop: 20, fontSize: 14, fontWeight: '500' },
});
