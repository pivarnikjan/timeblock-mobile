import { eq } from 'drizzle-orm';
import type { CalendarFilters } from '@timeblock/core/calendar/filters';
import { settings } from '@timeblock/core/db/schema';
import { database } from './database';
import { getFilters } from './queries';

/**
 * What the Calendar hides on this phone. Everything else the phone changes goes
 * through core's stores and operations (`@/env`), like the desktop's. Each
 * write goes through SQLite's sync triggers, so it reaches the desktop with
 * the next sync.
 */

/** Read-modify-write of what the Calendar hides. */
export function updateFilters(change: (current: CalendarFilters) => CalendarFilters): void {
  const next = change(getFilters());
  database()
    .orm.update(settings)
    .set({ calendarFilters: JSON.stringify(next), updatedAt: new Date().toISOString() })
    .where(eq(settings.id, 1))
    .run();
}

export function hideEvent(key: string, title: string): void {
  updateFilters((f) => ({ ...f, hiddenEvents: { ...f.hiddenEvents, [key]: title } }));
}

export function showEvent(key: string): void {
  updateFilters((f) => {
    const hiddenEvents = { ...f.hiddenEvents };
    delete hiddenEvents[key];
    return { ...f, hiddenEvents };
  });
}

export function setCalendarHidden(calendarId: string, hidden: boolean): void {
  updateFilters((f) => ({
    ...f,
    hiddenCalendars: hidden ? [...new Set([...f.hiddenCalendars, calendarId])] : f.hiddenCalendars.filter((c) => c !== calendarId),
  }));
}
