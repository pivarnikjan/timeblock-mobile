import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { setGoogleAccount } from '@/env';
import * as auth from '@/google/auth';
import { phoneSyncStatus, replacePhoneData, StaleDeviceError, syncPhone } from '@/sync/phone-sync';

/**
 * What every screen shares: the signed-in Google account, whether a sync is
 * running and how the last one went, and a `version` that moves whenever the
 * data changed (a sync merged something, or you changed something here) so
 * screens read it again.
 */
interface App {
  version: number;
  account: auth.Account | null;
  /** Still finding out whether someone is signed in. */
  restoring: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  /** The phone was away longer than deletions are remembered: replace or sync anyway. */
  stale: boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  grantMissingScopes(): Promise<void>;
  /** Call after changing data here: screens re-read, and a sync follows shortly. */
  changed(): void;
  sync(options?: { allowStale?: boolean }): Promise<void>;
  /**
   * Syncs with the desktop and throws when that fails. Planning, rescheduling
   * and committing call it first: both devices can plan, and a plan made
   * without the other's latest ticks and blocks could put the same work into
   * Google twice.
   */
  syncFirst(): Promise<void>;
  replaceFromDrive(): Promise<void>;
}

const AppContext = createContext<App | null>(null);

/** A change made here goes up this long after the last edit (edits in a row share one sync). */
const PUSH_AFTER_MS = 4_000;
/** Coming back to the app syncs if the last sync is older than this. */
const RESUME_SYNC_AFTER_MS = 60_000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [account, setAccount] = useState<auth.Account | null>(null);
  const [restoring, setRestoring] = useState(auth.SIGN_IN_AVAILABLE);
  const [syncing, setSyncing] = useState(false);
  const [stale, setStale] = useState(false);
  const [status, setStatus] = useState(() => phoneSyncStatus().device);
  const running = useRef<Promise<void> | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    setStatus(phoneSyncStatus().device);
  }, []);

  const runSync = useCallback(
    (work: () => Promise<unknown>) => {
      running.current ??= (async () => {
        setSyncing(true);
        try {
          await work();
          setStale(false);
        } catch (error) {
          if (error instanceof StaleDeviceError) setStale(true);
          // Anything else is recorded with the device and shown from there.
        } finally {
          setSyncing(false);
          running.current = null;
          bump();
        }
      })();
      return running.current;
    },
    [bump],
  );

  const sync = useCallback(
    (options?: { allowStale?: boolean }) => (account ? runSync(() => syncPhone(options)) : Promise.resolve()),
    [account, runSync],
  );

  const syncFirst = useCallback(async () => {
    // The browser preview has no sign-in and nothing to sync with: it plans on its local data alone.
    if (!auth.SIGN_IN_AVAILABLE) return;
    if (!account) throw new Error('Sign in with Google first (⚙ Settings): planning syncs with the desktop before it starts.');
    if (!account.complete) throw new Error('Google Drive or Calendar access is missing — grant it in ⚙ Settings first.');
    let failure: unknown = null;
    await running.current;
    await runSync(async () => {
      try {
        await syncPhone();
      } catch (error) {
        failure = error;
        throw error;
      }
    });
    if (failure instanceof StaleDeviceError) {
      throw new Error('This phone was away too long to sync safely — choose what to do in ⚙ Settings, then try again.');
    }
    if (failure) {
      const reason = phoneSyncStatus().device.lastError ?? (failure as Error).message;
      throw new Error(`Could not sync with the desktop first, so nothing was planned or sent to Google (${reason}). Try again when online.`);
    }
  }, [account, runSync]);

  const replaceFromDrive = useCallback(() => (account ? runSync(() => replacePhoneData()) : Promise.resolve()), [account, runSync]);

  const changed = useCallback(() => {
    bump();
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => void sync(), PUSH_AFTER_MS);
  }, [bump, sync]);

  // Core's planner and Google writes use the signed-in account.
  useEffect(() => setGoogleAccount(account), [account]);

  // Who is signed in, from last time.
  useEffect(() => {
    if (!auth.SIGN_IN_AVAILABLE) return;
    auth
      .restoreSignIn()
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setRestoring(false));
  }, []);

  // Sync on start (once signed in), and when the app comes back to the foreground.
  useEffect(() => {
    if (!account?.complete) return;
    void sync();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const last = phoneSyncStatus().device.lastSyncAt;
      if (!last || Date.now() - Date.parse(last) > RESUME_SYNC_AFTER_MS) void sync();
    });
    return () => subscription.remove();
  }, [account, sync]);

  const value = useMemo<App>(
    () => ({
      version,
      account,
      restoring,
      syncing,
      lastSyncAt: status.lastSyncAt,
      syncError: status.lastError,
      stale,
      signIn: async () => setAccount((await auth.signIn()) ?? account),
      signOut: async () => {
        await auth.signOut();
        setAccount(null);
      },
      grantMissingScopes: async () => setAccount((await auth.grantMissingScopes()) ?? account),
      changed,
      sync,
      syncFirst,
      replaceFromDrive,
    }),
    [version, account, restoring, syncing, status, stale, changed, sync, syncFirst, replaceFromDrive],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used inside <AppProvider>');
  return app;
}
