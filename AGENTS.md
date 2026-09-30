This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building

The app is built on this computer with the Android SDK and installed over `adb` — EAS is not used.
`scripts\deploy.ps1 -Install` sets up the toolchain once; `scripts\deploy.ps1` (debug, with the dev
server) or `scripts\deploy.ps1 -Release` (JavaScript inside the APK) builds and installs on the
connected phone through `npx expo run:android`. The project must sit at a path of 40 characters or
fewer (ninja's 260-character limit). Guide: `docs/deploy-android.md`.

Builds are signed with the user's own key (`%USERPROFILE%\.timeblock\timeblock-release.p12`, made by
`scripts\deploy.ps1 -NewKey`), not React Native's shared debug key: `plugins/with-own-signing-key.js`
adds the signing config to the generated `build.gradle`, and `deploy.ps1` passes the key as Gradle
properties for each build. Never commit the key or its password, and never switch signing back to
the debug key — an app installed with one key can't be updated by a build signed with another.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a new native build: `scripts\deploy.ps1` (it runs `npx expo run:android`).
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## This project: TimeBlock for Android

- **Shared code lives in the desktop repo.** `vendor/timeblock` is a git submodule of
  [pivarnikjan/timeblock](https://github.com/pivarnikjan/timeblock); only its
  `packages/core` is used, imported as `@timeblock/core/*` (tsconfig `paths`; Metro
  blocks the rest of the submodule — see `metro.config.js`). Change planning, calendar
  layout, schema or sync rules **there**, never by copying code here, then move the
  submodule forward (`npm run update-core`, or `git -C vendor/timeblock checkout <sha>`).
- **The database is the desktop's schema** (core's bundled migrations), opened
  synchronously with expo-sqlite (`src/db/database.ts`). Every write goes through
  SQLite triggers that stamp it for sync — write with drizzle or SQL, never bypass.
  Phone-only data (Google events read, the chosen view) lives in `phone_cache`.
- **Sync** is core's `syncWithDrive` over Google Drive's app data folder
  (`src/sync/phone-sync.ts`); after a local change call `changed()` from `useApp()`.
- Checks before declaring work done: `npx tsc --noEmit`, `npx expo lint`, and
  `npx expo export --platform android` (bundles without the Android SDK).
