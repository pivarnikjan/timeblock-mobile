# TimeBlock for Android

The phone side of [TimeBlock](https://github.com/pivarnikjan/timeblock): your
plan on the calendar, offline, in step with the desktop.

- **Calendar** — Day, Week and Month, drawn like the desktop's: time windows as
  coloured bands, committed blocks in their window's colour, your Google
  events, vacations, the now line.
- **Tick work off** — tap a block and tick its tasks; progress and task status
  follow the same rule as on the desktop.
- **Event marks** — important (★ in Month), placeholder (planning may use the
  time), hide; hide whole calendars.
- **Offline** — everything is in a local SQLite database; Google events are
  kept from the last read. Changes sync when the phone is online again.

Planning (generate, commit, reschedule) stays on the desktop in this version;
the planner already runs from the shared code, so it can follow.

## How it syncs

There is no server. The desktop and the phone each keep one small file in a
hidden TimeBlock folder in your Google Drive (the *app data folder*, which no
other app — and not Drive's own web page — can see) and merge each other's:
every value carries a stamp, the later change wins, and work ticked off is
never lost to a re-plan. Draft blocks stay on the desktop until committed.
Details: the desktop's [`docs/phone-sync.md`](https://github.com/pivarnikjan/timeblock/blob/main/docs/phone-sync.md).

The phone syncs when it opens or comes back to the foreground, a few seconds
after you change something, and on pull-to-refresh.

## Set it up

**0. The desktop first.** Follow the desktop's `docs/phone-sync.md` → *Set it
up*: enable the Google Drive API for its Google Cloud project, add the
`drive.appdata` scope, reconnect. Check that **Settings → Phone sync** there
says it synced.

**1. Get the code** (the desktop repository comes along as a submodule — the
shared code lives there):

```bash
git clone --recurse-submodules https://github.com/pivarnikjan/timeblock-mobile.git
```

```bash
npm install
```

**2. Build an APK with EAS** (Expo's cloud build — no Android SDK needed; the
free plan is enough). Sign in to (or create) an Expo account, link the project,
and build:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

```bash
npx eas-cli@latest build --platform android --profile preview
```

The first build asks to generate a keystore — say yes. It ends with a link to
the APK.

**3. Let Google recognise the app.** Android sign-in is tied to the app's
package name and signing certificate. Get the certificate's SHA-1:

```bash
npx eas-cli@latest credentials --platform android
```

(choose the *preview* profile → *Keystore* → it shows *SHA1 Fingerprint*). Then
in <https://console.cloud.google.com/>, **in the same project as the desktop**
(the Drive folder belongs to the project): **Google Auth platform → Clients →
Create client → Android**, package name `com.pivarnikjan.timeblock`, paste the
SHA-1, **Create**. There is no secret to copy.

**4. Install and sign in.** Open the APK link on the phone and install it
(allow installing from your browser when Android asks). Open TimeBlock →
**⚙ → Sign in with Google** with the desktop's account, and on Google's screen
allow both calendar access and *See, create, and delete its own configuration
data in your Google Drive*. The desktop's plan arrives with the first sync.

Optional: set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the desktop's
`GOOGLE_CLIENT_ID` (in EAS: `npx eas-cli@latest env:create`) — Google
recommends passing a web client id; sign-in works without it.

### Troubleshooting

| What you see | Why | Do this |
| --- | --- | --- |
| Sign-in fails with `DEVELOPER_ERROR` (code 10) | Google does not know this package + SHA-1 pair. | Check step 3: the Android client's package name and the SHA-1 of the keystore that signed *this* build (development and preview builds may use different ones). |
| *Google Drive access missing* | A box was left unticked on Google's screen. | **⚙ → Grant access**. |
| *The Google Drive API is not enabled* | Step 0. | Enable it for the project, then pull to refresh. |
| Sync stops after a week | The Google Cloud app is in *Testing*: Google expires sign-ins after 7 days. | Publish the app (desktop's `docs/google-calendar-setup.md`). |
| *Away too long to sync safely* | The phone last synced over 90 days ago. | **⚙ → Replace this phone's data with the desktop's**. |

## Develop

```bash
npx eas-cli@latest build --platform android --profile development
```

installs a development build (once per native change); then `npm start` serves
the JavaScript to it. Before calling a change done:

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

```bash
npx expo export --platform android
```

**In a browser**, for a quick look at the screens: `npm run web`, open
<http://localhost:8081>, then **⚙ → Load a demo plan** (there is no Google
sign-in in a browser). It runs the same code on a browser SQLite.

**Shared code** — schema, migrations, planning, calendar layout, sync — is in
the desktop repository's `packages/core`, checked out at `vendor/timeblock` and
imported as `@timeblock/core/*`. Change it there; then bring the new version
here:

```bash
npm run update-core
```

and commit the moved submodule.

| Where | What |
| --- | --- |
| `src/app/` | Screens (Expo Router): calendar, item details, settings |
| `src/calendar/` | Time grid, month grid, the calendar hook (core's `assembleCalendar`) |
| `src/db/` | Database open/migrate (`database.ts`), reads, writes, the Google cache |
| `src/google/` | Sign-in, Calendar API |
| `src/sync/` | Sync with the desktop (core's `syncWithDrive`) |
| `scripts/` | Browser preview; a fix for expo-sqlite's web build |
