import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';
import { REVIEW_DAYS } from '@timeblock/core/calendar/load';
import { multiDayReviews, type MultiDayReview } from '@timeblock/core/calendar/multi-day';
import { listRangeEvents } from '@timeblock/core/google/reads';
import { listMarks } from '@timeblock/core/store/event-marks';
import { getSettings } from '@timeblock/core/store/settings';
import { listVacations } from '@timeblock/core/store/vacations';
import { nowIn } from '@timeblock/core/time/periods';
import { cachedReviewEvents, saveReviewEvents } from '@/db/cache';
import { env } from '@/env';
import { useApp } from '@/state/app';
import { useLoad } from '@/use-load';

/** Google is read again for the reviews at most this often, unless refreshed by hand. */
const READ_EVERY_MS = 15 * 60_000;
let lastRead = 0;

/**
 * Multi-day events from today on that still need a decision (is it a
 * vacation?), and vacations whose event moved in Google — core's
 * `multiDayReviews`, as the desktop lists them above its calendar.
 *
 * The next three months of events are read from Google now and then and kept
 * for offline use; the list itself is worked out again after every change
 * here, so an answer takes it off at once.
 */
export function useMultiDayReviews(): { reviews: MultiDayReview[]; refresh(): Promise<void> } {
  const { version, account } = useApp();
  const [readVersion, setReadVersion] = useState(0);
  const signedIn = account?.calendar === true;

  /** Reads the next three months from Google into the offline copy; resolves true when it did. */
  const read = useCallback(async (): Promise<boolean> => {
    if (!signedIn) return false;
    const e = env();
    const zone = (await getSettings(e.db)).timezone;
    const from = nowIn(zone).toISODate()!;
    const until = DateTime.fromISO(from, { zone }).plus({ days: REVIEW_DAYS }).toISODate()!;
    try {
      saveReviewEvents(await listRangeEvents(e, from, until, zone));
      lastRead = Date.now();
      return true;
    } catch {
      // Offline or refused: the last read stands.
      return false;
    }
  }, [signedIn]);

  const refresh = useCallback(async () => {
    if (await read()) setReadVersion((v) => v + 1);
  }, [read]);

  useEffect(() => {
    if (Date.now() - lastRead <= READ_EVERY_MS) return;
    let current = true;
    void read().then((fresh) => fresh && current && setReadVersion((v) => v + 1));
    return () => {
      current = false;
    };
  }, [read, version]);

  const { data } = useLoad(async () => {
    const cached = cachedReviewEvents();
    if (!cached) return [];
    const { db } = env();
    const [settings, marks, vacations] = await Promise.all([getSettings(db), listMarks(db), listVacations(db)]);
    const zone = settings.timezone;
    return multiDayReviews(cached.events, { marks, vacations, ownCalendarId: settings.targetCalendarId, now: nowIn(zone).toUTC().toISO()!, zone });
  }, [version, readVersion]);

  return { reviews: data ?? [], refresh };
}
