import { Stack, useLocalSearchParams } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { busySpans } from '@timeblock/core/calendar/busy';
import type { Env } from '@timeblock/core/env';
import { clearDay } from '@timeblock/core/google/writes';
import { ancestry, breadcrumb, formatMinutes, weekOfMonth } from '@timeblock/core/hierarchy';
import { commitDayPlan, completeBlock, reviewDay, tick, unpinBlock } from '@timeblock/core/operations/plan';
import { generateDay, loadDay, today, type DayView } from '@timeblock/core/planner';
import { minutes } from '@timeblock/core/scheduler/intervals';
import { rankTasks } from '@timeblock/core/scheduler/plan';
import * as blockStore from '@timeblock/core/store/blocks';
import { freeEventKeys } from '@timeblock/core/store/event-marks';
import { completeRitual, isRitualDone, ritualSteps } from '@timeblock/core/store/rituals';
import { getSettings } from '@timeblock/core/store/settings';
import { setTaskStatus } from '@timeblock/core/store/tasks';
import { cachedEvents } from '@/db/cache';
import { env } from '@/env';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, Checkbox, Chip, confirm, Note, plural, ProgressBar, Section, ui } from '@/ui';
import { useLoad } from '@/use-load';

/** How many of the waiting tasks the day lists, next up first. */
const LIST_LIMIT = 15;

interface PendingReview {
  date: string;
  blocks: blockStore.BlockWithSegments[];
}

/** The last planned day before `today`, if it still has open work and was not reviewed. */
async function pendingReview(e: Env, today: string): Promise<PendingReview | null> {
  const date = await blockStore.lastPlannedDateBefore(e.db, today);
  if (!date || (await isRitualDone(e.db, 'review', date))) return null;
  const blocks = (await blockStore.listForDate(e.db, date)).filter((b) => b.segments.some((s) => s.doneAt === null));
  return blocks.length > 0 ? { date, blocks } : null;
}

/**
 * The day, as the desktop's Today view plans it: review yesterday, the
 * outstanding reviews, what the day rolls up to, generate → commit, tick
 * blocks off, and what is waiting to be scheduled. Meetings come from the
 * phone's last read of Google, so it works offline; generating and committing
 * sync with the desktop and read Google first.
 */
export default function TodayScreen() {
  const theme = useTheme();
  const app = useApp();
  const params = useLocalSearchParams<{ date?: string }>();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);

  const { data, error } = useLoad(async () => {
    const e = env();
    const date = params.date ?? today(await getSettings(e.db));
    const events = cachedEvents([date]).events;
    const day = await loadDay(e, date, { events, busy: busySpans(events, await freeEventKeys(e.db)), problem: null });
    const [steps, review] = await Promise.all([
      ritualSteps(e.db, day.date, day.ctx.settings.timezone),
      day.isToday ? pendingReview(e, day.date) : Promise.resolve(null),
    ]);
    return { day, steps, review };
  }, [app.version, params.date]);

  const act = async (label: string, work: () => Promise<string | void>) => {
    setPending(label);
    setMessage(null);
    try {
      const done = await work();
      if (done) setMessage({ text: done, tone: 'good' });
    } catch (err) {
      setMessage({ text: (err as Error).message, tone: 'bad' });
    } finally {
      setPending(null);
      app.changed();
    }
  };

  if (!data) {
    return (
      <View style={[ui.screen, { flex: 1, backgroundColor: theme.background }]}>
        {error ? <Body tone="bad">{error}</Body> : <Note>Loading…</Note>}
      </View>
    );
  }

  const { day, steps, review } = data;
  const { ctx } = day;
  const zone = ctx.settings.timezone;
  const drafts = day.blocks.filter((b) => b.state === 'draft');
  const committed = day.blocks.filter((b) => b.state !== 'draft');
  const freeMinutes = day.windowSlots.reduce((t, w) => t + w.slots.reduce((s, slot) => s + minutes(slot), 0), 0);
  const plannedMinutes = day.blocks.reduce((t, b) => t + b.segments.reduce((s, seg) => s + seg.minutes, 0), 0);
  const outstanding = steps.filter((step) => !step.done && step.kind !== 'daily' && step.kind !== 'review');
  const title = day.isToday ? 'My day' : DateTime.fromISO(day.date).toFormat('ccc d LLL');

  const generate = () =>
    act('generate', async () => {
      await app.syncFirst();
      const plan = await generateDay(env(), day.date);
      const placed = plan.blocks.length;
      return placed > 0 ? `Planned ${plural(placed, 'block')} — drafts until you commit them.` : 'Nothing fits today.';
    });

  const commit = async () => {
    if (!(await confirm('Commit to Google Calendar?', `Send ${plural(drafts.length, 'block')} to Google Calendar.`, 'Commit', false))) return;
    await act('commit', async () => {
      await app.syncFirst();
      await commitDayPlan(env(), day.date);
      return 'Committed to Google Calendar.';
    });
  };

  const clear = async () => {
    const ok = await confirm('Clear the day?', 'Drafts go, and untouched committed blocks are removed here and in Google. Ticked-off blocks stay as history.', 'Clear');
    if (!ok) return;
    await act('clear', async () => {
      if (committed.some((b) => b.state === 'synced')) await app.syncFirst();
      await clearDay(env(), day.date);
      return 'The day is cleared.';
    });
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen}>
      <Stack.Screen options={{ title }} />

      {review && <ReviewYesterday review={review} zone={zone} onSave={(ids) => act('review', async () => reviewDay(env(), review.date, ids))} busy={pending === 'review'} />}

      {outstanding.length > 0 && (
        <Section title="Before you block out the day" tone="accent">
          {outstanding.map((step) => (
            <View key={step.kind} style={ui.inline}>
              <View style={{ flex: 1 }}>
                <Body>{step.label}</Body>
                <Note>{step.period} · on the Planning screens</Note>
              </View>
              <Button label="Reviewed" onPress={() => act(`ritual-${step.kind}`, () => completeRitual(env().db, step.kind, step.period))} />
            </View>
          ))}
        </Section>
      )}

      <GoalLadder day={day} />

      <Section>
        <Button
          label={day.blocks.length > 0 ? 'Re-plan the day' : 'Generate the day'}
          primary
          busy={pending === 'generate'}
          disabled={pending !== null}
          onPress={generate}
        />
        <Button
          label={drafts.length > 0 ? `Commit ${plural(drafts.length, 'block')} to Google` : 'Commit to Google'}
          busy={pending === 'commit'}
          disabled={pending !== null || drafts.length === 0 || app.account?.calendar !== true}
          onPress={commit}
        />
        {day.blocks.length > 0 && <Button label="Clear the day" danger busy={pending === 'clear'} disabled={pending !== null} onPress={clear} />}
        {message && <Body tone={message.tone}>{message.text}</Body>}
        <View style={[ui.wrap, { justifyContent: 'space-between' }]}>
          <Stat label="Free in windows" value={formatMinutes(freeMinutes)} />
          <Stat label="Planned" value={formatMinutes(plannedMinutes)} />
          <Stat label="Meetings" value={`${day.events.filter((e) => e.busy && e.blockId === null).length}`} />
          <Stat label="Committed" value={`${committed.length} / ${day.blocks.length}`} />
        </View>
      </Section>

      <BlockChecklist day={day} act={act} />

      <Section title={`In the running (${day.candidates.length})`}>
        {day.candidates.length === 0 ? (
          <Note>Nothing to schedule. Put tasks under this week&apos;s priorities, or pull something in from the backlog.</Note>
        ) : (
          <>
            {rankTasks(day.candidates, day.date)
              .slice(0, LIST_LIMIT)
              .map((c) => {
                const task = ctx.tasks.find((t) => t.id === c.id)!;
                const windowName = ctx.windows.find((w) => w.id === c.windowId)?.name ?? 'Anytime';
                return (
                  <View key={c.id} style={{ gap: 2 }}>
                    <View style={ui.inline}>
                      <Text style={[ui.text, { flex: 1, color: theme.foreground }]} numberOfLines={1}>
                        {task.title}
                      </Text>
                      <Chip label={`P${task.priority}`} />
                      <Chip label={`⏱ ${windowName}`} />
                    </View>
                    <Note>
                      {c.remainingMin < task.estimateMin
                        ? `${formatMinutes(c.remainingMin)} left of ${formatMinutes(task.estimateMin)}`
                        : formatMinutes(task.estimateMin)}
                      {breadcrumb(task.horizonId, ctx.byId).length > 0 && ` · ${breadcrumb(task.horizonId, ctx.byId).join(' › ')}`}
                    </Note>
                  </View>
                );
              })}
            {day.candidates.length > LIST_LIMIT && <Note>…and {day.candidates.length - LIST_LIMIT} more after these, in this order.</Note>}
          </>
        )}
      </Section>

      <Section title={`Not scheduled on its own (${day.backlog.length})`}>
        <Note>Month backlogs and loose tasks. Move them into a week on the Week screen, or pull one in for today.</Note>
        {day.backlog.slice(0, LIST_LIMIT).map((task) => (
          <View key={task.id} style={ui.inline}>
            <View style={{ flex: 1 }}>
              <Text style={[ui.text, { color: theme.foreground }]} numberOfLines={1}>
                {task.title}
              </Text>
              <Note>
                {formatMinutes(task.estimateMin)}
                {breadcrumb(task.horizonId, ctx.byId).length > 0 && ` · ${breadcrumb(task.horizonId, ctx.byId).join(' › ')}`}
              </Note>
            </View>
            <Button label="Pull in" onPress={() => act(`pull-${task.id}`, () => setTaskStatus(env().db, task.id, 'active'))} />
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

function ReviewYesterday({ review, zone, onSave, busy }: { review: PendingReview; zone: string; onSave(ids: number[]): void; busy: boolean }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Section title={`Step 1 · Review ${DateTime.fromISO(review.date).toFormat('cccc d LLL')}`} tone="accent">
      <Note>Tick what you actually finished. Anything left unticked is planned again with only the minutes that remain.</Note>
      {review.blocks.map((block) => (
        <View key={block.id}>
          <Note>
            {DateTime.fromISO(block.startsAt, { zone }).toFormat('HH:mm')}–{DateTime.fromISO(block.endsAt, { zone }).toFormat('HH:mm')}
          </Note>
          {block.segments
            .filter((s) => s.doneAt === null)
            .map((s) => (
              <Checkbox key={s.id} checked={checked.has(s.id)} onPress={() => toggle(s.id)} label={s.task.title} detail={formatMinutes(s.minutes)} />
            ))}
        </View>
      ))}
      <Button label="Save review" primary busy={busy} onPress={() => onSave([...checked])} />
    </Section>
  );
}

/** This week's priorities, each with the chain it rolls up through and a bar per level. */
function GoalLadder({ day }: { day: DayView }) {
  const { ctx } = day;
  const weeks = ctx.horizons.filter((h) => h.level === 'week' && h.status === 'active' && h.periodStart <= day.date && h.periodEnd >= day.date);
  if (weeks.length === 0) {
    return <Note>No priorities set for this week yet — choose them on the Week screen, so today&apos;s work rolls up to something.</Note>;
  }
  const label = (level: string, start: string) =>
    level === 'week' ? weekOfMonth(start).label.split(' (')[0] : level === 'month' ? DateTime.fromISO(start).toFormat('LLLL') : start.slice(0, 4);
  return (
    <Section title="What today rolls up to">
      {weeks.map((week) => (
        <View key={week.id} style={{ gap: 8 }}>
          {ancestry(week.id, ctx.byId).map((h) => (
            <View key={h.id} style={{ gap: 2 }}>
              <Note>{label(h.level, h.periodStart).toUpperCase()}</Note>
              <Body>{h.title}</Body>
              <ProgressBar progress={ctx.progress.get(h.id)} compact />
            </View>
          ))}
        </View>
      ))}
    </Section>
  );
}

function BlockChecklist({ day, act }: { day: DayView; act(label: string, work: () => Promise<string | void>): Promise<void> }) {
  const zone = day.ctx.settings.timezone;
  if (day.blocks.length === 0) return <Note>No blocks yet. Generate the day to see them here.</Note>;
  return (
    <Section title="Blocks">
      {day.blocks.map((block) => {
        const allDone = block.segments.every((s) => s.doneAt !== null);
        return (
          <View key={block.id} style={{ gap: 2 }}>
            <View style={ui.inline}>
              <Body>
                {DateTime.fromISO(block.startsAt, { zone }).toFormat('HH:mm')}–{DateTime.fromISO(block.endsAt, { zone }).toFormat('HH:mm')}
              </Body>
              <Note>{block.state === 'draft' ? 'draft' : block.state === 'done' ? 'kept' : 'in Google'}</Note>
              {block.pinned && block.state !== 'done' && <Note>📌 pinned</Note>}
              <View style={{ flex: 1 }} />
              {block.pinned && block.state !== 'done' && <Button label="Unpin" onPress={() => act(`unpin-${block.id}`, () => unpinBlock(env(), block.id))} />}
              {!allDone && <Button label="All done" onPress={() => act(`done-${block.id}`, () => completeBlock(env(), block.id))} />}
            </View>
            {block.segments.map((s) => (
              <Checkbox
                key={s.id}
                checked={s.doneAt !== null}
                onPress={() => act(`tick-${s.id}`, () => tick(env(), [s.id], s.doneAt === null))}
                label={s.task.title}
                detail={formatMinutes(s.minutes)}
              />
            ))}
          </View>
        );
      })}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View>
      <Text style={[ui.note, { color: theme.muted }]}>{label}</Text>
      <Text style={[ui.text, { color: theme.foreground, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}
