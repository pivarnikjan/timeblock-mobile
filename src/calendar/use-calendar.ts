import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { assembleCalendar, type CalendarLayout } from '@timeblock/core/calendar/assemble';
import { calendarRange, type CalendarView } from '@timeblock/core/calendar/views';
import { nowIn } from '@timeblock/core/time/periods';
import { cachedCalendars, cachedEvents, pruneEventCache, saveCalendars, saveEvents } from '@/db/cache';
import { blocksForRange, getFilters, getSettings, listMarks, listWindows, vacationsBetween, vacationsBySourceEvent } from '@/db/queries';
import { fetchCalendars, fetchEvents, withToken } from '@/google/calendar';
import { useApp } from '@/state/app';

/** The current time in `zone`, moving on every minute (for the now line). */
export function useNow(zone: string): DateTime {
  const [now, setNow] = useState(() => nowIn(zone));
  useEffect(() => {
    const timer = setInterval(() => setNow(nowIn(zone)), 60_000);
    return () => clearInterval(timer);
  }, [zone]);
  return now;
}

export interface CalendarState {
  layout: CalendarLayout;
  /** When the Google events shown were read, if they come from the offline copy. */
  eventsReadAt: string | null;
  /** Why Google could not be read just now (offline, signed out…), if it could not. */
  problem: string | null;
  loading: boolean;
  /** Syncs with the desktop and reads Google again. */
  refresh(): Promise<void>;
}

/**
 * A calendar view, the same as the desktop draws it (core's assembleCalendar):
 * the plan from the phone's database, and Google events — straight away from
 * the offline copy, then fresh from Google when online.
 */
export function useCalendar(view: CalendarView, anchor: string): CalendarState {
  const { version, account, sync } = useApp();
  const settings = useMemo(() => getSettings(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const zone = settings.timezone;
  const now = useNow(zone);
  const range = useMemo(() => calendarRange(view, anchor, zone), [view, anchor, zone]);
  const [eventsVersion, setEventsVersion] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  /** The range Google was last read for (successfully or not). */
  const [readKey, setReadKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const first = range.days[0];
  const last = range.days[range.days.length - 1];
  const afterLast = DateTime.fromISO(last, { zone }).plus({ days: 1 }).toISODate()!;
  const key = `${first}/${afterLast}/${zone}`;
  const signedIn = account?.complete === true;

  /** Reads the range's events from Google into the offline copy; resolves to the problem, if any. */
  const readGoogle = useCallback(async (): Promise<string | null> => {
    if (!signedIn) return null;
    try {
      await withToken(async (token) => {
        const calendars = await fetchCalendars(token);
        saveCalendars(calendars);
        saveEvents(range.days, await fetchEvents(calendars, first, afterLast, zone, token), zone);
      });
      pruneEventCache(nowIn(zone).minus({ days: 90 }).toISODate()!);
      return null;
    } catch (error) {
      return /network|fetch|resolve host/i.test((error as Error).message) ? 'Offline' : (error as Error).message;
    }
  }, [signedIn, range, first, afterLast, zone]);

  const settle = useCallback(
    (outcome: string | null) => {
      setProblem(outcome);
      setReadKey(key);
      setEventsVersion((v) => v + 1);
    },
    [key],
  );

  // Each range shown is read from Google once; the offline copy shows meanwhile.
  useEffect(() => {
    let current = true;
    void readGoogle().then((outcome) => current && settle(outcome));
    return () => {
      current = false;
    };
  }, [readGoogle, settle]);
  const loading = refreshing || (signedIn && readKey !== key);

  const layout = useMemo(() => {
    const rangeStart = DateTime.fromISO(first, { zone }).toUTC().toISO()!;
    const rangeEnd = DateTime.fromISO(afterLast, { zone }).toUTC().toISO()!;
    const { events } = cachedEvents(range.days);
    return assembleCalendar({
      range,
      zone,
      now,
      settings,
      filters: getFilters(),
      windows: listWindows(),
      events,
      calendars: cachedCalendars(),
      blocks: blocksForRange(first, last),
      marks: listMarks(),
      vacations: vacationsBetween(rangeStart, rangeEnd),
      converted: vacationsBySourceEvent(),
    });
  }, [range, zone, now, settings, first, last, afterLast, version, eventsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventsReadAt = useMemo(() => cachedEvents(range.days).readAt, [range, eventsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [, outcome] = await Promise.all([sync(), readGoogle()]);
      settle(outcome);
    } finally {
      setRefreshing(false);
    }
  }, [sync, readGoogle, settle]);

  return { layout, eventsReadAt, problem, loading, refresh };
}
