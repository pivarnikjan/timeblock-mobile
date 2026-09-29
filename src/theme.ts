import { useColorScheme } from 'react-native';

/** The desktop's palette (app/globals.css), for the phone's light and dark modes. */
export interface Theme {
  background: string;
  surface: string;
  border: string;
  foreground: string;
  muted: string;
  accent: string;
  today: string;
  danger: string;
  ok: string;
  vacation: string;
  now: string;
}

const LIGHT: Theme = {
  background: '#f7f7f8',
  surface: '#ffffff',
  border: '#e4e4e7',
  foreground: '#18181b',
  muted: '#71717a',
  accent: '#4f46e5',
  today: '#1a73e8',
  danger: '#dc2626',
  ok: '#059669',
  vacation: '#E53935',
  now: '#ea4335',
};

const DARK: Theme = {
  background: '#0b0b0e',
  surface: '#151519',
  border: '#2a2a31',
  foreground: '#ededf0',
  muted: '#9c9caa',
  accent: '#818cf8',
  today: '#8ab4f8',
  danger: '#f87171',
  ok: '#34d399',
  vacation: '#EF5350',
  now: '#f28b82',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
