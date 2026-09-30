import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Horizon, Task } from '@timeblock/core/db/schema';
import { breadcrumb, formatMinutes, remainingMinutes, weekOfMonth, yearsLabel } from '@timeblock/core/hierarchy';
import { quickAddTask } from '@timeblock/core/operations/horizons';
import type { Outlook, PlanningContext } from '@timeblock/core/planner';
import { setTaskStatus, updateTask } from '@timeblock/core/store/tasks';
import { env } from '@/env';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Body, Button, Choice, Chip, Note, ProgressBar, TextField, ui } from '@/ui';
import { OutlookBadge } from './outlook';

/** Everything the planning tree reads, resolved once per screen. */
export interface Scope {
  ctx: PlanningContext;
  outlook: Outlook;
  childrenOf(id: number): Horizon[];
  tasksOf(id: number): Task[];
}

export function buildScope(ctx: PlanningContext, look: Outlook): Scope {
  const live = (h: Horizon) => h.status !== 'dropped';
  return {
    ctx,
    outlook: look,
    childrenOf: (id) => ctx.horizons.filter((h) => h.parentId === id && live(h)).sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
    tasksOf: (id) => ctx.tasks.filter((t) => t.horizonId === id && t.status !== 'dropped').sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export const weekLabel = (start: string) => weekOfMonth(start).label.split(' (')[0];

/** A goal, outcome or week priority: its chain, progress and forecast, what sits under it, and Edit. */
export function HorizonCard({ horizon, scope, period }: { horizon: Horizon; scope: Scope; period: { start: string; end: string } }) {
  const theme = useTheme();
  const router = useRouter();
  const { ctx } = scope;
  const done = horizon.status === 'done';
  const trail = breadcrumb(horizon.parentId, ctx.byId);
  const ownWindow = horizon.windowId === null ? null : (ctx.windows.find((w) => w.id === horizon.windowId)?.name ?? null);

  return (
    <View style={[ui.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {horizon.level !== 'year' && <Note tone={trail.length === 0 ? 'warn' : undefined}>{trail.length === 0 ? 'not connected' : trail.join(' › ')}</Note>}
      <View style={ui.inline}>
        <Text style={[ui.sectionTitle, { flex: 1, color: done ? theme.muted : theme.foreground }, done && { textDecorationLine: 'line-through' }]}>
          {horizon.title}
        </Text>
        <Pressable onPress={() => router.push({ pathname: '/horizon', params: { id: String(horizon.id) } })} hitSlop={8} accessibilityRole="button">
          <Text style={[ui.label, { color: theme.accent }]}>Edit</Text>
        </Pressable>
      </View>
      {horizon.description && <Note>{horizon.description}</Note>}
      <View style={ui.wrap}>
        <OutlookBadge outlook={scope.outlook.horizons.get(horizon.id)} />
        {ownWindow && <Chip label={`⏱ ${ownWindow}`} />}
        {horizon.level === 'year' && horizon.periodStart.slice(0, 4) !== horizon.periodEnd.slice(0, 4) && <Chip label={`📅 ${yearsLabel(horizon)}`} />}
        {horizon.status === 'dropped' && <Chip label="dropped" />}
      </View>
      <ProgressBar progress={ctx.progress.get(horizon.id)} />
      <View style={{ borderTopWidth: 1, borderColor: theme.border, paddingTop: 8 }}>
        {horizon.level === 'year' && <YearTree horizon={horizon} scope={scope} period={period} />}
        {horizon.level === 'month' && <MonthDetail horizon={horizon} scope={scope} />}
        {horizon.level === 'week' && <WeekDetail horizon={horizon} scope={scope} />}
      </View>
    </View>
  );
}

/** A level below, folded: tap to open what is under it. */
function Row({ label, horizon, scope, children }: { label: string; horizon: Horizon; scope: Scope; children: ReactNode }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ paddingVertical: 6, gap: 4 }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={ui.inline}>
          <Text style={{ color: theme.muted, fontSize: 11 }}>{open ? '▼' : '▶'}</Text>
          <Text style={[ui.text, { flex: 1, color: theme.foreground }]} numberOfLines={2}>
            {label}
            {horizon.status === 'done' ? '  ✓ done' : ''}
          </Text>
        </View>
        <View style={{ marginLeft: 20, gap: 4 }}>
          <OutlookBadge outlook={scope.outlook.horizons.get(horizon.id)} />
          <ProgressBar progress={scope.ctx.progress.get(horizon.id)} compact />
        </View>
      </Pressable>
      {open && <View style={{ marginLeft: 8, paddingLeft: 10, borderLeftWidth: 1, borderColor: theme.border }}>{children}</View>}
    </View>
  );
}

/** One task: tick it done (or reopen it), what is left, and when the forecast finishes it. Tap to edit. */
export function TaskLine({ task, scope, showForecast = true }: { task: Task; scope: Scope; showForecast?: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { changed } = useApp();
  const ticked = scope.ctx.ticked.get(task.id) ?? 0;
  const left = remainingMinutes(task, ticked);
  const finish = scope.outlook.tasks.get(task.id);
  const done = task.status === 'done';

  const toggle = async () => {
    await setTaskStatus(env().db, task.id, done ? 'backlog' : 'done');
    changed();
  };

  return (
    <View style={[ui.inline, { paddingVertical: 4 }]}>
      <Pressable
        onPress={() => void toggle()}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        style={[ui.box, { width: 20, height: 20, borderColor: done ? theme.ok : theme.muted, backgroundColor: done ? theme.ok : 'transparent' }]}
      >
        {done && <Text style={ui.check}>✓</Text>}
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/task', params: { id: String(task.id) } })}>
        <Text style={[ui.text, { color: done ? theme.muted : theme.foreground }, done && { textDecorationLine: 'line-through' }]} numberOfLines={2}>
          {task.title}
        </Text>
        <Text style={[ui.note, { color: theme.muted }]}>
          {done ? formatMinutes(task.estimateMin) : ticked > 0 ? `${formatMinutes(left)} left of ${formatMinutes(task.estimateMin)}` : formatMinutes(task.estimateMin)}
          {showForecast && !done && finish ? ` · → ${DateTime.fromISO(finish).toFormat('ccc d LLL')}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

export function YearTree({ horizon, scope, period }: { horizon: Horizon; scope: Scope; period: { start: string; end: string } }) {
  const all = scope.childrenOf(horizon.id);
  // A goal over several years shows the months of the year on screen; the rest are on their own year.
  const months = all.filter((m) => m.periodStart <= period.end && m.periodEnd >= period.start);
  const elsewhere = all.length - months.length;
  const own = scope.tasksOf(horizon.id);
  if (all.length === 0 && own.length === 0) return <Note>No monthly outcomes serve this goal yet — add them on the Month tab.</Note>;
  return (
    <View>
      {elsewhere > 0 && (
        <Note>
          {period.start.slice(0, 4)}&apos;s months below · {elsewhere} more {elsewhere === 1 ? 'is' : 'are'} on the other years of {yearsLabel(horizon)}.
        </Note>
      )}
      {months.map((month) => (
        <Row key={month.id} horizon={month} scope={scope} label={`${DateTime.fromISO(month.periodStart).toFormat('LLL yyyy')} · ${month.title}`}>
          <MonthDetail horizon={month} scope={scope} />
        </Row>
      ))}
      {own.map((t) => (
        <TaskLine key={t.id} task={t} scope={scope} />
      ))}
    </View>
  );
}

export function MonthDetail({ horizon, scope }: { horizon: Horizon; scope: Scope }) {
  const { changed } = useApp();
  const weeks = scope.childrenOf(horizon.id);
  const backlog = scope.tasksOf(horizon.id);
  const candidateWeeks = scope.ctx.horizons.filter(
    (h) => h.level === 'week' && h.status === 'active' && h.periodStart <= horizon.periodEnd && h.periodEnd >= horizon.periodStart,
  );
  const move = async (taskId: number, weekId: number) => {
    await updateTask(env().db, taskId, { horizonId: weekId });
    changed();
  };

  return (
    <View>
      {weeks.length === 0 && backlog.length === 0 && <Note>No weeks or tasks under this outcome yet.</Note>}
      {weeks.map((week) => (
        <Row key={week.id} horizon={week} scope={scope} label={`${weekLabel(week.periodStart)} · ${week.title}`}>
          <WeekDetail horizon={week} scope={scope} />
        </Row>
      ))}
      {backlog.length > 0 && (
        <View style={{ marginTop: 6, gap: 2 }}>
          <Note>Month backlog — scheduled once moved into a week (or on its due date, if it has one)</Note>
          {backlog.map((task) => (
            <View key={task.id} style={{ gap: 2 }}>
              <TaskLine task={task} scope={scope} showForecast={task.dueDate !== null} />
              {task.status !== 'done' && candidateWeeks.length > 0 && (
                <View style={{ marginLeft: 30 }}>
                  <Choice
                    value={undefined}
                    placeholder="Move into week…"
                    title={`Move “${task.title}” into`}
                    options={candidateWeeks.map((w) => ({ value: w.id, label: `${weekLabel(w.periodStart)} · ${w.title}` }))}
                    onChange={(weekId) => void move(task.id, weekId)}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function WeekDetail({ horizon, scope }: { horizon: Horizon; scope: Scope }) {
  const { changed } = useApp();
  const tasks = scope.tasksOf(horizon.id);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    setProblem(null);
    try {
      await quickAddTask(env().db, horizon.id, title, duration);
      setTitle('');
      setDuration('');
      changed();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <View style={{ gap: 4 }}>
      {tasks.length === 0 && <Note>No tasks under this priority yet.</Note>}
      {tasks.map((task) => (
        <TaskLine key={task.id} task={task} scope={scope} />
      ))}
      <View style={[ui.inline, { marginTop: 4 }]}>
        <TextField value={title} onChangeText={setTitle} placeholder="Add a task…" style={{ flex: 1 }} />
        <TextField value={duration} onChangeText={setDuration} placeholder="1h 25m" style={{ width: 84 }} />
      </View>
      <Button label="Add" disabled={title.trim() === '' || duration.trim() === ''} onPress={add} />
      {problem && <Body tone="bad">{problem}</Body>}
    </View>
  );
}
