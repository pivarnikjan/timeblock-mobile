import { DriveError, googleDrive, isDriveScopeError } from '@timeblock/core/sync/drive';
import {
  readPeers,
  recordSyncError,
  resetFromDrive,
  setDeviceName,
  StaleDeviceError,
  syncWithDrive,
  type PeerRow,
  type SyncReport,
} from '@timeblock/core/sync/run';
import { readMeta, type SyncMetaRow } from '@timeblock/core/sync/state';
import { database } from '@/db/database';
import { withToken } from '@/google/calendar';

/**
 * Sync with the desktop through Google Drive's app data folder — the same
 * round as the desktop runs (packages/core/src/sync), with the phone's sign-in.
 */

export const MISSING_DRIVE_HELP =
  'Syncing needs access to TimeBlock’s own folder in Google Drive. Tap “Grant access” and allow “See, create, and delete its own configuration data in your Google Drive”.';

function describe(error: unknown): string {
  if (isDriveScopeError(error)) return MISSING_DRIVE_HELP;
  if (error instanceof DriveError && error.status === 403 && /has not been used|is disabled/i.test(error.message)) {
    return 'The Google Drive API is not enabled for the Google Cloud project. Enable it (see the desktop’s docs/phone-sync.md) and sync again.';
  }
  if (/network request failed|failed to fetch|unable to resolve host/i.test((error as Error).message)) {
    return 'Offline — the phone will sync when it is back online.';
  }
  return (error as Error).message;
}

async function round(run: (drive: ReturnType<typeof googleDrive>) => Promise<SyncReport>): Promise<SyncReport> {
  const { driver } = database();
  try {
    return await withToken((token) => run(googleDrive(async () => token)));
  } catch (error) {
    recordSyncError(driver, describe(error));
    throw error;
  }
}

/** One round: take in the desktop's changes, send the phone's. */
export function syncPhone(options: { allowStale?: boolean } = {}): Promise<SyncReport> {
  return round((drive) => syncWithDrive(database().driver, drive, options));
}

/** Throws away the phone's data and takes the desktop's copy from Drive. */
export function replacePhoneData(): Promise<SyncReport> {
  return round((drive) => resetFromDrive(database().driver, drive));
}

export interface PhoneSyncStatus {
  device: SyncMetaRow;
  peers: PeerRow[];
}

export function phoneSyncStatus(): PhoneSyncStatus {
  const { driver } = database();
  return { device: readMeta(driver), peers: readPeers(driver) };
}

export function renamePhone(name: string): void {
  setDeviceName(database().driver, name);
}

export { StaleDeviceError };
