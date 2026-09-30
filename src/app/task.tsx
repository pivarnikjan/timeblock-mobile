import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { ENERGY, type Task } from '@timeblock/core/db/schema';
import { breadcrumb, formatMinutes, indexHorizons } from '@timeblock/core/hierarchy';
import { listAllHorizons } from '@timeblock/core/store/horizons';
import { getSettings } from '@timeblock/core/store/settings';
import { createTask, deleteTask, getTask, setTaskStatus, updateTask } from '@timeblock/core/store/tasks';
import { listWindows } from '@timeblock/core/store/windows';
import { parseDuration } from '@timeblock/core/time/duration';
import { nowIn } from '@timeblock/core/time/periods';
import { env } from '@/env';
import { pickDate, PICKERS_AVAILABLE } from '@/pickers';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, Choice, confirm, Field, Note, Section, Segments, TextField, ui } from '@/ui';
import { useLoad } from '@/use-load';

const PRIORITIES = [
  { value: 1, label: '1 — must happen' },
  { value: 2, label: '2 — important' },
  { value: 3, label: '3 — normal' },
  { value: 4, label: '4 — someday' },
];

const ENERGY_LABEL: Record<(typeof ENERGY)[number], string> = {
  deep: 'Deep — needs a long, quiet slot',
  shallow: 'Shallow — fine between meetings',
  admin: 'Admin — fill the fragments',
};

interface Draft {
  title: string;
  estimate: string;
  priority: number;
  energy: Task['energy'];
  dueDate: string | null;
  horizonId: number | null;
  windowId: number | null;
  sequential: boolean;
  notes: string;
}

/**
 * Capture or edit a task — the desktop's Tasks form: estimate, priority,
 * energy, due date, which goal it serves (a week priority is scheduled from its
 * Monday, a month outcome holds it as backlog), time window, sequential
 * session, notes. Editing adds its status and Delete.
 *
 * Params: `id` to edit; `horizonId` to capture one under a goal.
 */
export default function TaskScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const params = useLocalSearchParams<{ id?: string; horizonId?: string }>();
  const editing = params.id ? Number(params.id) : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { data } = useLoad(async () => {
    const { db } = env();
    const [settings, horizons, windows, existing] = await Promise.all([
      getSettings(db),
      listAllHorizons(db),
      listWindows(db),
      editing ? getTask(db, editing) : Promise.resolve(undefined),
    ]);
    const today = nowIn(settings.timezone).toISODate()!;
    const byId = indexHorizons(horizons);
    // A task serves one week priority or one month outcome — current and future ones, plus the one it has.
    const live = horizons.filter((h) => (h.status === 'active' && h.periodEnd >= today) || h.id === existing?.horizonId);
    const goals = [
      ...live.filter((h) => h.level === 'week').map((h) => ({ h, group: 'Week priorities — scheduled from their Monday' })),
      ...live.filter((h) => h.level === 'month').map((h) => ({ h, group: 'Month outcomes — backlog until moved into a week' })),
      ...live.filter((h) => h.level === 'year' && h.id === existing?.horizonId).map((h) => ({ h, group: 'Yearly goal' })),
    ].map(({ h, group }) => ({ value: h.id as number | null, label: breadcrumb(h.id, byId).slice(1).join(' › ') || h.title, group }));
    const initial: Draft = {
      title: existing?.title ?? '',
      estimate: existing ? String(existing.estimateMin) : '60',
      priority: existing?.priority ?? 3,
      energy: existing?.energy ?? 'deep',
      dueDate: existing?.dueDate ?? null,
      horizonId: existing ? existing.horizonId : params.horizonId ? Number(params.horizonId) : null,
      windowId: existing?.windowId ?? null,
      sequential: existing?.sequential ?? false,
      notes: existing?.notes ?? '',
    };
    return { existing, goals, windows, today, initial, missing: editing !== null && !existing };
  }, [editing, app.version]);

  if (!data) return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  if (data.missing) {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.background }]}>
        <Body tone="muted">This task no longer exists — it may have been deleted on the desktop.</Body>
      </View>
    );
  }

  const { existing } = data;
  const form = draft ?? data.initial;
  const set = (patch: Partial<Draft>) => setDraft({ ...form, ...patch });
  const minutes = parseDuration(form.estimate);

  const act = async (work: () => Promise<void>, leave = true) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      app.changed();
      if (leave) router.back();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (form.title.trim() === '') return setProblem('What needs doing?');
    if (minutes === null) return setProblem(`Could not read "${form.estimate}" as a duration (e.g. 45, 45m, 1h 30m).`);
    const values = {
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      horizonId: form.horizonId,
      estimateMin: minutes,
      priority: form.priority,
      energy: form.energy,
      dueDate: form.dueDate,
      windowId: form.windowId,
      sequential: form.sequential,
    };
    return act(async () => {
      if (existing) await updateTask(env().db, existing.id, values);
      else await createTask(env().db, { ...values, status: 'backlog' });
    });
  };

  const chooseDue = async () => {
    const picked = await pickDate(form.dueDate ?? data.today);
    if (picked) set({ dueDate: picked });
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Edit task' : 'Capture a task' }} />
      <Section>
        <Field label="Task">
          <TextField value={form.title} onChangeText={(title) => set({ title })} placeholder="What needs doing?" />
        </Field>
        <Field label="Estimate" hint={minutes !== null ? formatMinutes(minutes) : 'e.g. 45, 45m, 1h 30m, 1:30'}>
          <TextField value={form.estimate} onChangeText={(estimate) => set({ estimate })} />
        </Field>
        <Field label="Priority">
          <Choice value={form.priority} onChange={(priority) => set({ priority })} options={PRIORITIES} />
        </Field>
        <Field label="Energy">
          <Choice value={form.energy} onChange={(energy) => set({ energy })} options={ENERGY.map((e) => ({ value: e, label: ENERGY_LABEL[e] }))} />
        </Field>
        <Field label="Due date">
          <View style={ui.inline}>
            {PICKERS_AVAILABLE ? (
              <Pressable onPress={() => void chooseDue()} style={[ui.input, { flex: 1, borderColor: theme.border, backgroundColor: theme.background }]} accessibilityRole="button">
                <Text style={[ui.text, { color: form.dueDate ? theme.foreground : theme.muted }]}>
                  {form.dueDate ? DateTime.fromISO(form.dueDate).toFormat('cccc d LLLL yyyy') : 'None'}
                </Text>
              </Pressable>
            ) : (
              <TextField value={form.dueDate ?? ''} onChangeText={(v) => set({ dueDate: v.trim() || null })} placeholder="YYYY-MM-DD" style={{ flex: 1 }} />
            )}
            {form.dueDate && <Button label="Clear" onPress={() => set({ dueDate: null })} />}
          </View>
        </Field>
        <Field label="Serves which goal?">
          <Choice
            value={form.horizonId}
            onChange={(horizonId) => set({ horizonId })}
            options={[{ value: null as number | null, label: '— not connected —' }, ...data.goals]}
          />
        </Field>
        <Field label="Time window">
          <Choice
            value={form.windowId}
            onChange={(windowId) => set({ windowId })}
            options={[{ value: null as number | null, label: 'Inherit' }, ...data.windows.map((w) => ({ value: w.id as number | null, label: `${w.name} (${w.startTime}–${w.endTime})` }))]}
          />
        </Field>
        <View style={ui.inline}>
          <View style={{ flex: 1 }}>
            <Body>Sequential session</Body>
            <Note>
              Like a training plan: never two on one day, never before the one ahead of it is done, and a week&apos;s sessions all within one week — an
              interrupted week starts again from its first session.
            </Note>
          </View>
          <Switch value={form.sequential} onValueChange={(sequential) => set({ sequential })} />
        </View>
        <Field label="Notes">
          <TextField value={form.notes} onChangeText={(notes) => set({ notes })} multiline style={{ minHeight: 64, textAlignVertical: 'top' }} />
        </Field>
        <Button label={existing ? 'Save' : 'Add task'} primary busy={busy} onPress={save} />
        {problem && <Body tone="bad">{problem}</Body>}
      </Section>

      {existing && (
        <Section title="Status">
          <Segments
            value={existing.status}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'backlog', label: 'Backlog' },
              { value: 'done', label: 'Done' },
              { value: 'dropped', label: 'Dropped' },
            ]}
            onChange={(status) => act(() => setTaskStatus(env().db, existing.id, status), false)}
          />
          <Note>Active work is schedulable today; backlog waits for its week. Done counts in full towards progress.</Note>
          <Button
            label="Delete"
            danger
            disabled={busy}
            onPress={async () => {
              if (await confirm('Delete this task?', 'Its planned blocks go too (ticked-off ones stay as history).', 'Delete')) {
                await act(() => deleteTask(env().db, existing.id));
              }
            }}
          />
        </Section>
      )}
    </ScrollView>
  );
}
