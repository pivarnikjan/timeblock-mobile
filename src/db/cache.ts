import { DateTime } from 'luxon';
import type { CalendarEvent, CalendarSummary } from '@timeblock/core/google/events';
import { database } from './database';

/**
 * What the phone last read from Google Calendar, so the calendar shows your
 * meetings offline too. Kept per day (an event is stored under every day it
 * touches), in the phone-only `phone_cache` table; never synced.
 */

function read<T>(key: string): { value: T; savedAt: string } | null {
  const row = database().sqlite.getFirstSync<{ value: string; saved_at: string }>(
    'SELECT value, saved_at FROM phone_cache WHERE key = ?',
    [key],
  );
  return row ? { value: JSON.parse(row.value) as T, savedAt: row.saved_at } : null;
}

function write(key: string, value: unknown, savedAt: string): void {
  database().sqlite.runSync('INSERT OR REPLACE INTO phone_cache (key, value, saved_at) VALUES (?, ?, ?)', [
    key,
    JSON.stringify(value),
    savedAt,
  ]);
}

export function cachedCalendars(): CalendarSummary[] {
  return read<CalendarSummary[]>('calendars')?.value ?? [];
}

export function saveCalendars(calendars: CalendarSummary[]): void {
  write('calendars', calendars, new Date().toISOString());
}

/** The cached events touching any of `days`, and when the oldest of those days was read. */
export function cachedEvents(days: string[]): { events: CalendarEvent[]; readAt: string | null } {
  const byId = new Map<string, CalendarEvent>();
  let readAt: string | null = null;
  for (const day of days) {
    const hit = read<CalendarEvent[]>(`events:${day}`);
    if (!hit) continue;
    for (const e of hit.value) byId.set(`${e.calendarId}:${e.id}`, e);
    if (readAt === null || hit.savedAt < readAt) readAt = hit.savedAt;
  }
  return { events: [...byId.values()].sort((a, b) => a.start.localeCompare(b.start)), readAt };
}

/** Stores what Google said about `days`: each day's events replace what was cached for it. */
export function saveEvents(days: string[], events: CalendarEvent[], zone: string): void {
  const savedAt = new Date().toISOString();
  const { sqlite } = database();
  sqlite.withTransactionSync(() => {
    for (const day of days) {
      const start = DateTime.fromISO(day, { zone }).startOf('day');
      const from = start.toUTC().toISO()!;
      const to = start.plus({ days: 1 }).toUTC().toISO()!;
      write(
        `events:${day}`,
        events.filter((e) => e.start < to && e.end > from),
        savedAt,
      );
    }
  });
}

/** The view the Calendar opens in on this phone — Day until you choose another. */
export function savedView(): string | null {
  return read<string>('view')?.value ?? null;
}

export function saveView(view: string): void {
  write('view', view, new Date().toISOString());
}

/** Forgets cached days long past, so the cache does not grow for ever. */
export function pruneEventCache(keepFrom: string): void {
  database().sqlite.runSync("DELETE FROM phone_cache WHERE key LIKE 'events:%' AND key < ?", [`events:${keepFrom}`]);
}
