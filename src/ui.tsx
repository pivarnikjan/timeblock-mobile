import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
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

export function Checkbox({
  checked,
  onPress,
  label,
  detail,
  disabled,
  color,
  strike = true,
}: {
  checked: boolean;
  onPress(): void;
  label: string;
  detail?: string;
  disabled?: boolean;
  /** A colour swatch before the label (a window's, an event's). */
  color?: string;
  /** Strike the label through when ticked — for work done; off for choices. */
  strike?: boolean;
}) {
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
      {color && <View style={[ui.swatch, { backgroundColor: color }]} />}
      <Text style={[ui.text, { flex: 1, color: theme.foreground }, checked && strike && { color: theme.muted, textDecorationLine: 'line-through' }]}>{label}</Text>
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

/** A labelled form field. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={[ui.label, { color: theme.muted }]}>{label}</Text>
      {children}
      {hint && <Text style={[ui.note, { color: theme.muted }]}>{hint}</Text>}
    </View>
  );
}

/** A text input in the app's look. */
export function TextField(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      {...props}
      style={[ui.input, { color: theme.foreground, borderColor: theme.border, backgroundColor: theme.background }, props.style]}
    />
  );
}

export interface ChoiceOption<T> {
  value: T;
  label: string;
  /** Options with a group are listed under its heading. */
  group?: string;
  detail?: string;
}

/**
 * A select: shows the chosen option; tapping it lists the options (grouped
 * under headings when they have groups) and picks one.
 */
export function Choice<T>({
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  title,
}: {
  value: T | undefined;
  options: ChoiceOption<T>[];
  onChange(value: T): void;
  placeholder?: string;
  title?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[ui.input, ui.inline, { borderColor: theme.border, backgroundColor: theme.background }]}
      >
        <Text style={[ui.text, { flex: 1, color: chosen ? theme.foreground : theme.muted }]} numberOfLines={2}>
          {chosen?.label ?? placeholder}
        </Text>
        <Text style={{ color: theme.muted }}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={ui.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[ui.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => undefined}>
            {title && <Text style={[ui.sectionTitle, { color: theme.foreground }]}>{title}</Text>}
            <ScrollView style={{ maxHeight: 460 }}>
              {groups.map((group) => (
                <View key={group}>
                  {group !== '' && <Text style={[ui.label, { color: theme.muted, marginTop: 10, marginBottom: 2 }]}>{group}</Text>}
                  {options
                    .filter((o) => (o.group ?? '') === group)
                    .map((o) => (
                      <Pressable
                        key={String(o.value)}
                        onPress={() => {
                          onChange(o.value);
                          setOpen(false);
                        }}
                        style={({ pressed }) => [ui.option, { backgroundColor: o.value === value ? theme.background : pressed ? theme.border : 'transparent' }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: o.value === value }}
                      >
                        <Text style={[ui.text, { color: theme.foreground, fontWeight: o.value === value ? '700' : '400' }]}>{o.label}</Text>
                        {o.detail && <Text style={[ui.note, { color: theme.muted }]}>{o.detail}</Text>}
                      </Pressable>
                    ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** A row of buttons of which one is on — a status, a view. */
export function Segments<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange(value: T): void }) {
  const theme = useTheme();
  return (
    <View style={[ui.segments, { borderColor: theme.border }]}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[ui.segment, o.value === value && { backgroundColor: theme.accent }]}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
        >
          <Text style={[ui.segmentText, { color: o.value === value ? '#fff' : theme.foreground }]}>{o.label}</Text>
        </Pressable>
      ))}
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

/**
 * Asks how far a change to a repeating event reaches: this occurrence, this and
 * every following one, or nothing (cancelled → null).
 */
export function askRepeatScope(title: string): Promise<'this' | 'following' | null> {
  if (Platform.OS === 'web') {
    if (!window.confirm(`${title}

OK: this and all following events. Cancel: choose again.`)) {
      return Promise.resolve(window.confirm('Change only this event?') ? 'this' : null);
    }
    return Promise.resolve('following');
  }
  return new Promise((resolve) =>
    Alert.alert(title, 'It repeats. Change only this event, or this one and every following one?', [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'This event', onPress: () => resolve('this') },
      { text: 'This and following', onPress: () => resolve('following') },
    ], { cancelable: true, onDismiss: () => resolve(null) }),
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  sheet: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  option: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden', alignSelf: 'flex-start' },
  segment: { paddingHorizontal: 12, paddingVertical: 7 },
  segmentText: { fontSize: 13, fontWeight: '600' },
});
