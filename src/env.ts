import type { Env, GoogleStatus } from '@timeblock/core/env';
import { googleCalendar, type CalendarApi } from '@timeblock/core/google/calendar-api';
import { database } from '@/db/database';
import { accessToken, renewAccessToken, type Account } from '@/google/auth';

/**
 * What core's planner, stores and Google writes run against on the phone: its
 * database, and Google Calendar through the phone's sign-in. The app state
 * keeps the account current (`setGoogleAccount`).
 */

let status: GoogleStatus = 'not-connected';
let calendar: CalendarApi | null = null;

export function setGoogleAccount(account: Account | null): void {
  status = !account ? 'not-connected' : account.calendar ? 'connected' : 'missing-scope';
}

function calendarApi(): CalendarApi {
  let last: string | null = null;
  // A token Google refused (401) is thrown away and a fresh one fetched, once.
  calendar ??= googleCalendar(async (renew) => {
    last = renew && last ? await renewAccessToken(last) : await accessToken();
    return last;
  });
  return calendar;
}

export function env(): Env {
  return { db: database().orm, google: { status: () => status, calendar: calendarApi } };
}
