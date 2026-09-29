import { and, asc, eq, gt, gte, inArray, isNotNull, lt, lte } from 'drizzle-orm';
import type { BlockWithSegments } from '@timeblock/core/blocks';
import { parseFilters, type CalendarFilters } from '@timeblock/core/calendar/filters';
import {
  blocks,
  blockSegments,
  eventMarks,
  settings,
  tasks,
  timeWindows,
  vacations,
  type Block,
  type EventMark,
  type Settings,
  type TimeWindow,
  type Vacation,
} from '@timeblock/core/db/schema';
import { database } from './database';

/**
 * What the phone reads from its copy of the plan. The same queries as the
 * desktop's repositories (lib/repo), over expo-sqlite.
 */

export function getSettings(): Settings {
  const row = database().orm.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('Settings row missing — database was not seeded');
  return row;
}

export function getFilters(): CalendarFilters {
  return parseFilters(getSettings().calendarFilters);
}

/** Time windows earliest first — the order the Calendar legend and the planner use. */
export function listWindows(): TimeWindow[] {
  return database()
    .orm.select()
    .from(timeWindows)
    .orderBy(asc(timeWindows.startTime), asc(timeWindows.endTime), asc(timeWindows.name), asc(timeWindows.id))
    .all();
}

function withSegments(rows: Block[]): BlockWithSegments[] {
  if (rows.length === 0) return [];
  const segs = database()
    .orm.select({ segment: blockSegments, task: tasks })
    .from(blockSegments)
    .innerJoin(tasks, eq(blockSegments.taskId, tasks.id))
    .where(
      inArray(
        blockSegments.blockId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(blockSegments.sortOrder), asc(blockSegments.id))
    .all();
  return rows.map((block) => ({
    ...block,
    segments: segs.filter((s) => s.segment.blockId === block.id).map((s) => ({ ...s.segment, task: s.task })),
  }));
}

/** Blocks on the local dates `from` … `to` (inclusive). */
export function blocksForRange(from: string, to: string): BlockWithSegments[] {
  const rows = database()
    .orm.select()
    .from(blocks)
    .where(and(gte(blocks.date, from), lte(blocks.date, to), inArray(blocks.state, ['draft', 'synced', 'done'])))
    .orderBy(asc(blocks.startsAt))
    .all();
  return withSegments(rows);
}

export function getBlock(id: number): BlockWithSegments | null {
  const rows = database().orm.select().from(blocks).where(eq(blocks.id, id)).all();
  return withSegments(rows)[0] ?? null;
}

/** Every event mark, by event key. */
export function listMarks(): Map<string, EventMark> {
  return new Map(
    database()
      .orm.select()
      .from(eventMarks)
      .all()
      .map((m) => [m.key, m]),
  );
}

/** Vacations overlapping [from, to) (UTC ISO). */
export function vacationsBetween(from: string, to: string): Vacation[] {
  return database()
    .orm.select()
    .from(vacations)
    .where(and(lt(vacations.startsAt, to), gt(vacations.endsAt, from)))
    .orderBy(asc(vacations.startsAt))
    .all();
}

/** Vacations made from a Google event, by that event (`calendarId|eventId`). */
export function vacationsBySourceEvent(): Map<string, Vacation> {
  const rows = database().orm.select().from(vacations).where(isNotNull(vacations.sourceEvent)).all();
  return new Map(rows.map((v) => [v.sourceEvent!, v]));
}

/** Minutes ticked off for these tasks, across every day. */
export function tickedMinutes(taskIds: number[]): Map<number, number> {
  if (taskIds.length === 0) return new Map();
  const rows = database()
    .orm.select({ taskId: blockSegments.taskId, minutes: blockSegments.minutes })
    .from(blockSegments)
    .where(and(isNotNull(blockSegments.doneAt), inArray(blockSegments.taskId, taskIds)))
    .all();
  const out = new Map<number, number>();
  for (const r of rows) out.set(r.taskId, (out.get(r.taskId) ?? 0) + r.minutes);
  return out;
}
