import { DateTime } from 'luxon';
import {
  calendarSummaries,
  parseEvent,
  type CalendarEvent,
  type CalendarSummary,
  type GoogleCalendarListEntry,
  type GoogleEvent,
} from '@timeblock/core/google/events';
import { accessToken, renewAccessToken } from './auth';

/**
 * Google Calendar's REST API, read the way the desktop reads it: every calendar
 * ticked in Google's own list, every event touching the range, parsed by core.
 */

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

/** Runs `call` with an access token, once more with a fresh one if Google refuses the first (401). */
export async function withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
  const token = await accessToken();
  try {
    return await call(token);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 401) throw error;
    return call(await renewAccessToken(token));
  }
}

const API = 'https://www.googleapis.com/calendar/v3';

async function get<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let message = `Google Calendar answered ${res.status}`;
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // Keep the status line.
    }
    throw new GoogleApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const query = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

export async function fetchCalendars(token: string): Promise<CalendarSummary[]> {
  const body = await get<{ items?: GoogleCalendarListEntry[] }>(
    `${API}/users/me/calendarList?${query({ maxResults: '250', showHidden: 'false' })}`,
    token,
  );
  return calendarSummaries(body.items ?? []);
}

/** Every event touching the local dates `from` … `toExclusive`, across `calendars`. */
export async function fetchEvents(
  calendars: CalendarSummary[],
  from: string,
  toExclusive: string,
  zone: string,
  token: string,
): Promise<CalendarEvent[]> {
  const timeMin = DateTime.fromISO(from, { zone }).startOf('day').toUTC().toISO()!;
  const timeMax = DateTime.fromISO(toExclusive, { zone }).startOf('day').toUTC().toISO()!;
  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      const events: CalendarEvent[] = [];
      let pageToken: string | undefined;
      do {
        const body = await get<{ items?: GoogleEvent[]; nextPageToken?: string }>(
          `${API}/calendars/${encodeURIComponent(cal.id)}/events?${query({
            timeMin,
            timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '2500',
            pageToken,
          })}`,
          token,
        );
        for (const item of body.items ?? []) {
          const event = parseEvent(item, cal.id, zone);
          if (event) events.push(event);
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
      return events;
    }),
  );
  return perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start));
}
