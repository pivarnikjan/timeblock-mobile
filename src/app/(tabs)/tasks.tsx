import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { breadcrumb, formatMinutes, indexHorizons } from '@timeblock/core/hierarchy';
import { listAllHorizons } from '@timeblock/core/store/horizons';
import { getSettings } from '@timeblock/core/store/settings';
import { listTasks, setTaskStatus } from '@timeblock/core/store/tasks';
import { listWindows } from '@timeblock/core/store/windows';
import { nowIn } from '@timeblock/core/time/periods';
import { env } from '@/env';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';
import { Button, Chip, Note, Section, ui } from '@/ui';
import { useLoad } from '@/use-load';

/** Tasks: the backlog the daily planner draws from — capture, the open ones, and the last done. */
export default function TasksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();

  const { data } = useLoad(async () => {
    const { db } = env();
    const [settings, open, done, horizons, windows] = await Promise.all([
      getSettings(db),
      listTasks(db, ['backlog', 'active']),
      listTasks(db, ['done']),
      listAllHorizons(db),
      listWindows(db),
    ]);
    return { today: nowIn(settings.timezone).toISODate()!, open, done, byId: indexHorizons(horizons), windows };
  }, [app.version]);

  const edit = (id: number) => router.push({ pathname: '/task', params: { id: String(id) } });

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={ui.screen}>
      <Note>The backlog the daily planner draws from. Mark work active to make it schedulable today.</Note>
      <Button label="Capture a task" primary onPress={() => router.push('/task')} />

      <Section title={`Open (${data?.open.length ?? 0})`}>
        {data && data.open.length === 0 && <Note>Nothing captured yet.</Note>}
        {data?.open.map((task) => {
          const overdue = task.dueDate !== null && task.dueDate < data.today;
          const window = data.windows.find((w) => w.id === task.windowId);
          const trail = breadcrumb(task.horizonId, data.byId);
          return (
            <Pressable key={task.id} onPress={() => edit(task.id)} style={{ gap: 4, paddingVertical: 4 }} accessibilityRole="button">
              <Text style={[ui.text, { color: theme.foreground, fontWeight: '600' }]}>{task.title}</Text>
              <View style={ui.wrap}>
                <Chip label={`P${task.priority}`} />
                <Chip label={task.energy} />
                <Chip label={formatMinutes(task.estimateMin)} />
                {task.dueDate && <Chip label={`due ${DateTime.fromISO(task.dueDate).toFormat('d LLL')}`} color={overdue ? theme.danger : undefined} />}
                {window && <Chip label={`⏱ ${window.name}`} />}
                {task.sequential && <Chip label="sequential" />}
                <Chip label={task.status} color={task.status === 'active' ? theme.accent : undefined} />
              </View>
              <Note tone={trail.length === 0 ? 'warn' : undefined}>{trail.length === 0 ? 'not connected' : trail.join(' › ')}</Note>
            </Pressable>
          );
        })}
      </Section>

      {data && data.done.length > 0 && (
        <Section title={`Done (${data.done.length})`}>
          {data.done.slice(0, 20).map((task) => (
            <View key={task.id} style={ui.inline}>
              <Text style={[ui.text, { flex: 1, color: theme.muted, textDecorationLine: 'line-through' }]} onPress={() => edit(task.id)}>
                {task.title}
              </Text>
              <Button
                label="Reopen"
                onPress={async () => {
                  await setTaskStatus(env().db, task.id, 'backlog');
                  app.changed();
                }}
              />
            </View>
          ))}
        </Section>
      )}
    </ScrollView>
  );
}
