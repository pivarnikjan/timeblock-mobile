import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import type { SqlDriver, SqlRow, SqlValue } from '@timeblock/core/db/driver';
import { isNewDatabase, runMigrations, seedSettings } from '@timeblock/core/db/migrate';
import * as schema from '@timeblock/core/db/schema';
import { installSync } from '@timeblock/core/sync/install';

/** The phone's SQLite connection in the shape core's migrations and sync expect. */
export function expoDriver(sqlite: SQLiteDatabase): SqlDriver {
  return {
    all: <T extends SqlRow>(sql: string, params: SqlValue[] = []) => sqlite.getAllSync<T>(sql, params),
    run: (sql, params = []) => {
      sqlite.runSync(sql, params);
    },
    exec: (sql) => sqlite.execSync(sql),
  };
}

function open() {
  const sqlite = openDatabaseSync('timeblock.db');
  sqlite.execSync('PRAGMA journal_mode = WAL');
  const driver = expoDriver(sqlite);

  // The same migrations as the desktop, bundled into core. A new install gets
  // the defaults, unstamped: the first sync replaces them with the desktop's data.
  runMigrations(driver);
  seedSettings(driver);
  installSync(driver, { newDatabase: isNewDatabase(driver), name: 'Phone' });

  // What the phone last read from Google, for offline use. Never synced.
  sqlite.execSync(
    `CREATE TABLE IF NOT EXISTS phone_cache (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       saved_at TEXT NOT NULL
     )`,
  );

  return { sqlite, driver, orm: drizzle(sqlite, { schema }) };
}

export type Database = ReturnType<typeof open>;

let opened: Database | null = null;

/** The app's database, opened (and migrated) on first use. */
export function database(): Database {
  opened ??= open();
  return opened;
}

/**
 * Opens the database before the first screen renders. In a browser preview
 * SQLite runs in a web worker, which must be started by an asynchronous open
 * before synchronous calls can reach it (the worker then stays; the connection
 * that started it is closed, so only one holds the file). On Android this just
 * opens it.
 */
export async function prepareDatabase(): Promise<void> {
  if (Platform.OS === 'web' && !opened) await (await openDatabaseAsync('timeblock.db')).closeAsync();
  database();
}
