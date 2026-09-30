import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

/** A wall-clock moment in the Settings timezone: `YYYY-MM-DD` and `HH:mm`. */
export interface LocalMoment {
  date: string;
  time: string;
}

/** Android has native date and time pickers; the browser preview has none. */
export const PICKERS_AVAILABLE = Platform.OS === 'android';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Asks for a day, then a time (Android's own pickers). The pickers show the
 * phone's clock, so the Settings timezone's wall-clock time is handed to them
 * as if it were the phone's, and read back the same way. Resolves to the
 * chosen moment, or null when cancelled.
 */
export function pickDayAndTime(initial: LocalMoment, options: { minuteInterval?: 1 | 5 | 15 } = {}): Promise<LocalMoment | null> {
  const [y, m, d] = initial.date.split('-').map(Number);
  const [hh, mm] = initial.time.split(':').map(Number);
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: new Date(y, m - 1, d, hh, mm),
      mode: 'date',
      onChange: (event, day) => {
        if (event.type !== 'set' || !day) return resolve(null);
        DateTimePickerAndroid.open({
          value: new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm),
          mode: 'time',
          is24Hour: true,
          minuteInterval: options.minuteInterval ?? 5,
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return resolve(null);
            resolve({
              date: `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`,
              time: `${pad(time.getHours())}:${pad(time.getMinutes())}`,
            });
          },
        });
      },
    });
  });
}

/** Asks for a day (Android's date picker); resolves to `YYYY-MM-DD`, or null when cancelled. */
export function pickDate(initial: string): Promise<string | null> {
  const [y, m, d] = initial.split('-').map(Number);
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: new Date(y, m - 1, d),
      mode: 'date',
      onChange: (event, day) => {
        if (event.type !== 'set' || !day) return resolve(null);
        resolve(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
      },
    });
  });
}

/** Asks for a time of day (Android's clock); resolves to `HH:mm`, or null when cancelled. */
export function pickTime(initial: string, options: { minuteInterval?: 1 | 5 | 15 | 30 } = {}): Promise<string | null> {
  const [hh, mm] = initial.split(':').map(Number);
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: new Date(2000, 0, 1, hh, mm),
      mode: 'time',
      is24Hour: true,
      minuteInterval: options.minuteInterval ?? 15,
      onChange: (event, time) => {
        if (event.type !== 'set' || !time) return resolve(null);
        resolve(`${pad(time.getHours())}:${pad(time.getMinutes())}`);
      },
    });
  });
}
