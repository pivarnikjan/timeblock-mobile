import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { commitFrom, type CommitRangeResult } from '@timeblock/core/google/writes';
import { formatMinutes } from '@timeblock/core/hierarchy';
import { discardDrafts } from '@timeblock/core/operations/plan';
import {
  planCalendar,
  previewReschedule,
  reschedule,
  rescheduleIsEmpty,
  today,
  type CalendarPlanSummary,
  type RescheduleResult,
  type RescheduleSummary,
  type SessionRestart,
} from '@timeblock/core/planner';
import { draftDatesFrom } from '@timeblock/core/store/blocks';
import { getSettings } from '@timeblock/core/store/settings';
import { env } from '@/env';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, confirm, Note, plural, Section, ui } from '@/ui';
import { useLoad } from '@/use-load';

type State =
  | { kind: 'idle' }
  | { kind: 'planned'; summary: CalendarPlanSummary }
  | { kind: 'committed'; result: CommitRangeResult }
  | { kind: 'discarded'; blocks: number }
  | { kind: 'preview'; summary: RescheduleSummary }
  | { kind: 'rescheduled'; result: RescheduleResult }
  | { kind: 'error'; message: string };

const day = (date: string) => DateTime.fromISO(date).toFormat('ccc d LLL');

/**
 * Plan the whole calendar: lay every scheduled task into its window from today
 * on (drafts), reschedule after the calendar changed, commit the drafts to
 * Google or throw them away — the desktop's plan bar, running the same planner.
 * Every step that reads or writes the plan syncs with the desktop first.
 */
export default function PlanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [pending, setPending] = useState<string | null>(null);

  const { data: drafts } = useLoad(async () => {
    const { db } = env();
    return draftDatesFrom(db, today(await getSettings(db)));
  }, [app.version]);
  const draftBlocks = drafts?.reduce((n, d) => n + d.blocks, 0) ?? 0;
  const googleReady = app.account?.calendar === true;

  const run = async (label: string, work: () => Promise<State>) => {
    setPending(label);
    try {
      setState(await work());
    } catch (error) {
      setState({ kind: 'error', message: (error as Error).message });
    } finally {
      setPending(null);
      app.changed();
    }
  };

  const plan = () =>
    run('plan', async () => {
      await app.syncFirst();
      return { kind: 'planned', summary: await planCalendar(env()) };
    });

  const preview = () =>
    run('preview', async () => {
      await app.syncFirst();
      return { kind: 'preview', summary: await previewReschedule(env()) };
    });

  const confirmReschedule = () =>
    run('reschedule', async () => {
      await app.syncFirst();
      return { kind: 'rescheduled', result: await reschedule(env()) };
    });

  const commit = async () => {
    const ok = await confirm(
      'Commit to Google Calendar?',
      `Send ${plural(draftBlocks, 'block')} to Google Calendar. TimeBlock's earlier blocks from today on that you did not pin are replaced.`,
      'Commit',
      false,
    );
    if (!ok) return;
    await run('commit', async () => {
      await app.syncFirst();
      const e = env();
      return { kind: 'committed', result: await commitFrom(e, today(await getSettings(e.db))) };
    });
  };

  const discard = async () => {
    const ok = await confirm('Discard drafts?', `Throw away ${plural(draftBlocks, 'draft block')}, including any you moved by hand?`, 'Discard');
    if (!ok) return;
    await run('discard', async () => ({ kind: 'discarded', blocks: await discardDrafts(env()) }));
  };

  const openDay = (date: string) => router.navigate({ pathname: '/', params: { date, view: 'day' } });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen}>
      <Section>
        <Button label="Plan calendar" primary busy={pending === 'plan'} disabled={pending !== null} onPress={plan} />
        <Button label="Reschedule…" busy={pending === 'preview'} disabled={pending !== null} onPress={preview} />
        {draftBlocks > 0 && (
          <>
            <Button
              label={`Commit ${plural(draftBlocks, 'block')} to Google`}
              busy={pending === 'commit'}
              disabled={pending !== null || !googleReady}
              onPress={commit}
            />
            <Button label="Discard drafts" busy={pending === 'discard'} disabled={pending !== null} onPress={discard} />
            {drafts && drafts.length > 0 && (
              <Note>
                Draft plan: {drafts[0].date === drafts.at(-1)!.date ? day(drafts[0].date) : `${day(drafts[0].date)} – ${day(drafts.at(-1)!.date)}`} ·{' '}
                {plural(drafts.length, 'day')}. Drafts stay on this phone until committed.
              </Note>
            )}
            {!googleReady && <Note tone="bad">Sign in with Google calendar access (⚙ Settings) to commit.</Note>}
          </>
        )}
      </Section>

      {state.kind === 'idle' && (
        <Note>
          Plan calendar lays every scheduled task into its window, day after day from today, until all of it has a place —
          around your meetings, and keeping each course in order. Move a block from its details to adjust it; a block you move
          is pinned (📌) and the next plan works around it. New meetings since? Reschedule… shows how many tasks no longer fit
          and, once you confirm, moves just those — and everything after them. The phone syncs with the desktop first, every
          time, so the two never plan the same work twice.
        </Note>
      )}
      {state.kind === 'error' && <Body tone="bad">Could not finish: {state.message}</Body>}
      {state.kind === 'discarded' && <Body tone="muted">Discarded {plural(state.blocks, 'draft block')}.</Body>}
      {state.kind === 'committed' && (
        <Body tone="good">
          Committed: {plural(state.result.created, 'event')} created across {plural(state.result.days, 'day')}
          {state.result.removed > 0 ? `, ${plural(state.result.removed, 'earlier event')} replaced` : ''}
          {state.result.recoloured ? `, ${plural(state.result.recoloured, 'earlier event')} given its window's colour` : ''}.
        </Body>
      )}
      {state.kind === 'planned' && <PlanSummary summary={state.summary} onOpenDay={openDay} />}
      {state.kind === 'preview' && (
        <ReschedulePreview
          summary={state.summary}
          pending={pending !== null}
          busy={pending === 'reschedule'}
          onConfirm={confirmReschedule}
          onCancel={() => setState({ kind: 'idle' })}
        />
      )}
      {state.kind === 'rescheduled' && <RescheduleDone result={state.result} onOpenDay={openDay} />}
    </ScrollView>
  );
}

function PlanSummary({ summary: s, onOpenDay }: { summary: CalendarPlanSummary; onOpenDay(date: string): void }) {
  return (
    <Section>
      {s.firstDate && s.lastDate ? (
        <>
          <Body>
            Planned {plural(s.tasksPlaced, 'task')} · {formatMinutes(s.plannedMinutes)} in {plural(s.blocks, 'block')} over{' '}
            {plural(s.days, 'day')} ({day(s.firstDate)} – {day(s.lastDate)}).
          </Body>
          <Button label={`Review from ${day(s.firstDate)} →`} onPress={() => onOpenDay(s.firstDate!)} />
        </>
      ) : (
        <Body>Nothing to plan — no open task is in a week yet or marked active.</Body>
      )}
      {s.pinned > 0 && <Note>Worked around {plural(s.pinned, 'block')} you placed by hand.</Note>}
      <Restarts restarts={s.restarts} />
      {s.unfinished.length > 0 && (
        <Note tone="warn">Did not fit in the next three months: {s.unfinished.map((u) => `${u.title} (${formatMinutes(u.minutes)})`).join(', ')}.</Note>
      )}
      {s.later.count > 0 && s.later.until && (
        <Note>
          {plural(s.later.count, 'dated task')} fall after the next three months (until {day(s.later.until)}) and will be planned when their
          dates come closer.
        </Note>
      )}
      {s.notScheduled > 0 && (
        <Note>
          {plural(s.notScheduled, 'open task')} {s.notScheduled === 1 ? 'is' : 'are'} not in any week and was left out — move{' '}
          {s.notScheduled === 1 ? 'it' : 'them'} into a week, or mark {s.notScheduled === 1 ? 'it' : 'them'} active.
        </Note>
      )}
      {s.problem && <Note tone="bad">Google Calendar could not be read, so meetings were not avoided: {s.problem}</Note>}
    </Section>
  );
}

/** Weeks of sequential sessions that start again — a vacation or a missed day broke them. */
function Restarts({ restarts }: { restarts: SessionRestart[] }) {
  return (
    <>
      {restarts.map((r, i) => (
        <Note key={i} tone="warn">
          ↻ The week starting with “{r.first}” cannot be finished within one week, so it starts again from its first session
          {r.on ? ` on ${day(r.on)}` : ', but does not fit in the next three months'}
          {r.redone > 0 && ` — ${plural(r.redone, 'session')} already done ${r.redone === 1 ? 'is' : 'are'} done again`}; the weeks after it
          move back.
        </Note>
      ))}
    </>
  );
}

function taskList(tasks: { title: string }[], shown = 6): string {
  const head = tasks.slice(0, shown).map((t) => t.title).join(', ');
  return tasks.length > shown ? `${head} and ${tasks.length - shown} more` : head;
}

function blockChanges(s: RescheduleSummary, done = false): string {
  if (s.removed > 0 && s.added > 0) return `${plural(s.removed, 'block')} ${done ? '' : s.removed === 1 ? 'is ' : 'are '}replaced by ${s.added}`;
  if (s.added > 0) return plural(s.added, 'new block');
  return `${plural(s.removed, 'block')} ${done ? 'taken off' : s.removed === 1 ? 'comes off' : 'come off'}`;
}

function RescheduleNotes({ summary: s, done = false }: { summary: RescheduleSummary; done?: boolean }) {
  return (
    <>
      <Restarts restarts={s.restarts} />
      {s.finished.length > 0 && (
        <Note>
          ✓ Already finished, so no longer planned: {taskList(s.finished)} — {done ? 'their blocks were taken off' : 'their blocks come off'} the calendar.
        </Note>
      )}
      {s.doneAhead > 0 && (
        <Note>
          ✓ {plural(s.doneAhead, 'block')} you ticked off ahead of time {done ? (s.doneAhead === 1 ? 'was moved' : 'were moved') : s.doneAhead === 1 ? 'moves' : 'move'} back to
          when you did {s.doneAhead === 1 ? 'it' : 'them'}, freeing {s.doneAhead === 1 ? 'its slot' : 'their slots'} for what comes next.
        </Note>
      )}
      {s.unfinished.length > 0 && (
        <Note tone="warn">Does not fit in the next three months: {s.unfinished.map((u) => `${u.title} (${formatMinutes(u.minutes)})`).join(', ')}.</Note>
      )}
      {s.problem && <Note tone="bad">Google Calendar could not be read, so meetings were not avoided: {s.problem}</Note>}
    </>
  );
}

function ReschedulePreview({
  summary: s,
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  summary: RescheduleSummary;
  pending: boolean;
  busy: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  if (rescheduleIsEmpty(s)) {
    return (
      <Section>
        <Body>Nothing to reschedule — every planned block still fits where it is.</Body>
        <RescheduleNotes summary={s} />
        <Button label="Close" onPress={onCancel} />
      </Section>
    );
  }
  return (
    <Section tone="accent">
      {s.impacted.length > 0 ? (
        <Body>
          {plural(s.impacted.length, 'task')} impacted{s.firstChange ? ` from ${day(s.firstChange)}` : ''}: {taskList(s.impacted)}.
        </Body>
      ) : (
        <Body>No task has to move — only work you already finished changes.</Body>
      )}
      {(s.removed > 0 || s.added > 0) && (
        <Note>
          {blockChanges(s)}
          {s.kept > 0 && `; ${plural(s.kept, 'block')} stay${s.kept === 1 ? 's' : ''} exactly where ${s.kept === 1 ? 'it is' : 'they are'}`}.
          {s.conflicts > 0 && ` ${plural(s.conflicts, 'block')} collide${s.conflicts === 1 ? 's' : ''} with a meeting or vacation.`}
          {s.released > 0 &&
            ` ${plural(s.released, 'block')} you placed by hand ${s.released === 1 ? 'has' : 'have'} a meeting on ${s.released === 1 ? 'it' : 'them'} and will be moved too.`}
          {s.toGoogle ? ' Google Calendar is updated too.' : ' The new blocks are drafts — commit them when you are happy.'}
        </Note>
      )}
      <RescheduleNotes summary={s} />
      <View style={{ gap: 8 }}>
        <Button
          label={s.impacted.length > 0 ? `Reschedule ${plural(s.impacted.length, 'task')}` : 'Update the calendar'}
          primary
          busy={busy}
          disabled={pending}
          onPress={onConfirm}
        />
        <Button label="Cancel" disabled={pending} onPress={onCancel} />
      </View>
    </Section>
  );
}

function RescheduleDone({ result: r, onOpenDay }: { result: RescheduleResult; onOpenDay(date: string): void }) {
  if (rescheduleIsEmpty(r)) return <Body tone="muted">Nothing to reschedule — every planned block still fits.</Body>;
  return (
    <Section>
      <Body tone="good">
        {r.impacted.length > 0 ? `Rescheduled ${plural(r.impacted.length, 'task')}` : 'Calendar updated'}
        {(r.removed > 0 || r.added > 0) && `: ${blockChanges(r, true)}`}
        {r.kept > 0 && `, ${r.kept} left as they were`}
        {r.toGoogle && r.created > 0 && ` · ${plural(r.created, 'event')} created in Google Calendar`}.
      </Body>
      {r.firstChange && <Button label={`Review from ${day(r.firstChange)} →`} onPress={() => onOpenDay(r.firstChange!)} />}
      <RescheduleNotes summary={r} done />
    </Section>
  );
}
