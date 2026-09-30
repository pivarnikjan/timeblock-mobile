import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { formatMinutes, type Progress } from '@timeblock/core/hierarchy';
import { useTheme, type Theme } from '@/theme';

/** The pieces every screen is built from, in the desktop's look: cards, buttons, notes. */

export function Section({ title, children, tone }: { title?: string; children: ReactNode; tone?: 'accent' }) {
  const theme = useTheme();
  return (
    <View style={[ui.section, { backgroundColor: theme.surface, borderColor: tone === 'accent' ? theme.accent : theme.border }]}>
      {title && <Text style={[ui.sectionTitle, { color: theme.foreground }]}>{title}</Text>}
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  primary,
  danger,
  disabled,
  busy,
}: {
  label: string;
  onPress(): void | Promise<void>;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  const theme = useTheme();
  const filled = primary || danger;
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={() => void onPress()}
      accessibilityRole="button"
      style={({ pressed }) => [
        ui.button,
        filled ? { backgroundColor: danger ? theme.danger : theme.accent } : { borderWidth: 1, borderColor: theme.border },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={filled ? '#fff' : theme.accent} />
      ) : (
        <Text style={[ui.buttonText, { color: filled ? '#fff' : theme.foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ToggleRow({ label, value, onChange, color, hint }: { label: string; value: boolean; onChange(on: boolean): void; color?: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={ui.inline}>
      {color && <View style={[ui.swatch, { backgroundColor: color }]} />}
      <View style={{ flex: 1 }}>
        <Text style={[ui.text, { color: theme.foreground }]} numberOfLines={1}>
          {label}
        </Text>
        {hint && <Text style={[ui.note, { color: theme.muted }]}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function Checkbox({ checked, onPress, label, detail, disabled }: { checked: boolean; onPress(): void; label: string; detail?: string; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[ui.checkRow, { opacity: disabled ? 0.5 : 1 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <View style={[ui.box, { borderColor: checked ? theme.ok : theme.muted, backgroundColor: checked ? theme.ok : 'transparent' }]}>
        {checked && <Text style={ui.check}>✓</Text>}
      </View>
      <Text style={[ui.text, { flex: 1, color: theme.foreground }, checked && { color: theme.muted, textDecorationLine: 'line-through' }]}>{label}</Text>
      {detail && <Text style={[ui.note, { color: theme.muted }]}>{detail}</Text>}
    </Pressable>
  );
}

export function Note({ children, tone }: { children: ReactNode; tone?: 'bad' | 'good' | 'warn' }) {
  const theme = useTheme();
  const color = tone === 'bad' ? theme.danger : tone === 'good' ? theme.ok : tone === 'warn' ? '#d97706' : theme.muted;
  return <Text style={[ui.note, { color }]}>{children}</Text>;
}

export function Body({ children, tone }: { children: ReactNode; tone?: 'bad' | 'good' | 'muted' }) {
  const theme = useTheme();
  const color = tone === 'bad' ? theme.danger : tone === 'good' ? theme.ok : tone === 'muted' ? theme.muted : theme.foreground;
  return <Text style={[ui.text, { color }]}>{children}</Text>;
}

export function Chip({ label, color }: { label: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={[ui.chip, { borderColor: color ?? theme.border }]}>
      <Text style={[ui.chipText, { color: color ?? theme.muted }]}>{label}</Text>
    </View>
  );
}

/** A progress bar: `ratio` 0…1. */
export function Bar({ ratio, color }: { ratio: number; color?: string }) {
  const theme = useTheme();
  return (
    <View style={[ui.bar, { backgroundColor: theme.border }]}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`, height: '100%', backgroundColor: color ?? theme.accent, borderRadius: 3 }} />
    </View>
  );
}

/**
 * A goal's progress, as the desktop shows it: the bar is the equal-weight
 * roll-up; the line underneath counts what sits in its subtree.
 */
export function ProgressBar({ progress, compact }: { progress: Progress | undefined; compact?: boolean }) {
  const theme = useTheme();
  const ratio = progress?.ratio ?? null;
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  return (
    <View style={{ gap: 2 }}>
      <View style={ui.inline}>
        <View style={{ flex: 1 }}>
          <Bar ratio={pct / 100} color={pct >= 100 ? theme.ok : theme.accent} />
        </View>
        <Text style={[ui.note, { color: theme.muted, minWidth: 34, textAlign: 'right' }]}>{ratio === null ? '—' : `${pct}%`}</Text>
      </View>
      {!compact && progress && (
        <Text style={[ui.note, { color: theme.muted }]}>
          {progress.totalTasks === 0
            ? 'nothing planned yet'
            : `${progress.doneTasks}/${progress.totalTasks} tasks · ${formatMinutes(progress.doneMin)} of ${formatMinutes(progress.totalMin)}`}
        </Text>
      )}
    </View>
  );
}

/** Asks before something that cannot be undone; resolves true on the confirming button. */
export function confirm(title: string, message: string, action: string, destructive = true): Promise<boolean> {
  // react-native-web has no Alert; the browser preview asks the browser's way.
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}

${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export type { Theme };

export const ui = StyleSheet.create({
  screen: { padding: 12, gap: 12 },
  section: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  button: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  buttonText: { fontWeight: '700', fontSize: 14 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontSize: 11, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
});
