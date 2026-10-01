# TimeBlock for Android

The phone side of [TimeBlock](https://github.com/pivarnikjan/timeblock): your
plan on the calendar, offline, in step with the desktop.

- **Calendar** — Day, Week and Month, drawn like the desktop's: time windows as
  coloured bands, committed blocks in their window's colour, your Google
  events, vacations, the now line.
- **Plan** — **Plan calendar** lays every task into its window from today on,
  **Reschedule…** moves what no longer fits after the calendar changed, and
  the drafts are **committed to Google** or discarded — the desktop's planner,
  running the same code.
- **My day** — review yesterday, the reviews still due, what today rolls up
  to, generate → commit the day, tick blocks off, pull a backlog task in.
- **Blocks** — tick work off, **Move…** (pinned there, its Google event
  follows), unpin, delete; progress and task status follow the desktop's rules.
- **Events** — important (★ in Month), placeholder (planning may use the
  time), hide; hide whole calendars; delete from Google Calendar; a
  **category** (by title words, picked by hand, or none) whose colour the
  event takes here and in Google; **Edit time…** — for a repeating event,
  this one or this and all following ones.
- **Planning** (tab) — the Year, Month and Week screens: goals, outcomes and
  priorities with progress and forecast, drilled down to their tasks; add,
  edit, mark done or drop them; move month backlog into a week; quick-add
  ("title + 1h 25m"); what is not connected to anything.
- **Tasks** (tab) — capture and edit tasks (estimate, priority, energy, due
  date, the goal it serves, time window, sequential session), change their
  status, reopen done ones.
- **Vacations** (🏖) — set, edit or delete one (the windows it closes, a note,
  optionally shown in Google Calendar); see what is scheduled during it and
  delete what you pick; answer "is it a vacation?" for multi-day events, and
  move a vacation with its event when that moved in Google.
- **Settings** (tab) — event **categories** (name, colour, title words;
  apply their colours in Google), Google sign-in, sync with the desktop, the hours the
  calendar shows, time windows in front, only multi-day events in Month, which
  calendars and hidden events are shown; the day shape and time windows the
  planner uses, read-only (they are edited on the desktop).
- **Offline** — everything is in a local SQLite database; Google events are
  kept from the last read. Changes sync when the phone is online again.

Both devices plan. So they never put the same work into Google twice, the
phone **syncs with the desktop right before** it plans, reschedules or
commits — and does none of them when that sync fails (offline, signed out).
Drafts stay on the device that made them until committed. Desktop only, by
choice: CSV import and editing time windows, lunch and block sizes.

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

The app is built on this computer and installed on the phone over USB or
Wi-Fi. **[docs/deploy-android.md](docs/deploy-android.md)** covers every step
in detail; in short:

**1. Get the code at a short path.** Use a path of 40 characters or fewer,
such as `C:\dev\timeblock-mobile`; the native build fails on Windows' path
limit otherwise. Clone it with the desktop repository as a submodule, because
the shared code lives there:

```powershell
git clone --recurse-submodules https://github.com/pivarnikjan/timeblock-mobile.git C:\dev\timeblock-mobile
```

**2. Install the Android toolchain (once).** In the project's folder:

```powershell
.\scripts\deploy.ps1 -Install
```

It installs Java 17 and the Android SDK, sets the environment variables, and
runs `npm install`. It asks you to accept Google's licences. Then open a new
terminal.

**3. Create your signing key (once).** Builds are signed with your own key,
not React Native's debug key, which every project shares:

```powershell
.\scripts\deploy.ps1 -NewKey
```

It asks for a password and saves the key as
`%USERPROFILE%\.timeblock\timeblock-release.p12`. The password is kept beside
it, encrypted for your Windows account, so deploys don't ask for it. **Back up
the `.p12` file and keep the password in your password manager.** Without them
the installed app can't be updated, only reinstalled. Details: the guide's
[Your signing key](docs/deploy-android.md#your-signing-key).

**4. Connect the phone.** Turn on **USB debugging** in its developer options,
then plug it in or pair it over Wi-Fi. `adb devices` should list it as
`device`. For the phone used here, see *The motorola edge 70 fusion* below.

**5. Build and install:**

```powershell
.\scripts\deploy.ps1 -Release
```

This builds the app and installs it on the phone. The first build takes a
while. If a copy signed with another key is installed, the install fails with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Sync that copy, run
`adb uninstall com.pivarnikjan.timeblock` once, and deploy again.

**6. Let Google recognise the app.** Android sign-in is tied to the app's
package name and signing certificate. Print your key's SHA-1:

```powershell
.\scripts\deploy.ps1 -Sha1
```

Then, in <https://console.cloud.google.com/>, **in the same project as the
desktop** (the Drive folder belongs to the project): **Google Auth platform →
Clients → Create client → Android**. Enter package name
`com.pivarnikjan.timeblock`, paste the SHA-1, and click **Create**. There is no
secret to copy. If there's an Android client for the shared debug key's SHA-1
(`5E:8F:16:…:F6:25`), delete it.

**7. Sign in.** Open TimeBlock → **⚙ → Sign in with Google** with the
desktop's account. On Google's screen, allow both calendar access and *See,
create, and delete its own configuration data in your Google Drive*. The
desktop's plan arrives with the first sync.

Optional: put `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=` followed by the desktop's
`GOOGLE_CLIENT_ID` in a `.env.local` file (git ignores it), then build again.
Google recommends passing a web client ID; sign-in works without it.

### The motorola edge 70 fusion

This is the phone the app is deployed to. It reports **Android 16 (API 36)**,
the version the app compiles against, on a Snapdragon SM7635 with a 64-bit
Arm CPU only (`arm64-v8a`). Tested with build `W2WES36.56-98-2-3`.
Motorola's Android keeps Google's menus, so the guide's steps apply as
written. For this phone:

**1. Developer options (once).** **Settings → About phone** → scroll to
**Build number** and tap it seven times, entering the phone's PIN when asked,
until it says *You are now a developer*. Then **Settings → System → Developer
options** → turn on **USB debugging**.

**2. Connect it.** Over USB:

- Plug it in and unlock the phone. It shows *Allow USB debugging?* with the
  computer's key fingerprint. Tick **Always allow from this computer** →
  **Allow**. If the prompt doesn't appear, pull down the notification shade,
  tap the USB notification, and choose **File transfer**.
- **No Motorola driver is needed**, on Windows on Arm too. How Windows sees
  it in **Device Manager**:

  | USB debugging | Device Manager | USB ID | `adb devices` |
  | --- | --- | --- | --- |
  | off | **Portable Devices** → *motorola edge 70 fusion* | `VID_22B8&PID_2E82` | empty |
  | on | **Universal Serial Bus devices** → *motorola edge 70 fusion*, driver *WinUsb Device* (Microsoft's, built in) | `VID_22B8&PID_2E81` | the phone's serial, `device` |

  `adb devices -l` names it `model:motorola_edge_70_fusion device:marvel`.

Over Wi-Fi, as an alternative to the cable: **Settings → System → Developer
options → Wireless debugging** → on → **Pair device with pairing code**, then
run `adb pair <address>` and `adb connect <IP address & Port>` as in the
guide's step 2. The connect port changes after a restart or after turning
Wireless debugging off and on. Run `adb connect` again when it does.

**3. Check, then deploy** from the project at its short path:

```powershell
adb devices
```

The phone should be listed by its serial number as `device`. Then:

```powershell
.\scripts\deploy.ps1 -Release
```

The script prints the phone it found, such as `Phone: motorola edge 70 fusion
(<serial>, arm64-v8a)`. It compiles the release build for that CPU type only,
about a quarter of the native work of all four types. The APK is therefore
for this phone; to install on another phone, connect that one and deploy
again. Installing through `adb` needs no *install unknown apps* permission on
the phone.

### Troubleshooting

Build and connection problems: the guide's
[Troubleshooting](docs/deploy-android.md#troubleshooting).

| What you see | Why | Do this |
| --- | --- | --- |
| Sign-in fails with `DEVELOPER_ERROR` (code 10) | Google does not know this package + SHA-1 pair. | Check step 6: the Android client's package name, and the SHA-1 from `.\scripts\deploy.ps1 -Sha1`. Wait a few minutes after creating the client. |
| *Google Drive access missing* | A box was left unticked on Google's screen. | **⚙ → Grant access**. |
| *The Google Drive API is not enabled* | Step 0. | Enable it for the project, then pull to refresh. |
| Sync stops after a week | The Google Cloud app is in *Testing*: Google expires sign-ins after 7 days. | Publish the app (desktop's `docs/google-calendar-setup.md`). |
| *Away too long to sync safely* | The phone last synced over 90 days ago. | **⚙ → Replace this phone's data with the desktop's**. |

## Develop

```powershell
.\scripts\deploy.ps1
```

installs a debug build and starts the dev server, which serves the JavaScript
to it. Keep that terminal open. A code change then only needs a reload: press
`r` there, or shake the phone → **Reload**. Build again only after adding a
package with native code; otherwise `npm start` serves the JavaScript to the
installed debug build. Before calling a change done:

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
| `src/app/` | Screens (Expo Router). Tabs in `(tabs)/`: Calendar, Planning, Tasks, Settings. Stacked over them: item details, My day (`today.tsx`), Plan calendar (`plan.tsx`), Vacations (`vacations.tsx`, `vacation.tsx`), goal and task editors (`horizon.tsx`, `task.tsx`) |
| `src/planning/` | The planning tree (goal cards, drill-down, task lines) and the forecast badge |
| `src/env.ts` | Core's `Env` on the phone: its database and Google Calendar through the sign-in — what core's planner, stores and operations run against |
| `src/ui.tsx` | Shared building blocks: sections, buttons, checkboxes, progress bars, confirmations |
| `src/calendar/` | Time grid, month grid, the calendar hook (core's `assembleCalendar`) |
| `src/db/` | Database open/migrate (`database.ts`), reads, writes, the Google cache |
| `src/google/` | Sign-in, Calendar API |
| `src/sync/` | Sync with the desktop (core's `syncWithDrive`) |
| `scripts/` | Local Android build and install (`deploy.ps1`); browser preview; a fix for expo-sqlite's web build |
| `plugins/` | Config plugin that signs builds with your own key (`with-own-signing-key.js`) |
| `docs/` | [Deploying to your phone](docs/deploy-android.md) |

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). Free for personal use, study,
research, hobby projects, and noncommercial organisations (charities, schools,
public bodies). It includes the desktop repository's `packages/core` (through `vendor/timeblock`), which is under the same license.

**Commercial use** — using it in or for a company, or building on it for
profit — needs a separate commercial license. To get one, contact the author
through [GitHub](https://github.com/pivarnikjan).

Contributions can only be accepted with an agreement that lets the author
license them the same way; please ask before opening a pull request.
