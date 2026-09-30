import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Horizon } from '@timeblock/core/db/schema';
import { findUnconnected, formatMinutes } from '@timeblock/core/hierarchy';
import { loadContext, outlook } from '@timeblock/core/planner';
import { updateTask } from '@timeblock/core/store/tasks';
import { periodFor, resolvePeriod, shift } from '@timeblock/core/time/periods';
import { env } from '@/env';
import { buildScope, HorizonCard, weekLabel, type Scope } from '@/planning/tree';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, Choice, Note, Section, Segments, ui } from '@/ui';
import { useLoad } from '@/use-load';

type ReviewLevel = 'year' | 'month' | 'week';

const COPY: Record<ReviewLevel, { subtitle: string; noun: string; nouns: string }> = {
  year: { subtitle: 'The 40,000ft view. Open a goal to drill down through its months, weeks and tasks.', noun: 'yearly goal', nouns: 'yearly goals' },
  month: {
    subtitle: 'What has to be true by month end. Each outcome serves one yearly goal; its weeks and backlog sit underneath.',
    noun: 'monthly outcome',
    nouns: 'monthly outcomes',
  },
  week: {
    subtitle: 'The few priorities this week is about. Tasks under them are scheduled as soon as there is room — the week is their deadline.',
    noun: 'weekly priority',
    nouns: 'weekly priorities',
  },
};

const LEVELS: { value: ReviewLevel; label: string }[] = [
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
];

/**
 * Planning: the Year, Month and Week screens of the desktop, behind one switch
 * (it keeps the date you are looking at). Every goal with its progress and
 * forecast, the tree below it, and what is not connected to anything.
 */
export default function PlanningScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const params = useLocalSearchParams<{ level?: string; date?: string }>();
  const [level, setLevel] = useState<ReviewLevel>(() => (LEVELS.some((l) => l.value === params.level) ? (params.level as ReviewLevel) : 'week'));
  const [date, setDate] = useState<string | undefined>(params.date);

  // Other screens open a level at a date ("choose this week's priorities"); taken over once per request.
  const request = params.level || params.date ? `${params.level ?? ''}|${params.date ?? ''}` : null;
  const [handled, setHandled] = useState<string | null>(null);
  if (request !== null && request !== handled) {
    setHandled(request);
    if (LEVELS.some((l) => l.value === params.level)) setLevel(params.level as ReviewLevel);
    setDate(params.date);
  }

  const { data, error } = useLoad(async () => {
    const e = env();
    const ctx = await loadContext(e);
    return { scope: buildScope(ctx, await outlook(e, ctx)) };
  }, [app.version]);

  if (!data) {
    return <View style={[ui.screen, { flex: 1, backgroundColor: theme.background }]}>{error ? <Body tone="bad">{error}</Body> : <Note>Loading…</Note>}</View>;
  }

  const { scope } = data;
  const { ctx } = scope;
  const zone = ctx.settings.timezone;
  const period = resolvePeriod(level, zone, date);
  const anchor = DateTime.fromISO(period.start, { zone });
  const heading = level === 'week' ? `${weekLabel(period.start)} · ${DateTime.fromISO(period.start).toFormat('d LLL')} – ${DateTime.fromISO(period.end).toFormat('d LLL')}` : period.label;
  // A yearly goal over several years is listed on each of them.
  const items = ctx.horizons
    .filter((h) => h.level === level && (level === 'year' ? h.periodStart <= period.end && h.periodEnd >= period.start : h.periodStart === period.start))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const go = (offset: number) => setDate(periodFor(level, shift(level, anchor, offset)).start);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <Segments<ReviewLevel> value={level} options={LEVELS} onChange={setLevel} />
      <View style={ui.inline}>
        <Button label="‹" onPress={() => go(-1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[ui.sectionTitle, { color: theme.foreground }]}>{heading}</Text>
          <Pressable onPress={() => setDate(undefined)}>
            <Text style={[ui.note, { color: theme.accent }]}>Current</Text>
          </Pressable>
        </View>
        <Button label="›" onPress={() => go(1)} />
      </View>
      <Note>{COPY[level].subtitle}</Note>

      {level === 'month' && <WeeksOfMonth scope={scope} monthStart={period.start} onOpen={(start) => { setLevel('week'); setDate(start); }} />}
      {level === 'week' && <MoveIntoWeek scope={scope} weekStart={period.start} weekEnd={period.end} priorities={items} />}

      {items.length === 0 ? (
        <Note>No {COPY[level].nouns} yet for {heading}.</Note>
      ) : (
        items.map((item) => <HorizonCard key={item.id} horizon={item} scope={scope} period={period} />)
      )}

      <Button
        label={`Add a ${COPY[level].noun}`}
        primary
        onPress={() => router.push({ pathname: '/horizon', params: { level, periodStart: period.start, periodEnd: period.end } })}
      />

      <NotConnected scope={scope} onOpen={(h) => { setLevel(h.level as ReviewLevel); setDate(h.periodStart); }} />
    </ScrollView>
  );
}

/**
 * The month's planning weeks by the ISO Thursday rule, with what each one
 * holds — so "week 1" always means the same dates, and an empty week reads as buffer.
 */
function WeeksOfMonth({ scope, monthStart, onOpen }: { scope: Scope; monthStart: string; onOpen(start: string): void }) {
  const theme = useTheme();
  const month = DateTime.fromISO(monthStart);
  let monday = month.startOf('week');
  if (monday.plus({ days: 3 }).month !== month.month) monday = monday.plus({ weeks: 1 });
  const weeks: DateTime[] = [];
  for (let w = monday; w.plus({ days: 3 }).month === month.month; w = w.plus({ weeks: 1 })) weeks.push(w);

  return (
    <View style={ui.wrap}>
      {weeks.map((w) => {
        const start = w.toISODate()!;
        const priorities = scope.ctx.horizons.filter((h) => h.level === 'week' && h.periodStart === start && h.status !== 'dropped');
        return (
          <Pressable
            key={start}
            onPress={() => onOpen(start)}
            style={[ui.section, { padding: 10, gap: 2, minWidth: 140, flexGrow: 1, flexBasis: 140, backgroundColor: theme.surface, borderColor: theme.border }]}
            accessibilityRole="button"
          >
            <Text style={[ui.label, { color: theme.foreground }]}>{weekLabel(start)}</Text>
            <Text style={[ui.note, { color: theme.muted }]}>
              {w.toFormat('d LLL')} – {w.plus({ days: 6 }).toFormat('d LLL')}
            </Text>
            <Text style={[ui.note, { color: priorities.length === 0 ? '#d97706' : theme.muted }]} numberOfLines={2}>
              {priorities.length === 0 ? 'free — buffer' : priorities.map((p) => p.title).join(', ')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Weekly planning: the backlog of every month outcome this week touches, each task one tap from this week's work. */
function MoveIntoWeek({ scope, weekStart, weekEnd, priorities }: { scope: Scope; weekStart: string; weekEnd: string; priorities: Horizon[] }) {
  const { changed } = useApp();
  const months = scope.ctx.horizons.filter((h) => h.level === 'month' && h.status === 'active' && h.periodStart <= weekEnd && h.periodEnd >= weekStart);
  const backlog = months.flatMap((m) => scope.tasksOf(m.id).filter((t) => t.status === 'backlog' || t.status === 'active').map((t) => ({ task: t, month: m })));
  const targets = priorities.filter((p) => p.status === 'active');
  if (backlog.length === 0) return null;

  const move = async (taskId: number, weekId: number) => {
    await updateTask(env().db, taskId, { horizonId: weekId });
    changed();
  };

  return (
    <Section title="Move into this week">
      <Note>Month backlog tasks are not scheduled until they belong to a week. Pick what this week is for.</Note>
      {targets.length === 0 && <Note tone="warn">Add a weekly priority below first — tasks move under one.</Note>}
      {backlog.map(({ task, month }) => (
        <View key={task.id} style={{ gap: 4 }}>
          <Body>{task.title}</Body>
          <Note>
            {month.title} · {formatMinutes(task.estimateMin)}
          </Note>
          {targets.length === 1 && <Button label={`Move under “${targets[0].title}”`} onPress={() => move(task.id, targets[0].id)} />}
          {targets.length > 1 && (
            <Choice
              value={undefined}
              placeholder="Under…"
              title={`Move “${task.title}” under`}
              options={targets.map((w) => ({ value: w.id, label: w.title }))}
              onChange={(weekId) => void move(task.id, weekId)}
            />
          )}
        </View>
      ))}
    </Section>
  );
}

function NotConnected({ scope, onOpen }: { scope: Scope; onOpen(h: Horizon): void }) {
  const theme = useTheme();
  const router = useRouter();
  const loose = findUnconnected(scope.ctx.horizons, scope.ctx.tasks);
  if (loose.horizons.length === 0 && loose.tasks.length === 0) return null;
  return (
    <Section title="Not connected">
      <Note>
        These don&apos;t roll up to anything, so they are missing from every progress bar above them. Standalone on purpose? That&apos;s fine — this list is just a
        reminder.
      </Note>
      {loose.horizons.map((h) => (
        <Text key={`h${h.id}`} style={[ui.text, { color: theme.accent }]} onPress={() => onOpen(h)}>
          {h.level === 'week' ? weekLabel(h.periodStart) : DateTime.fromISO(h.periodStart).toFormat('LLL yyyy')} · {h.title}
        </Text>
      ))}
      {loose.tasks.map((t) => (
        <Text key={`t${t.id}`} style={[ui.text, { color: theme.accent }]} onPress={() => router.push({ pathname: '/task', params: { id: String(t.id) } })}>
          Task · {t.title}
        </Text>
      ))}
    </Section>
  );
}
