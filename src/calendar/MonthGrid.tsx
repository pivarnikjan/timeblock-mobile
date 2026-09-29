import { DateTime } from 'luxon';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CalendarItem, CalendarLayout } from '@timeblock/core/calendar/assemble';
import { textOn } from '@timeblock/core/calendar/colors';
import { layoutLanes } from '@timeblock/core/calendar/layout';
import { useTheme, type Theme } from '@/theme';
import { chipStyle, chipTitle } from './chip';
import { pct } from './units';

const BAR_PX = 16;
/** Height of a cell's date line — bars start just below it. */
const HEADER_PX = 24;
/** Timed items listed per day before collapsing into "+N". */
const MAX_TIMED = 3;

interface Props {
  layout: CalendarLayout;
  onOpen(item: CalendarItem): void;
  onOpenDay(day: string): void;
  refreshing: boolean;
  onRefresh(): void;
}

/** Whole weeks; multi-day events as bars, others as a line with a coloured dot — like the desktop's Month. */
export function MonthGrid({ layout, onOpen, onOpenDay, refreshing, onRefresh }: Props) {
  const theme = useTheme();
  const weeks: string[][] = [];
  for (let i = 0; i < layout.range.days.length; i += 7) weeks.push(layout.range.days.slice(i, i + 7));
  const weekdays = weeks[0].map((d) => DateTime.fromISO(d, { zone: layout.zone }).toFormat('ccc'));

  return (
    <View style={[styles.frame, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.weekdays, { borderColor: theme.border }]}>
        {weekdays.map((w) => (
          <Text key={w} style={[styles.weekday, { color: theme.muted }]}>
            {w}
          </Text>
        ))}
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {weeks.map((week) => (
          <Week key={week[0]} layout={layout} week={week} theme={theme} onOpen={onOpen} onOpenDay={onOpenDay} />
        ))}
      </ScrollView>
    </View>
  );
}

function Week({
  layout,
  week,
  theme,
  onOpen,
  onOpenDay,
}: {
  layout: CalendarLayout;
  week: string[];
  theme: Theme;
  onOpen(item: CalendarItem): void;
  onOpenDay(day: string): void;
}) {
  const weekStart = DateTime.fromISO(week[0], { zone: layout.zone });
  const index = (dt: DateTime) => Math.round(dt.startOf('day').diff(weekStart, 'days').days);
  const exclusiveEnd = (item: CalendarItem) =>
    index(item.allDay || item.end.equals(item.end.startOf('day')) ? item.end.minus({ milliseconds: 1 }) : item.end) + 1;

  const bars = layoutLanes(
    layout.items.filter((i) => i.allDay || i.multiDay).map((item) => ({ item, startDay: index(item.start), endDay: exclusiveEnd(item) })),
    7,
  );
  const laneCount = bars.reduce((max, b) => Math.max(max, b.lane + 1), 0);

  return (
    <View style={[styles.week, { borderColor: theme.border }]}>
      {week.map((day, i) => {
        const dt = DateTime.fromISO(day, { zone: layout.zone });
        const inMonth = layout.range.month === null || dt.toFormat('yyyy-MM') === layout.range.month;
        const isToday = day === layout.today;
        const timed = layout.items.filter((item) => !item.allDay && !item.multiDay && item.start.toISODate() === day);
        const extra = timed.length - MAX_TIMED;
        return (
          <Pressable
            key={day}
            onPress={() => onOpenDay(day)}
            style={[
              styles.cell,
              i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
              !inMonth && { backgroundColor: theme.background },
            ]}
          >
            <View style={[styles.dateBubble, isToday && { backgroundColor: theme.today }]}>
              <Text style={[styles.date, { color: isToday ? textOn(theme.today) : inMonth ? theme.foreground : theme.muted }]}>
                {dt.day === 1 ? dt.toFormat('d LLL') : dt.toFormat('d')}
              </Text>
            </View>
            <View style={{ height: laneCount * BAR_PX }} />
            {timed.slice(0, MAX_TIMED).map((item) => (
              <Pressable key={item.id} onPress={() => onOpen(item)} style={styles.timed}>
                <View style={[styles.dot, item.draft ? { borderWidth: 1, borderColor: item.color, borderStyle: 'dashed' } : { backgroundColor: item.color }]} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.timedText,
                    { color: theme.foreground },
                    item.important && { fontWeight: '700' },
                    item.declined && { textDecorationLine: 'line-through' },
                  ]}
                >
                  {chipTitle(item)}
                </Text>
              </Pressable>
            ))}
            {extra > 0 && <Text style={[styles.more, { color: theme.muted }]}>+{extra}</Text>}
          </Pressable>
        );
      })}

      {/* Multi-day and all-day events as bars spanning the days they cover */}
      {bars.map(({ item, lane, col, span, continuesBefore, continuesAfter }) => {
        const chip = chipStyle(item, theme);
        return (
          <Pressable
            key={item.id}
            onPress={() => onOpen(item)}
            style={[
              styles.bar,
              chip.box,
              {
                top: HEADER_PX + lane * BAR_PX + 1,
                height: BAR_PX - 2,
                left: pct((col / 7) * 100),
                width: pct((span / 7) * 100),
                borderTopLeftRadius: continuesBefore ? 0 : 3,
                borderBottomLeftRadius: continuesBefore ? 0 : 3,
                borderTopRightRadius: continuesAfter ? 0 : 3,
                borderBottomRightRadius: continuesAfter ? 0 : 3,
              },
            ]}
          >
            <Text numberOfLines={1} style={[styles.barText, chip.text]}>
              {chipTitle(item)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth },
  weekdays: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 5, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  week: { flexDirection: 'row', minHeight: 96, borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { flex: 1, paddingBottom: 3 },
  dateBubble: {
    alignSelf: 'center',
    marginTop: 2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  date: { fontSize: 12 },
  timed: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  timedText: { flex: 1, fontSize: 9 },
  more: { fontSize: 9, fontWeight: '600', paddingHorizontal: 3 },
  bar: { position: 'absolute', justifyContent: 'center', paddingHorizontal: 3, marginHorizontal: 1, overflow: 'hidden' },
  barText: { fontSize: 9, fontWeight: '600' },
});
