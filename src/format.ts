import { DateTime } from 'luxon';

/** "just now", "5 min ago", "3 h ago", else the date and time. */
export function ago(iso: string | null, now: DateTime = DateTime.now()): string {
  if (!iso) return 'never';
  const then = DateTime.fromISO(iso);
  const minutes = Math.floor(now.diff(then, 'minutes').minutes);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return then.toFormat('d LLL HH:mm');
}

/** "1 h 25 min", "45 min". */
export function minutesLabel(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
