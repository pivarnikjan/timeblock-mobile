import { DateTime } from 'luxon';
import type { CalendarEvent, CalendarSummary } from '@timeblock/core/google/events';
import { blocks, blockSegments, horizons, tasks, timeWindows, vacations } from '@timeblock/core/db/schema';
import { saveCalendars, saveEvents } from '@/db/cache';
import { database } from '@/db/database';
import { getSettings } from '@/db/queries';

/**
 * A made-up plan for trying the app in a browser, where there is no Google
 * sign-in (Settings → Development, web and development builds only). On a
 * phone the plan comes from the desktop.
 */
export function loadDemoPlan(): void {
  const { orm } = database();
  const zone = getSettings().timezone;
  const today = DateTime.now().setZone(zone).startOf('day');
  const at = (day: number, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return today.plus({ days: day, hours: h, minutes: m });
  };
  const utc = (dt: DateTime) => dt.toUTC().toISO()!;

  const windows = orm.select().from(timeWindows).all();
  const learning = windows.find((w) => w.name === 'Learning')?.id ?? null;
  const work = windows.find((w) => w.name === 'Work')?.id ?? null;

  const [goal] = orm
    .insert(horizons)
    .values({ level: 'year', title: 'CIS-ITSM Certification', periodStart: `${today.year}-01-01`, periodEnd: `${today.year}-12-31`, windowId: learning })
    .returning()
    .all();
  const task = (title: string, estimateMin: number, windowId: number | null) =>
    orm.insert(tasks).values({ title, estimateMin, horizonId: goal.id, windowId, status: 'active' }).returning().all()[0];
  const course = task('Service Portfolio Management', 120, learning);
  const quiz = task('Practice quiz', 30, learning);
  const report = task('Quarterly report', 90, work);

  const block = (day: number, from: string, to: string, windowId: number | null, parts: { taskId: number; minutes: number; done?: boolean }[]) => {
    const [row] = orm
      .insert(blocks)
      .values({ date: at(day, from).toISODate()!, startsAt: utc(at(day, from)), endsAt: utc(at(day, to)), windowId, state: 'synced' })
      .returning()
      .all();
    parts.forEach((p, i) =>
      orm
        .insert(blockSegments)
        .values({ blockId: row.id, taskId: p.taskId, minutes: p.minutes, sortOrder: i, doneAt: p.done ? new Date().toISOString() : null })
        .run(),
    );
  };
  block(-1, '10:30', '11:30', learning, [{ taskId: course.id, minutes: 60, done: true }]);
  block(0, '10:30', '11:30', learning, [{ taskId: course.id, minutes: 60 }]);
  block(0, '11:45', '12:15', learning, [{ taskId: quiz.id, minutes: 30 }]);
  block(0, '14:00', '15:30', work, [{ taskId: report.id, minutes: 90 }]);
  block(1, '10:30', '11:30', learning, [{ taskId: course.id, minutes: 60 }]);

  orm
    .insert(vacations)
    .values({ startsAt: utc(at(9, '00:00')), endsAt: utc(at(12, '00:00')), windows: [learning, work].filter(Boolean).join(','), note: 'Crete' })
    .run();

  const calendars: CalendarSummary[] = [
    { id: 'demo-personal', summary: 'Personal', primary: true, color: '#039BE5', background: '#039BE5', writable: true },
    { id: 'demo-work', summary: 'Work', primary: false, color: '#7986CB', background: '#7986CB', writable: false },
  ];
  const event = (id: string, calendarId: string, title: string, start: DateTime, end: DateTime, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id,
    calendarId,
    seriesId: id,
    title,
    start: utc(start),
    end: utc(end),
    allDay: false,
    busy: true,
    declined: false,
    colorId: null,
    plannedColorId: null,
    blockId: null,
    vacationId: null,
    recurring: false,
    htmlLink: null,
    ...extra,
  });
  const days = Array.from({ length: 21 }, (_, i) => today.minus({ days: 7 }).plus({ days: i }));
  const events: CalendarEvent[] = [
    ...days.filter((d) => d.weekday <= 5).map((d) => event(`standup-${d.toISODate()}`, 'demo-work', 'Team stand-up', d.set({ hour: 9, minute: 30 }), d.set({ hour: 9, minute: 45 }), { seriesId: 'standup', recurring: true })),
    event('review', 'demo-work', 'Design review', at(0, '15:30'), at(0, '16:30')),
    event('dentist', 'demo-personal', 'Dentist', at(1, '16:00'), at(1, '17:00')),
    event('declined', 'demo-work', 'All-hands (declined)', at(2, '13:00'), at(2, '14:00'), { declined: true, busy: false }),
    event('conference', 'demo-work', 'ServiceNow Knowledge', today.plus({ days: 3 }), today.plus({ days: 6 }), { allDay: true }),
  ];
  saveCalendars(calendars);
  saveEvents(
    days.map((d) => d.toISODate()!),
    events,
    zone,
  );
}
