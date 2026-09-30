import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  statusCodes,
  type User,
} from '@react-native-google-signin/google-signin';
import { grantsCalendar, grantsDrive, SCOPES } from '@timeblock/core/google/scopes';

/**
 * Google sign-in on Android, with the scopes the desktop uses: its calendars
 * and TimeBlock's own hidden Drive folder. Android matches the app to its
 * OAuth client by package name and signing certificate (see README), so no
 * client id is needed here; a web client id (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
 * is passed when set, which Google recommends.
 */

export interface Account {
  email: string;
  name: string | null;
  /** Calendar and Drive app data were both granted. */
  complete: boolean;
  /** Calendar access was granted (planning and committing need it; syncing needs Drive too). */
  calendar: boolean;
}

export const SIGN_IN_AVAILABLE = true;

const toAccount = (u: User): Account => ({
  email: u.user.email,
  name: u.user.name,
  complete: grantsCalendar(u.scopes) && grantsDrive(u.scopes),
  calendar: grantsCalendar(u.scopes),
});

let configured = false;
function configure() {
  if (configured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  GoogleSignin.configure({ scopes: SCOPES, ...(webClientId ? { webClientId } : {}) });
  configured = true;
}

/** The account signed in last time, without asking; null when there is none. */
export async function restoreSignIn(): Promise<Account | null> {
  configure();
  if (!GoogleSignin.hasPreviousSignIn()) return null;
  const response = await GoogleSignin.signInSilently();
  return isNoSavedCredentialFoundResponse(response) ? null : toAccount(response.data);
}

/** Google's account picker and consent screen; null when the user backs out. */
export async function signIn(): Promise<Account | null> {
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  try {
    const response = await GoogleSignin.signIn();
    return isCancelledResponse(response) ? null : toAccount(response.data);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) return null;
    throw error;
  }
}

/** Asks again for Drive (and calendar) access when the first consent left a box unticked. */
export async function grantMissingScopes(): Promise<Account | null> {
  configure();
  const response = await GoogleSignin.addScopes({ scopes: SCOPES });
  return response && !isCancelledResponse(response) ? toAccount(response.data) : null;
}

export async function signOut(): Promise<void> {
  configure();
  await GoogleSignin.signOut();
}

/** A current access token; Google refreshes it when it has expired. */
export async function accessToken(): Promise<string> {
  configure();
  const { accessToken } = await GoogleSignin.getTokens();
  if (!accessToken) throw new Error('Google did not hand out an access token — sign in again in Settings.');
  return accessToken;
}

/** Throws away a token Google refused (401), and gets a new one. */
export async function renewAccessToken(refused: string): Promise<string> {
  await GoogleSignin.clearCachedAccessToken(refused);
  return accessToken();
}
