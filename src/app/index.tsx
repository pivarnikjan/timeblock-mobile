import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CalendarItem } from '@timeblock/core/calendar/assemble';
import { parseView, type CalendarView } from '@timeblock/core/calendar/views';
import { nowIn } from '@timeblock/core/time/periods';
import { MonthGrid } from '@/calendar/MonthGrid';
import { TimeGrid } from '@/calendar/TimeGrid';
import { useCalendar } from '@/calendar/use-calendar';
import { savedView, saveView } from '@/db/cache';
import { getSettings } from '@/db/queries';
import { ago } from '@/format';
import { SIGN_IN_AVAILABLE } from '@/google/auth';
import { useApp } from '@/state/app';
import { useTheme } from '@/theme';

/** The views a phone offers: the desktop's, less Work week — a week of five narrow columns helps nobody. */
const PHONE_VIEWS: { view: CalendarView; label: string }[] = [
  { view: 'day', label: 'Day' },
  { view: 'week', label: 'Week' },
  { view: 'month', label: 'Month' },
];

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const app = useApp();
  const [view, setView] = useState<CalendarView>(() => {
    const stored = parseView(savedView());
    return stored && stored !== 'workweek' ? stored : 'day';
  });
  const zone = useMemo(() => getSettings().timezone, [app.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [anchor, setAnchor] = useState(() => nowIn(zone).toISODate()!);
  const { layout, problem, eventsReadAt, loading, refresh } = useCalendar(view, anchor);

  // Other screens open the calendar at a day ("Review from Mon 5 Oct →"): taken over once per request.
  const params = useLocalSearchParams<{ date?: string; view?: string }>();
  const request = params.date ? `${params.date}|${params.view ?? ''}` : null;
  const [handled, setHandled] = useState<string | null>(null);
  if (request !== null && request !== handled) {
    setHandled(request);
    setAnchor(params.date!);
    const asked = parseView(params.view ?? null);
    if (asked && asked !== 'workweek') setView(asked);
  }

  const choose = (next: CalendarView) => {
    setView(next);
    saveView(next);
  };
  const open = (item: CalendarItem) => router.push({ pathname: '/item', params: { id: item.id, view, date: anchor } });
  const openDay = (day: string) => {
    choose('day');
    setAnchor(day);
  };

  const status = syncLine(app, problem, eventsReadAt);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.foreground }]} numberOfLines={1}>
            {layout.range.title}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => router.push('/today')} hitSlop={8} accessibilityRole="button" style={[styles.action, { borderColor: theme.border }]}>
              <Text style={[styles.actionText, { color: theme.foreground }]}>My day</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/plan')} hitSlop={8} accessibilityRole="button" style={[styles.action, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
              <Text style={[styles.actionText, { color: '#fff' }]}>Plan</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Settings">
              <Text style={[styles.gear, { color: theme.muted }]}>⚙</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.controls}>
          <View style={styles.nav}>
            <NavButton label="‹" onPress={() => setAnchor(layout.range.prev)} accessibilityLabel="Previous" />
            <NavButton label="Today" onPress={() => setAnchor(layout.today)} />
            <NavButton label="›" onPress={() => setAnchor(layout.range.next)} accessibilityLabel="Next" />
          </View>
          <View style={[styles.segments, { borderColor: theme.border }]}>
            {PHONE_VIEWS.map(({ view: v, label }) => (
              <Pressable
                key={v}
                onPress={() => choose(v)}
                style={[styles.segment, v === view && { backgroundColor: theme.accent }]}
                accessibilityRole="button"
                accessibilityState={{ selected: v === view }}
              >
                <Text style={[styles.segmentText, { color: v === view ? '#fff' : theme.foreground }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={() => router.push('/settings')}>
          <Text style={[styles.status, { color: status.tone === 'bad' ? theme.danger : theme.muted }]} numberOfLines={1}>
            {status.text}
          </Text>
        </Pressable>
      </View>

      {view === 'month' ? (
        <MonthGrid layout={layout} onOpen={open} onOpenDay={openDay} refreshing={app.syncing || loading} onRefresh={() => void refresh()} />
      ) : (
        <TimeGrid layout={layout} onOpen={open} onOpenDay={openDay} refreshing={app.syncing || loading} onRefresh={() => void refresh()} />
      )}
    </SafeAreaView>
  );
}

function NavButton({ label, onPress, accessibilityLabel }: { label: string; onPress(): void; accessibilityLabel?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.navButton, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.navText, { color: theme.foreground }]}>{label}</Text>
    </Pressable>
  );
}

/** One line under the header: how current the phone's copy is. */
function syncLine(
  app: ReturnType<typeof useApp>,
  problem: string | null,
  eventsReadAt: string | null,
): { text: string; tone: 'ok' | 'bad' } {
  if (!SIGN_IN_AVAILABLE) return { text: 'Browser preview — local data only (Settings → Load a demo plan)', tone: 'ok' };
  if (app.restoring) return { text: 'Starting…', tone: 'ok' };
  if (!app.account) return { text: 'Not signed in — tap to sign in and sync with the desktop', tone: 'bad' };
  if (!app.account.complete) return { text: 'Google Drive access missing — tap to grant it', tone: 'bad' };
  if (app.syncing) return { text: 'Syncing…', tone: 'ok' };
  if (app.stale) return { text: 'Away too long to sync safely — tap to choose', tone: 'bad' };
  if (app.syncError) return { text: `Sync failed: ${app.syncError}`, tone: 'bad' };
  const events = problem && eventsReadAt ? ` · meetings as of ${ago(eventsReadAt)}` : problem ? ` · ${problem}` : '';
  return { text: `Synced ${ago(app.lastSyncAt)}${events}`, tone: 'ok' };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  gear: { fontSize: 22 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  actionText: { fontSize: 13, fontWeight: '700' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nav: { flexDirection: 'row', gap: 6 },
  navButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 36, alignItems: 'center' },
  navText: { fontSize: 14, fontWeight: '600' },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  segment: { paddingHorizontal: 10, paddingVertical: 6 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  status: { fontSize: 12 },
});
