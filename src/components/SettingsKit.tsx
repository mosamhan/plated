import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { tick } from '@/lib/haptics';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The shared pieces every settings screen is built from.
 *
 * Lifted out of `settings/index.tsx` once there was more than one screen: the
 * rows had been redefined per-screen, which is how a settings section ends up
 * with three slightly different row heights and two different chevrons.
 */

export function SettingsSection({
  title,
  footer,
  children,
}: {
  title?: string;
  /** Explanatory text under the card — where a setting needs a sentence. */
  footer?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      {!!title && (
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
      )}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
      {!!footer && <Text style={[styles.footer, { color: colors.textMuted }]}>{footer}</Text>}
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  value,
  description,
  onPress,
  destructive,
  accent,
  last,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  destructive?: boolean;
  /** For affirmative actions that aren't destructive ("Add account"). */
  accent?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const tint = destructive ? colors.ratingLow : accent ? colors.accent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      {icon && <Ionicons name={icon} size={20} color={tint} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
        {!!description && (
          <Text style={[styles.rowDescription, { color: colors.textMuted }]}>{description}</Text>
        )}
      </View>
      {!!value && <Text style={[styles.rowValue, { color: colors.textMuted }]}>{value}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

export function SettingsToggle({
  icon,
  label,
  description,
  value,
  onValueChange,
  last,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}>
      {icon && <Ionicons name={icon} size={20} color={colors.text} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {!!description && (
          <Text style={[styles.rowDescription, { color: colors.textMuted }]}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          tick();
          onValueChange(next);
        }}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

/** A radio list — one choice from a few, the shape most audience settings take. */
export function SettingsChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; description?: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tick();
              onChange(o.value);
            }}
            style={({ pressed }) => [
              styles.row,
              i < options.length - 1 && {
                borderBottomColor: colors.border,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
              { opacity: pressed ? 0.7 : 1 },
            ]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>{o.label}</Text>
              {!!o.description && (
                <Text style={[styles.rowDescription, { color: colors.textMuted }]}>{o.description}</Text>
              )}
            </View>
            <Ionicons
              name={on ? 'radio-button-on' : 'radio-button-off'}
              size={21}
              color={on ? colors.accent : colors.border}
            />
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  footer: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 8, marginHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowDescription: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 2 },
  rowValue: { fontSize: 14, fontWeight: '500' },
});
