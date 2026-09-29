import { DateTime } from 'luxon';
import { useMemo, useRef } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CalendarItem, CalendarLayout } from '@timeblock/core/calendar/assemble';
import { textOn } from '@timeblock/core/calendar/colors';
import { layoutColumns, layoutLanes } from '@timeblock/core/calendar/layout';
import { vacationPieces, type VacationPiece } from '@timeblock/core/calendar/vacation-overlay';
import { useTheme, type Theme } from '@/theme';
import { chipStyle, chipTitle } from './chip';
import { pct } from './units';

/** An hour is 56 points tall — a 30-minute block still fits a line and its time. */
const PX_PER_MIN = 56 / 60;
const LANE_PX = 20;
const GUTTER = 40;

interface Props {
  layout: CalendarLayout;
  onOpen(item: CalendarItem): void;
  onOpenDay(day: string): void;
  refreshing: boolean;
  onRefresh(): void;
}

/** Day and week views: hours down the side, a column per day — the desktop's time grid on a phone. */
export function TimeGrid({ layout, onOpen, onOpenDay, refreshing, onRefresh }: Props) {
  const theme = useTheme();
  const { days } = layout.range;
  const { startMin, endMin } = layout.hours;
  const height = (endMin - startMin) * PX_PER_MIN;
  const first = DateTime.fromISO(days[0], { zone: layout.zone });

  const spanning = layout.items.filter((i) => i.allDay || i.multiDay);
  const timed = layout.items.filter((i) => !i.allDay && !i.multiDay);
  const lanes = layoutLanes(
    spanning.map((item) => ({ item, startDay: dayIndex(first, item.start), endDay: endIndex(first, item) })),
    days.length,
  );
  const laneCount = lanes.reduce((max, l) => Math.max(max, l.lane + 1), 0);
  const away = useMemo(
    () =>
      vacationPieces(
        layout.items.flatMap((i) => (i.vacation ? [i.vacation] : [])),
        days,
        layout.zone,
        layout.hours,
      ),
    [layout, days],
  );

  // Open an hour before now when today is shown, else an hour before the first timed item.
  const minuteOf = (dt: DateTime) => dt.diff(dt.startOf('day'), 'minutes').minutes;
  const focus = days.includes(layout.today)
    ? minuteOf(layout.now)
    : timed.reduce((min, i) => Math.min(min, minuteOf(i.start)), Infinity);
  const initialTop = Number.isFinite(focus) ? Math.max(0, (focus - 60 - startMin) * PX_PER_MIN) : 0;
  const scrolled = useRef<string | null>(null);

  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m < endMin; m += 60) hours.push(m);

  return (
    <View style={[styles.frame, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Day headers */}
      <View style={[styles.row, { borderColor: theme.border }]}>
        <View style={{ width: GUTTER }} />
        {days.map((day) => {
          const dt = DateTime.fromISO(day, { zone: layout.zone });
          const isToday = day === layout.today;
          return (
            <Pressable key={day} style={styles.dayHead} onPress={() => onOpenDay(day)} accessibilityRole="button">
              <Text style={[styles.weekday, { color: isToday ? theme.today : theme.muted }]}>{dt.toFormat('ccc')}</Text>
              <View style={[styles.dateBubble, isToday && { backgroundColor: theme.today }]}>
                <Text style={[styles.date, { color: isToday ? textOn(theme.today) : theme.foreground }]}>{dt.toFormat('d')}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* All-day and multi-day events, as bars across the days they cover */}
      {laneCount > 0 && (
        <View style={[styles.row, { borderColor: theme.border }]}>
          <View style={{ width: GUTTER }} />
          <View style={{ flex: 1, height: laneCount * LANE_PX + 4 }}>
            {lanes.map(({ item, lane, col, span, continuesBefore, continuesAfter }) => {
              const chip = chipStyle(item, theme);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onOpen(item)}
                  style={[
                    styles.bar,
                    chip.box,
                    {
                      top: lane * LANE_PX + 2,
                      height: LANE_PX - 3,
                      left: pct((col / days.length) * 100),
                      width: pct((span / days.length) * 100),
                      borderTopLeftRadius: continuesBefore ? 0 : 4,
                      borderBottomLeftRadius: continuesBefore ? 0 : 4,
                      borderTopRightRadius: continuesAfter ? 0 : 4,
                      borderBottomRightRadius: continuesAfter ? 0 : 4,
                    },
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.barText, chip.text]}>
                    {continuesBefore ? '◂ ' : ''}
                    {chipTitle(item)}
                    {continuesAfter ? ' ▸' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Time grid */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ref={(view) => {
          // Scroll to "now" once per view shown, not on every re-render.
          const key = `${layout.range.view}:${days[0]}`;
          if (view && scrolled.current !== key) {
            scrolled.current = key;
            requestAnimationFrame(() => view.scrollTo({ y: initialTop, animated: false }));
          }
        }}
      >
        <View style={{ flexDirection: 'row', height }}>
          <View style={{ width: GUTTER }}>
            {hours.map((m) => (
              <Text key={m} style={[styles.hour, { top: (m - startMin) * PX_PER_MIN - 6, color: theme.muted }]}>
                {m === startMin ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:00`}
              </Text>
            ))}
          </View>
          {days.map((day) => (
            <DayColumn
              key={day}
              layout={layout}
              day={day}
              timed={timed}
              hours={hours}
              away={away[day] ?? []}
              theme={theme}
              onOpen={onOpen}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const dayIndex = (first: DateTime, dt: DateTime) => Math.round(dt.startOf('day').diff(first.startOf('day'), 'days').days);

/** Exclusive end day of an all-day or multi-day item, as an index into the visible days. */
function endIndex(first: DateTime, item: CalendarItem): number {
  // All-day ends are exclusive midnights; a timed multi-day event covers the day its end falls in.
  const lastDay = item.allDay || item.end.equals(item.end.startOf('day')) ? item.end.minus({ milliseconds: 1 }) : item.end;
  return dayIndex(first, lastDay) + 1;
}

function DayColumn({
  layout,
  day,
  timed,
  hours,
  away,
  theme,
  onOpen,
}: {
  layout: CalendarLayout;
  day: string;
  timed: CalendarItem[];
  hours: number[];
  away: VacationPiece[];
  theme: Theme;
  onOpen(item: CalendarItem): void;
}) {
  const { startMin, endMin } = layout.hours;
  const dayStart = DateTime.fromISO(day, { zone: layout.zone }).startOf('day');
  const visibleStart = dayStart.plus({ minutes: startMin });
  const visibleEnd = dayStart.plus({ minutes: endMin });
  const toMin = (dt: DateTime) => dt.diff(dayStart, 'minutes').minutes - startMin;

  // Timed items clipped to this day's visible hours; one crossing midnight shows on both days.
  const pieces = timed
    .filter((item) => item.start < visibleEnd && item.end > visibleStart)
    .map((item) => ({
      item,
      start: toMin(DateTime.max(item.start, visibleStart)),
      end: Math.max(toMin(DateTime.min(item.end, visibleEnd)), toMin(DateTime.max(item.start, visibleStart)) + 15),
    }));
  const nowTop = day === layout.today ? toMin(layout.now) : null;
  const inFront = layout.filters.windowsInFront;

  const bands = (layout.bands[day] ?? []).map((band) => {
    const top = Math.max(0, toMin(band.start)) * PX_PER_MIN;
    const bottom = Math.min(endMin - startMin, toMin(band.end)) * PX_PER_MIN;
    if (bottom <= top) return null;
    return (
      <View
        key={`${band.id}@${band.start.toMillis()}`}
        pointerEvents="none"
        style={[
          styles.band,
          {
            top,
            height: bottom - top,
            backgroundColor: `${band.color}${inFront ? '24' : '14'}`,
            borderLeftColor: band.color,
            borderTopColor: `${band.color}66`,
            borderBottomColor: `${band.color}66`,
            zIndex: inFront ? 3 : 0,
          },
        ]}
      >
        {band.labelled && (
          <Text numberOfLines={1} style={[styles.bandName, { color: band.color }]}>
            {band.name}
          </Text>
        )}
      </View>
    );
  });

  return (
    <View style={[styles.column, { borderColor: theme.border }]}>
      {hours.map((m) => (
        <View key={m} style={[styles.hourLine, { top: (m - startMin) * PX_PER_MIN, borderColor: theme.border }]} />
      ))}

      {bands}

      {layoutColumns(pieces).map(({ item, start, end, col, cols }) => {
        const chip = chipStyle(item, theme);
        const heightPx = (end - start) * PX_PER_MIN;
        const boxHeight = Math.max(heightPx - 2, 14);
        // A 15-minute meeting is a thin strip: one small line, no padding, so its title is not cut.
        const thin = boxHeight < 22;
        const note = item.draft ? ' · draft' : item.placeholder ? ' · placeholder' : '';
        return (
          <Pressable
            key={`${item.id}@${day}`}
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.start.toFormat('HH:mm')} to ${item.end.toFormat('HH:mm')}`}
            style={[
              styles.chip,
              chip.box,
              thin && { paddingVertical: 0, justifyContent: 'center' },
              {
                top: start * PX_PER_MIN + 1,
                height: boxHeight,
                left: pct((col / cols) * 100),
                width: pct(100 / cols),
                zIndex: 2,
              },
            ]}
          >
            <Text
              numberOfLines={heightPx >= 44 ? 2 : 1}
              style={[styles.chipTitle, chip.text, thin && { fontSize: 10, lineHeight: boxHeight - 2 }]}
            >
              {chipTitle(item)}
            </Text>
            {heightPx >= 30 && (
              <Text numberOfLines={1} style={[styles.chipTime, chip.text]}>
                {item.start.toFormat('HH:mm')} – {item.end.toFormat('HH:mm')}
                {note}
              </Text>
            )}
          </Pressable>
        );
      })}

      {/* Vacation: red over everything, so it is plain what falls inside it */}
      {away.map((piece) => (
        <View
          key={piece.id}
          pointerEvents="none"
          style={[
            styles.vacation,
            { top: piece.top * PX_PER_MIN, height: piece.length * PX_PER_MIN, borderColor: theme.vacation, backgroundColor: `${theme.vacation}26` },
          ]}
        >
          {piece.labelled && piece.length * PX_PER_MIN >= 60 && (
            <Text style={[styles.vacationLabel, { color: theme.vacation }]}>VACATION</Text>
          )}
        </View>
      ))}

      {nowTop !== null && nowTop >= 0 && nowTop <= endMin - startMin && (
        <View pointerEvents="none" style={[styles.now, { top: nowTop * PX_PER_MIN, backgroundColor: theme.now }]}>
          <View style={[styles.nowDot, { backgroundColor: theme.now }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  dayHead: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 },
  weekday: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  dateBubble: { minWidth: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  date: { fontSize: 17 },
  bar: { position: 'absolute', justifyContent: 'center', paddingHorizontal: 4, marginHorizontal: 1, overflow: 'hidden' },
  barText: { fontSize: 11, fontWeight: '600' },
  hour: { position: 'absolute', right: 4, fontSize: 10, fontVariant: ['tabular-nums'] },
  column: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  hourLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderLeftWidth: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  bandName: { position: 'absolute', right: 3, top: 1, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  chip: { position: 'absolute', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, overflow: 'hidden', marginHorizontal: 1 },
  chipTitle: { fontSize: 12, fontWeight: '600' },
  chipTime: { fontSize: 11, opacity: 0.85 },
  vacation: { position: 'absolute', left: 0, right: 0, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  vacationLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 3, transform: [{ rotate: '-65deg' }] },
  now: { position: 'absolute', left: 0, right: 0, height: 2, zIndex: 5 },
  nowDot: { position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: 5 },
});
