import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Horizon } from '@timeblock/core/db/schema';
import { addHorizon, editHorizon } from '@timeblock/core/operations/horizons';
import { deleteHorizon, listAllHorizons, updateHorizon } from '@timeblock/core/store/horizons';
import { listWindows } from '@timeblock/core/store/windows';
import { reviewParentLevel, type Level } from '@timeblock/core/time/periods';
import { env } from '@/env';
import { weekLabel } from '@/planning/tree';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, Choice, confirm, Field, Note, Section, Segments, TextField, ui } from '@/ui';
import { useLoad } from '@/use-load';

const NOUN: Record<string, string> = { year: 'yearly goal', month: 'monthly outcome', week: 'weekly priority' };
const PLACEHOLDER: Record<string, string> = { year: 'CIS-ITSM Certification', month: 'ServiceNow ITSM Fundamentals', week: 'IT Service Management' };
const STANDALONE = 'standalone';

interface Draft {
  title: string;
  description: string;
  /** A parent's id, STANDALONE on purpose, or undefined while not chosen yet. */
  parent: number | typeof STANDALONE | undefined;
  windowId: number | null;
  untilYear: number;
}

/**
 * Add or edit a yearly goal, monthly outcome or weekly priority — the desktop's
 * form: the outcome, which goal it serves (an explicit choice, "No parent" on
 * purpose included), the time window everything below inherits, how many years
 * a yearly goal runs, and why it matters. Editing adds its status and Delete.
 *
 * Params: `id` to edit; `level`, `periodStart`, `periodEnd` for a new one.
 */
export default function HorizonScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const params = useLocalSearchParams<{ id?: string; level?: string; periodStart?: string; periodEnd?: string }>();
  const editing = params.id ? Number(params.id) : null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { data } = useLoad(async () => {
    const { db } = env();
    const [horizons, windows] = await Promise.all([listAllHorizons(db), listWindows(db)]);
    const existing = editing ? (horizons.find((h) => h.id === editing) ?? null) : null;
    const level = (existing?.level ?? params.level ?? 'week') as Level;
    const periodStart = existing?.periodStart ?? params.periodStart ?? '';
    const periodEnd = existing?.periodEnd ?? params.periodEnd ?? '';
    const parentLevel = reviewParentLevel(level);
    const parents = parentLevel
      ? horizons.filter((h) => h.level === parentLevel && h.status !== 'dropped' && h.periodStart <= periodEnd && h.periodEnd >= periodStart)
      : [];
    const initial: Draft = {
      title: existing?.title ?? '',
      description: existing?.description ?? '',
      parent: existing ? (existing.parentId ?? STANDALONE) : undefined,
      windowId: existing?.windowId ?? null,
      untilYear: Number((existing?.periodEnd ?? periodEnd).slice(0, 4)),
    };
    return { existing, level, periodStart, periodEnd, parentLevel, parents, windows, initial, missing: editing !== null && !existing };
  }, [editing, app.version]);

  if (!data) return <View style={{ flex: 1, backgroundColor: theme.background }} />;
  if (data.missing) {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.background }]}>
        <Body tone="muted">This no longer exists — it may have been deleted on the desktop.</Body>
      </View>
    );
  }

  const { existing, level, parentLevel } = data;
  const form = draft ?? data.initial;
  const set = (patch: Partial<Draft>) => setDraft({ ...form, ...patch });
  const firstYear = Number(data.periodStart.slice(0, 4));
  const noun = NOUN[level];

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
    if (form.title.trim() === '') return setProblem('Give it a title.');
    if (parentLevel && form.parent === undefined) return setProblem(`Choose which ${parentLevel === 'year' ? 'yearly goal' : 'monthly outcome'} it serves, or No parent.`);
    const parentId = form.parent === STANDALONE || form.parent === undefined ? null : form.parent;
    const values = { title: form.title.trim(), description: form.description.trim() || null, parentId, windowId: form.windowId };
    const untilYear = level === 'year' ? form.untilYear : undefined;
    return act(async () => {
      if (existing) await editHorizon(env().db, existing.id, values, untilYear);
      else await addHorizon(env().db, { ...values, level, periodStart: data.periodStart, periodEnd: data.periodEnd }, untilYear);
    });
  };

  const parentLabel = (h: Horizon) => `${h.level === 'week' ? `${weekLabel(h.periodStart)} · ` : ''}${h.title}`;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? `Edit ${noun}` : `Add a ${noun}` }} />
      <Section>
        <Field label="Outcome">
          <TextField value={form.title} onChangeText={(title) => set({ title })} placeholder={`e.g. ${PLACEHOLDER[level]}`} />
        </Field>
        {parentLevel && (
          <Field label={`Serves which ${parentLevel === 'year' ? 'yearly goal' : 'monthly outcome'}?`}>
            <Choice
              value={form.parent}
              onChange={(parent) => set({ parent })}
              placeholder="Choose…"
              options={[...data.parents.map((h) => ({ value: h.id as number | typeof STANDALONE, label: parentLabel(h) })), { value: STANDALONE, label: 'No parent (standalone)' }]}
            />
          </Field>
        )}
        <Field label="Time window for everything below">
          <Choice
            value={form.windowId}
            onChange={(windowId) => set({ windowId })}
            options={[{ value: null as number | null, label: 'Inherit' }, ...data.windows.map((w) => ({ value: w.id as number | null, label: `${w.name} (${w.startTime}–${w.endTime})` }))]}
          />
        </Field>
        {level === 'year' && (
          <Field label="Runs until" hint="Running into a later year makes it one goal over both, and takes in a same-titled goal set for that year.">
            <Choice
              value={form.untilYear}
              onChange={(untilYear) => set({ untilYear })}
              options={Array.from({ length: 6 }, (_, i) => firstYear + i).map((y) => ({ value: y, label: y === firstYear ? `${y} (this year only)` : `end of ${y}` }))}
            />
          </Field>
        )}
        <Field label="Why it matters / what done looks like">
          <TextField value={form.description} onChangeText={(description) => set({ description })} multiline style={{ minHeight: 64, textAlignVertical: 'top' }} />
        </Field>
        <Button label={existing ? 'Save' : 'Add'} primary busy={busy} onPress={save} />
        {problem && <Body tone="bad">{problem}</Body>}
      </Section>

      {existing && (
        <Section title="Status">
          <Segments
            value={existing.status}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'done', label: 'Done' },
              { value: 'dropped', label: 'Dropped' },
            ]}
            onChange={(status) => act(() => updateHorizon(env().db, existing.id, { status }), false)}
          />
          <Note>Period ends {existing.periodEnd}. A goal marked done counts as 100%.</Note>
          <Button
            label="Delete"
            danger
            disabled={busy}
            onPress={async () => {
              if (await confirm(`Delete this ${noun}?`, 'What sits under it is kept, but no longer connected to it.', 'Delete')) {
                await act(() => deleteHorizon(env().db, existing.id));
              }
            }}
          />
        </Section>
      )}
    </ScrollView>
  );
}
