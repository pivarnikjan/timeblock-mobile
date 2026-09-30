import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { CalendarItem } from '@timeblock/core/calendar/assemble';
import { parseView } from '@timeblock/core/calendar/views';
import { deleteBlock, moveBlockTo, tick, unpinBlock } from '@timeblock/core/operations/plan';
import { deleteGoogleEvent } from '@timeblock/core/operations/vacation';
import { setMark } from '@timeblock/core/store/event-marks';
import { useCalendar } from '@/calendar/use-calendar';
import { forgetEvent } from '@/db/cache';
import { hideEvent, showEvent } from '@/db/mutations';
import { env } from '@/env';
import { minutesLabel } from '@/format';
import { useApp } from '@/state/app';
import { useTheme, type Theme } from '@/theme';
import { Button, confirm, Note } from '@/ui';

/** One calendar item in full: a block's work to tick off, an event's marks, a vacation's span. */
export default function ItemScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string; view: string; date: string }>();
  const { layout } = useCalendar(parseView(params.view) ?? 'day', params.date);
  const item = layout.items.find((i) => i.id === params.id);

  if (!item) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.muted }}>This is no longer on the calendar — it may have changed on the desktop.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: item.kind === 'block' ? 'Focus block' : item.kind === 'vacation' ? 'Vacation' : 'Event' }} />
      <View style={styles.titleRow}>
        <View style={[styles.swatch, { backgroundColor: item.color }]} />
        <Text style={[styles.title, { color: theme.foreground }]}>{item.title}</Text>
      </View>
      <Text style={[styles.when, { color: theme.muted }]}>{whenLabel(item)}</Text>

      {item.kind === 'block' && <BlockDetails item={item} theme={theme} />}
      {item.kind === 'event' && <EventDetails item={item} theme={theme} />}
      {item.kind === 'vacation' && item.vacation && (
        <View style={styles.section}>
          <Text style={[styles.text, { color: theme.foreground }]}>
            Closes {item.vacation.windows.length > 0 ? item.vacation.windows.join(', ') : 'no windows'} — nothing is planned in them while you are away.
          </Text>
          {item.vacation.inGoogle && <Text style={[styles.note, { color: theme.muted }]}>Also in Google Calendar.</Text>}
          <Text style={[styles.note, { color: theme.muted }]}>Change it on the desktop.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function whenLabel(item: CalendarItem): string {
  const span = item.vacation ?? item;
  if (item.allDay) {
    const last = span.end.minus({ milliseconds: 1 });
    return span.start.hasSame(last, 'day') ? span.start.toFormat('cccc d LLLL') : `${span.start.toFormat('ccc d LLL')} – ${last.toFormat('ccc d LLL')}`;
  }
  if (span.start.hasSame(span.end.minus({ milliseconds: 1 }), 'day')) {
    return `${span.start.toFormat('cccc d LLLL')} · ${span.start.toFormat('HH:mm')} – ${span.end.toFormat('HH:mm')}`;
  }
  return `${span.start.toFormat('ccc d LLL HH:mm')} – ${span.end.toFormat('ccc d LLL HH:mm')}`;
}

const STATE_LABEL = {
  draft: 'Draft — not yet in Google Calendar (commit it from Plan or My day)',
  synced: 'In Google Calendar',
  done: 'Done',
} as const;

/**
 * Asks for a day, then a start time (Android's own pickers), in the wall-clock
 * time of the Settings timezone — which the pickers show as if it were the
 * phone's. Resolves to `YYYY-MM-DD` and `HH:mm`, or null when cancelled.
 */
function pickDayAndTime(start: CalendarItem['start']): Promise<{ date: string; time: string } | null> {
  const initial = new Date(start.year, start.month - 1, start.day, start.hour, start.minute);
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      onChange: (event, day) => {
        if (event.type !== 'set' || !day) return resolve(null);
        DateTimePickerAndroid.open({
          value: new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.hour, start.minute),
          mode: 'time',
          is24Hour: true,
          minuteInterval: 5,
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return resolve(null);
            const pad = (n: number) => String(n).padStart(2, '0');
            resolve({
              date: `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`,
              time: `${pad(time.getHours())}:${pad(time.getMinutes())}`,
            });
          },
        });
      },
    });
  });
}

function BlockDetails({ item, theme }: { item: CalendarItem; theme: Theme }) {
  const { changed } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const open = item.segments.filter((s) => !s.done).map((s) => s.id);
  const blockId = item.blockId!;

  const act = async (label: string, work: () => Promise<void>, leave = false) => {
    setBusy(label);
    setProblem(null);
    try {
      await work();
      changed();
      if (leave) router.back();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const move = async () => {
    const picked = await pickDayAndTime(item.start);
    if (picked) await act('move', () => moveBlockTo(env(), blockId, picked.date, picked.time), true);
  };

  const remove = async () => {
    const inGoogle = item.blockState === 'synced';
    const ok = await confirm(
      'Delete this block?',
      `${inGoogle ? 'Its Google Calendar event is deleted too. ' : ''}Its tasks are planned again next time.`,
      'Delete',
    );
    if (ok) await act('delete', () => deleteBlock(env(), blockId), true);
  };

  return (
    <View style={styles.section}>
      {item.blockState && <Text style={[styles.note, { color: theme.muted }]}>{STATE_LABEL[item.blockState]}</Text>}
      {item.pinned && <Text style={[styles.note, { color: theme.muted }]}>📌 Placed by hand — planning works around it.</Text>}

      <Text style={[styles.heading, { color: theme.foreground }]}>Work in this block</Text>
      {item.segments.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => act(`tick-${s.id}`, () => tick(env(), [s.id], !s.done))}
          style={[styles.segment, { borderColor: theme.border, backgroundColor: theme.surface }]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: s.done }}
        >
          <View style={[styles.box, { borderColor: s.done ? theme.ok : theme.muted, backgroundColor: s.done ? theme.ok : 'transparent' }]}>
            {s.done && <Text style={styles.check}>✓</Text>}
          </View>
          <Text style={[styles.segmentTitle, { color: theme.foreground }, s.done && { textDecorationLine: 'line-through', color: theme.muted }]}>
            {s.title}
          </Text>
          <Text style={[styles.minutes, { color: theme.muted }]}>{minutesLabel(s.minutes)}</Text>
        </Pressable>
      ))}

      {open.length > 1 && <Button label="Mark all done" primary busy={busy === 'all'} onPress={() => act('all', () => tick(env(), open, true))} />}
      <Text style={[styles.note, { color: theme.muted }]}>
        Ticking work off moves its goals&apos; progress; a task is done once its ticked time reaches its estimate. It reaches the desktop with the next sync.
      </Text>

      {item.movable && (
        <>
          <Text style={[styles.heading, { color: theme.foreground }]}>Adjust</Text>
          {Platform.OS === 'android' && <Button label="Move…" busy={busy === 'move'} disabled={busy !== null} onPress={move} />}
          {item.pinned && <Button label="Unpin" busy={busy === 'unpin'} disabled={busy !== null} onPress={() => act('unpin', () => unpinBlock(env(), blockId))} />}
          <Button label="Delete block" danger busy={busy === 'delete'} disabled={busy !== null} onPress={remove} />
          <Note>
            A block you move is pinned (📌): the next plan works around it. Unpin hands it back to the planner.{' '}
            {item.blockState === 'synced' ? 'Its Google Calendar event follows.' : ''}
          </Note>
        </>
      )}
      {problem && <Note tone="bad">{problem}</Note>}
    </View>
  );
}

function EventDetails({ item, theme }: { item: CalendarItem; theme: Theme }) {
  const { changed } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const key = item.hideKey!;
  const toggle = async (field: 'important' | 'placeholder', on: boolean) => {
    await setMark(env().db, key, item.title, field, on);
    changed();
  };

  const remove = async () => {
    const ok = await confirm(
      'Delete from Google Calendar?',
      item.recurring ? 'Only this occurrence is deleted; the rest of the series stays.' : `“${item.title}” is deleted from ${item.calendarName ?? 'Google Calendar'}.`,
      'Delete',
    );
    if (!ok) return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteGoogleEvent(env(), item.calendarId!, item.eventId!);
      forgetEvent(item.calendarId!, item.eventId!);
      changed();
      router.back();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.text, { color: theme.foreground }]}>
        {item.calendarName ?? 'Google Calendar'}
        {item.recurring ? ' · repeats' : ''}
        {item.declined ? ' · declined' : !item.busy ? ' · free' : ''}
      </Text>

      <Row
        theme={theme}
        label="★ Important in Month view"
        hint="Always shown in Month, starred and in bold."
        value={item.important}
        onChange={(on) => void toggle('important', on)}
      />
      <Row
        theme={theme}
        label="Placeholder"
        hint="Time held, not taken: planning may schedule work during it."
        value={item.placeholder}
        onChange={(on) => void toggle('placeholder', on)}
      />
      <Row
        theme={theme}
        label="Show on the calendar"
        hint={item.recurring ? 'Hiding it hides every repeat.' : 'Hidden events are listed in Settings.'}
        value
        onChange={(on) => {
          if (on) showEvent(key);
          else hideEvent(key, item.title);
          changed();
        }}
      />

      {item.htmlLink && (
        <Pressable onPress={() => void Linking.openURL(item.htmlLink!)} style={[styles.button, { borderColor: theme.border, borderWidth: 1 }]}>
          <Text style={[styles.buttonText, { color: theme.accent }]}>Open in Google Calendar</Text>
        </Pressable>
      )}
      {item.eventId && item.calendarId && (
        item.writable ? (
          <Button label="Delete from Google Calendar" danger busy={busy} onPress={remove} />
        ) : (
          <Note>This calendar is read-only for you, so the event cannot be deleted here.</Note>
        )
      )}
      {problem && <Note tone="bad">{problem}</Note>}
    </View>
  );
}

function Row({ theme, label, hint, value, onChange }: { theme: Theme; label: string; hint: string; value: boolean; onChange(on: boolean): void }) {
  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: theme.foreground }]}>{label}</Text>
        <Text style={[styles.note, { color: theme.muted }]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 8, flexGrow: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  when: { fontSize: 14 },
  section: { gap: 10, marginTop: 8 },
  heading: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  text: { fontSize: 14 },
  note: { fontSize: 12, lineHeight: 17 },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#fff', fontWeight: '800', fontSize: 13 },
  segmentTitle: { flex: 1, fontSize: 15 },
  minutes: { fontSize: 13 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 10 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
});
