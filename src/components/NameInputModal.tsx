import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  /** Pre-fills the field — pass the current name when renaming. */
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/**
 * Single-field name prompt. Used for creating a collection and for renaming one
 * — Alert.prompt is iOS-only and a no-op on web, so this is the portable path.
 */
export function NameInputModal({
  visible,
  title,
  placeholder = 'Name',
  initialValue = '',
  submitLabel = 'Save',
  onSubmit,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);

  // Reopening for a different list must not show the previous one's name.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The field autofocuses, so the keyboard would otherwise cover this
          sheet's input and its submit button entirely. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={styles.backdropFill} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>{title}</Text>
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={submit}
            returnKeyType="done"
            maxLength={60}
            style={[
              styles.input,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
          <Button
            label={submitLabel}
            size="lg"
            style={{ marginTop: 16 }}
            disabled={!value.trim()}
            onPress={submit}
          />
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropFill: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 14 },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
  },
});
