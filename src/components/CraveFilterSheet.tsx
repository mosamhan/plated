import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '@/components/TextField';
import { placeTypeFor, type PlaceType } from '@/lib/placeType';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The typed term matched one of Plated's cuisine buckets — apply it as the active filter. */
  onGuess: (type: PlaceType) => void;
  /** Didn't match a bucket — hand the raw term to full search rather than just failing. */
  onFallback: (term: string) => void;
}

/**
 * The cuisine row's "More" chip: free text in, a guessed category (or a
 * fallback to full search when nothing matches) out. Reuses `placeTypeFor` —
 * the same classifier search-intent logging already runs on — rather than
 * inventing a second guesser.
 */
export function CraveFilterSheet({ visible, onClose, onGuess, onFallback }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');

  const submit = () => {
    const q = term.trim();
    if (!q) return;
    const guessed = placeTypeFor(q);
    setTerm('');
    onClose();
    if (guessed !== 'other') onGuess(guessed);
    else onFallback(q);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>What are you craving?</Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Type anything — a dish, a cuisine, a mood — and we’ll match it to a category, or search everywhere for it.
          </Text>
          <TextField
            icon="restaurant-outline"
            value={term}
            onChangeText={setTerm}
            placeholder='e.g. "korean bbq", "late night ramen"'
            autoFocus
            returnKeyType="search"
            onSubmitEditing={submit}
          />
          <Pressable onPress={submit} style={[styles.go, { backgroundColor: colors.accent }]}>
            <Ionicons name="search" size={16} color={colors.accentText} />
            <Text style={[styles.goText, { color: colors.accentText }]}>Find it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: 12 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 16 },
  go: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: radius.pill },
  goText: { fontSize: 15, fontWeight: '800' },
});
