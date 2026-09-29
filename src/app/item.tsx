import { Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { CalendarItem } from '@timeblock/core/calendar/assemble';
import { parseView } from '@timeblock/core/calendar/views';
import { useCalendar } from '@/calendar/use-calendar';
import { hideEvent, setMark, setSegmentsDone, showEvent } from '@/db/mutations';
import { minutesLabel } from '@/format';
import { useApp } from '@/state/app';
import { useTheme, type Theme } from '@/theme';

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
  draft: 'Draft — planned on the desktop, not yet in Google Calendar',
  synced: 'In Google Calendar',
  done: 'Done',
} as const;

function BlockDetails({ item, theme }: { item: CalendarItem; theme: Theme }) {
  const { changed } = useApp();
  const open = item.segments.filter((s) => !s.done).map((s) => s.id);
  const tick = (ids: number[], done: boolean) => {
    setSegmentsDone(ids, done);
    changed();
  };

  return (
    <View style={styles.section}>
      {item.blockState && <Text style={[styles.note, { color: theme.muted }]}>{STATE_LABEL[item.blockState]}</Text>}
      {item.pinned && <Text style={[styles.note, { color: theme.muted }]}>📌 Placed by hand — planning works around it.</Text>}

      <Text style={[styles.heading, { color: theme.foreground }]}>Work in this block</Text>
      {item.segments.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => tick([s.id], !s.done)}
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

      {open.length > 1 && (
        <Pressable onPress={() => tick(open, true)} style={[styles.button, { backgroundColor: theme.accent }]} accessibilityRole="button">
          <Text style={styles.buttonText}>Mark all done</Text>
        </Pressable>
      )}
      <Text style={[styles.note, { color: theme.muted }]}>
        Ticking work off moves its goals&apos; progress; a task is done once its ticked time reaches its estimate. It reaches the desktop with the next sync.
      </Text>
    </View>
  );
}

function EventDetails({ item, theme }: { item: CalendarItem; theme: Theme }) {
  const { changed } = useApp();
  const key = item.hideKey!;
  const toggle = (field: 'important' | 'placeholder', on: boolean) => {
    setMark(key, item.title, field, on);
    changed();
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
        onChange={(on) => toggle('important', on)}
      />
      <Row
        theme={theme}
        label="Placeholder"
        hint="Time held, not taken: planning may schedule work during it."
        value={item.placeholder}
        onChange={(on) => toggle('placeholder', on)}
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
