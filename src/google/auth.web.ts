import type { Account } from './auth';

/**
 * In a browser (development previews only) there is no Google sign-in: the app
 * runs on whatever is in its local database — see src/dev/demo.ts.
 */

export type { Account };

export const SIGN_IN_AVAILABLE = false;

const unavailable = () => Promise.reject(new Error('Google sign-in works in the Android app, not in a browser preview.'));

export const restoreSignIn = async (): Promise<Account | null> => null;
export const signIn = (): Promise<Account | null> => unavailable();
export const grantMissingScopes = (): Promise<Account | null> => unavailable();
export const signOut = async (): Promise<void> => {};
export const accessToken = (): Promise<string> => unavailable();
export const renewAccessToken = (_refused: string): Promise<string> => unavailable();
