import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { CalendarItem } from '@timeblock/core/calendar/assemble';
import { parseView } from '@timeblock/core/calendar/views';
import { deleteBlock, moveBlockTo, tick, unpinBlock } from '@timeblock/core/operations/plan';
import { vacationConflicts, type Conflict, type ConflictTarget } from '@timeblock/core/calendar/vacation-conflicts';
import { deleteDuringVacation, deleteGoogleEvent, removeVacation } from '@timeblock/core/operations/vacation';
import { chooseEventCategory, editEventTime } from '@timeblock/core/operations/events';
import { getSettings } from '@timeblock/core/store/settings';
import { getVacation } from '@timeblock/core/store/vacations';
import { formInputs } from '@timeblock/core/vacation';
import { setMark } from '@timeblock/core/store/event-marks';
import { invalidateGoogleReads, useCalendar } from '@/calendar/use-calendar';
import { forgetEvent } from '@/db/cache';
import { listCategories } from '@/db/queries';
import { hideEvent, showEvent } from '@/db/mutations';
import { env } from '@/env';
import { minutesLabel } from '@/format';
import { pickDayAndTime, pickTime, PICKERS_AVAILABLE } from '@/pickers';
import { useApp } from '@/state/app';
import { useTheme, type Theme } from '@/theme';
import { askRepeatScope, Button, Checkbox, Choice, confirm, Note, plural } from '@/ui';
import { useLoad } from '@/use-load';

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
      {item.kind === 'vacation' && item.vacation && <VacationDetails item={item} theme={theme} />}
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
    const picked = await pickDayAndTime({ date: item.start.toISODate()!, time: item.start.toFormat('HH:mm') });
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
          {PICKERS_AVAILABLE && <Button label="Move…" busy={busy === 'move'} disabled={busy !== null} onPress={move} />}
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

      <EventCategory item={item} theme={theme} />
      {item.writable && !item.allDay && <EventTime item={item} />}

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

      {item.multiDay && <VacationQuestion item={item} theme={theme} />}

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

/**
 * A multi-day event's one question: is it a vacation? Made into one, it stops
 * counting as busy and the vacation closes just the windows chosen; said not to
 * be, it stays as Google has it and is not asked about again.
 */
function VacationQuestion({ item, theme }: { item: CalendarItem; theme: Theme }) {
  const { changed } = useApp();
  const router = useRouter();
  const answer = async (not: boolean) => {
    await setMark(env().db, item.hideKey!, item.title, 'notVacation', not);
    changed();
  };

  if (item.madeVacationId !== null) {
    return (
      <View style={[styles.question, { borderColor: theme.border }]}>
        <Note>🏖 Made into a vacation — it no longer counts as busy; the vacation closes the windows you chose.</Note>
        <Button
          label="Open the vacation"
          onPress={() => router.push({ pathname: '/item', params: { id: `vacation:${item.madeVacationId}`, view: 'day', date: item.start.toISODate()! } })}
        />
      </View>
    );
  }
  const decided = item.notVacation || item.placeholder;
  const { from, until } = formInputs(item.start, item.end);
  return (
    <View style={[styles.question, { borderColor: decided ? theme.border : '#d97706' }]}>
      {decided ? (
        <Note>{item.notVacation ? 'Not a vacation, as you said' : 'A placeholder'} — it is not asked about again.</Note>
      ) : (
        <Text style={[styles.text, { color: theme.foreground }]}>
          Is this a vacation? Until you say, it {item.busy ? 'blocks every window while it lasts' : 'blocks nothing — it is marked free, so work may be planned into it'}.
        </Text>
      )}
      <Button
        label={`Make ${item.recurring ? 'this one' : 'it'} a vacation…`}
        onPress={() => router.push({ pathname: '/vacation', params: { from, until, note: item.title, source: item.occurrence! } })}
      />
      {!decided && <Button label={`Not a vacation${item.recurring ? ' (every repeat)' : ''}`} onPress={() => answer(true)} />}
      {item.notVacation && <Button label="Ask again" onPress={() => answer(false)} />}
    </View>
  );
}

const targetOf = (value: string): ConflictTarget => JSON.parse(value) as ConflictTarget;

/** A vacation: the windows it closes, what is scheduled during it, and edit / delete. */
function VacationDetails({ item, theme }: { item: CalendarItem; theme: Theme }) {
  const app = useApp();
  const router = useRouter();
  const v = item.vacation!;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'good' | 'bad' | 'warn' } | null>(null);

  const { data: conflicts } = useLoad(async () => {
    const e = env();
    const [vacation, settings] = await Promise.all([getVacation(e.db, v.id), getSettings(e.db)]);
    return vacation ? vacationConflicts(e, vacation, settings) : null;
  }, [app.version, v.id]);

  const items = conflicts?.items ?? [];
  const live = new Set(items.map((i) => i.value));
  const chosen = [...picked].filter((value) => live.has(value));
  const deletable = items.filter((i) => i.deletable);
  const toggle = (value: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const deleteChosen = async () => {
    const chosenItems = chosen.map((value) => items.find((i) => i.value === value)!);
    const inGoogle = chosenItems.filter((i) => i.kind === 'event').length;
    const ok = await confirm(
      `Delete ${plural(chosen.length, 'item')}?`,
      `${inGoogle > 0 ? `${inGoogle} of them will be deleted from Google Calendar. ` : ''}This cannot be undone here.`,
      'Delete',
    );
    if (!ok) return;
    setBusy('cleanup');
    setMessage(null);
    try {
      const result = await deleteDuringVacation(
        env(),
        chosenItems.map((i) => ({ target: targetOf(i.value), title: i.title })),
      );
      for (const i of chosenItems) {
        const t = targetOf(i.value);
        if (t.kind === 'event') forgetEvent(t.calendarId, t.eventId);
      }
      setPicked(new Set());
      setMessage({
        text: `Deleted ${result.deleted}.${result.failed.map((f) => ` Could not delete “${f.title}”: ${f.message}.`).join('')}`,
        tone: result.failed.length > 0 ? 'warn' : 'good',
      });
      app.changed();
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!(await confirm('Delete this vacation?', 'Its windows open again for planning.', 'Delete'))) return;
    setBusy('delete');
    try {
      await removeVacation(env(), v.id);
      app.changed();
      router.back();
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: 'bad' });
      setBusy(null);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.foreground }]}>Unavailable for</Text>
      <Text style={[styles.text, { color: theme.foreground }]}>{v.windows.length > 0 ? v.windows.join(', ') : 'no windows'}</Text>
      <Note>Nothing is planned in these windows while you are away; other windows work as usual.</Note>
      <Note>
        {v.inGoogle && v.inGoogleNow
          ? '📅 Also in Google Calendar (TimeBlock — Focus).'
          : v.inGoogle
            ? '📅 Meant to be in Google Calendar, but not there yet — save it again to retry.'
            : 'Not in Google Calendar — turn on “Also show in Google Calendar” under Edit to add it.'}
      </Note>

      <View style={styles.inlineHeading}>
        <Text style={[styles.heading, { color: theme.foreground, flex: 1 }]}>Scheduled during it ({items.length})</Text>
        {deletable.length > 0 && (
          <>
            <Text style={[styles.link, { color: theme.accent }]} onPress={() => setPicked(new Set(deletable.map((i) => i.value)))}>
              all
            </Text>
            <Text style={[styles.link, { color: theme.accent }]} onPress={() => setPicked(new Set())}>
              none
            </Text>
          </>
        )}
      </View>
      {!conflicts && <Note>Looking…</Note>}
      {conflicts?.problem && <Note tone="warn">Google Calendar could not be read, so only TimeBlock blocks are listed: {conflicts.problem}</Note>}
      {conflicts && items.length === 0 && <Note>Nothing is scheduled during it.</Note>}
      {items.map((i: Conflict) => (
        <Checkbox
          key={i.value}
          checked={chosen.includes(i.value)}
          onPress={() => toggle(i.value)}
          disabled={!i.deletable}
          label={i.title}
          detail={`${i.when} · ${i.source}${i.recurring ? ' · this repeat only' : ''}${i.why ? ` · ${i.why}` : ''}`}
          color={i.color}
          strike={false}
        />
      ))}
      {items.length > 0 && (
        <Button
          label={chosen.length > 0 ? `Delete ${chosen.length} selected` : 'Tick what to delete'}
          danger
          busy={busy === 'cleanup'}
          disabled={chosen.length === 0 || busy !== null}
          onPress={deleteChosen}
        />
      )}
      {message && <Note tone={message.tone}>{message.text}</Note>}

      <Button label="Edit dates, windows or note" onPress={() => router.push({ pathname: '/vacation', params: { id: String(v.id) } })} />
      <Button label="Delete vacation" danger busy={busy === 'delete'} disabled={busy !== null} onPress={remove} />
      <Note>After a change, run Reschedule… (Plan) to move work planned into it.</Note>
    </View>
  );
}

/**
 * The event's category: by its title words, one chosen by hand (on the series,
 * so every repeat follows), or none. Its colour follows here and in Google.
 */
function EventCategory({ item, theme }: { item: CalendarItem; theme: Theme }) {
  const { changed } = useApp();
  const [warning, setWarning] = useState<string | null>(null);
  const categories = listCategories();
  const value = item.categorySource === 'chosen' ? (item.category ? String(item.category.id) : 'none') : 'rules';
  const choose = async (choice: string) => {
    setWarning(await chooseEventCategory(env(), item.hideKey!, item.title, choice === 'none' || choice === 'rules' ? choice : Number(choice)));
    changed();
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.heading, { color: theme.foreground }]}>Category</Text>
      <Choice
        value={value}
        title="Category"
        onChange={(choice) => void choose(choice)}
        options={[
          { value: 'rules', label: `By title words${item.categorySource === 'rule' && item.category ? ` (${item.category.name})` : ' (none matches)'}` },
          ...categories.map((c) => ({ value: String(c.id), label: c.name })),
          { value: 'none', label: 'No category' },
        ]}
      />
      <Note>
        Its colour follows the category, here and in Google Calendar{item.recurring ? ' — for every repeat' : ''}. Categories are set up in Settings.
      </Note>
      {warning && <Note tone="warn">{warning}</Note>}
    </View>
  );
}

/**
 * Moves the event: a new day and start (one picker after the other), then its
 * end. A repeating event asks whether only this occurrence moves, or this and
 * every following one.
 */
function EventTime({ item }: { item: CalendarItem }) {
  const { changed } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const edit = async () => {
    const start = await pickDayAndTime({ date: item.start.toISODate()!, time: item.start.toFormat('HH:mm') });
    if (!start) return;
    const length = item.end.diff(item.start, 'minutes').minutes;
    const proposedEnd = item.start.set({ hour: Number(start.time.slice(0, 2)), minute: Number(start.time.slice(3, 5)) }).plus({ minutes: length });
    const endTime = await pickTime(proposedEnd.toFormat('HH:mm'), { minuteInterval: 5 });
    if (!endTime) return;
    const scope = item.recurring ? await askRepeatScope(item.title) : 'this';
    if (!scope) return;
    setBusy(true);
    setProblem(null);
    try {
      await editEventTime(env(), {
        calendarId: item.calendarId!,
        eventId: item.eventId!,
        seriesId: item.seriesId!,
        date: start.date,
        startTime: start.time,
        endTime,
        scope,
      });
      invalidateGoogleReads();
      changed();
      router.back();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      {PICKERS_AVAILABLE && <Button label="Edit time…" busy={busy} onPress={edit} />}
      <Note>Changed in Google Calendar. Run Reschedule… (Plan) afterwards if planned work is in the way.</Note>
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
  question: { gap: 8, borderWidth: 1, borderRadius: 10, padding: 12 },
  inlineHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  link: { fontSize: 13, fontWeight: '600' },
  rowLabel: { fontSize: 15, fontWeight: '600' },
});
