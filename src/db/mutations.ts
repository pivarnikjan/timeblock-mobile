import { eq, inArray } from 'drizzle-orm';
import { statusAfterTicks } from '@timeblock/core/blocks';
import type { CalendarFilters } from '@timeblock/core/calendar/filters';
import { blockSegments, eventMarks, settings, tasks } from '@timeblock/core/db/schema';
import { database } from './database';
import { getFilters, tickedMinutes } from './queries';

/**
 * What the phone changes. Each write goes through SQLite's sync triggers like
 * the desktop's, so it reaches the desktop with the next sync.
 */

/**
 * Ticks segments on or off, and keeps their tasks' status in step: a task
 * whose ticked time reaches its estimate is done; unticking reopens it — the
 * same rule as the desktop's.
 */
export function setSegmentsDone(ids: number[], done: boolean): void {
  if (ids.length === 0) return;
  const { orm } = database();
  orm
    .update(blockSegments)
    .set({ doneAt: done ? new Date().toISOString() : null })
    .where(inArray(blockSegments.id, ids))
    .run();

  const taskIds = [
    ...new Set(
      orm
        .select({ taskId: blockSegments.taskId })
        .from(blockSegments)
        .where(inArray(blockSegments.id, ids))
        .all()
        .map((r) => r.taskId),
    ),
  ];
  const ticked = tickedMinutes(taskIds);
  for (const id of taskIds) {
    const task = orm.select().from(tasks).where(eq(tasks.id, id)).get();
    const next = task ? statusAfterTicks(task, ticked.get(id) ?? 0) : null;
    if (next) {
      orm
        .update(tasks)
        .set({ status: next, completedAt: next === 'done' ? new Date().toISOString() : null })
        .where(eq(tasks.id, id))
        .run();
    }
  }
}

export type MarkField = 'important' | 'placeholder';

/** Sets one mark on a Google event (by series key); a row with nothing left marked is removed. */
export function setMark(key: string, title: string, field: MarkField, on: boolean): void {
  const { orm } = database();
  const current = orm.select().from(eventMarks).where(eq(eventMarks.key, key)).get() ?? null;
  const next = {
    important: field === 'important' ? on : (current?.important ?? false),
    placeholder: field === 'placeholder' ? on : (current?.placeholder ?? false),
    notVacation: current?.notVacation ?? false,
  };
  if (!next.important && !next.placeholder && !next.notVacation) {
    orm.delete(eventMarks).where(eq(eventMarks.key, key)).run();
    return;
  }
  const values = { key, title, ...next, updatedAt: new Date().toISOString() };
  orm.insert(eventMarks).values(values).onConflictDoUpdate({ target: eventMarks.key, set: values }).run();
}

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
