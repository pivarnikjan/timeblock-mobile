# Deploying TimeBlock to your Android phone

This guide builds the app **on this computer** and installs it on your phone
over Wi-Fi or USB. You don't need an Expo account or a build queue, and a
rebuild takes a few minutes.

| | When |
| --- | --- |
| [Before you start](#before-you-start) | Once per computer |
| [Step 1](#step-1--turn-on-developer-options-on-the-phone) | Once per phone |
| [Step 2](#step-2--connect-the-phone) | Each time you deploy (Wi-Fi) or once (USB) |
| [Step 3](#step-3--build-and-install) | Each time you deploy |
| [Step 4](#step-4--let-google-sign-in-accept-this-build) | Once, and again if `android\` is regenerated |
| [Step 5](#step-5--sign-in-on-the-phone) | Once per install |

---

## Before you start

**The desktop is set up for phone sync.** Follow the desktop's
`docs/phone-sync.md` → *Set it up* (README, step 0). Check that **Settings →
Phone sync** on the desktop says it synced.

**The code, at a short path.** The native build nests folders about 210
characters deep inside the project. The SDK's build tool (ninja 1.10, bundled
with CMake 3.22) can't open paths longer than 260 characters, and turning on
Windows' *long paths* setting doesn't change that. So the project folder's own
path must be **40 characters or fewer**, for example `C:\dev\timeblock-mobile`
(23 characters). `C:\Users\<you>\Documents\…` is usually too long, and
`deploy.ps1` refuses to build from there.

Clone it with the submodule, because the shared code lives there:

```powershell
mkdir C:\dev
```

```powershell
git clone --recurse-submodules https://github.com/pivarnikjan/timeblock-mobile.git C:\dev\timeblock-mobile
```

```powershell
cd C:\dev\timeblock-mobile
```

**Already have a checkout at a long path?** Move it rather than cloning again,
which keeps uncommitted work. Close editors and terminals that are open in it,
then run:

```powershell
Move-Item C:\Users\<you>\Documents\…\timeblock-mobile C:\dev\timeblock-mobile
```

```powershell
cd C:\dev\timeblock-mobile
```

The generated `android\` folder and the native build caches still hold the old
path, so delete them. Both are rebuilt by the next build. The caches are
`.cxx` folders inside some packages, such as
`node_modules\react-native-reanimated\android\.cxx`, not at the top of the
project; the second command finds them all. They only exist if a build ran
before, so skip either command if there's nothing to delete.

```powershell
Remove-Item -Recurse -Force android
```

```powershell
Get-ChildItem node_modules -Directory -Recurse -Filter .cxx -Force | Remove-Item -Recurse -Force
```

**The Android toolchain.** In the app's folder:

```powershell
.\scripts\deploy.ps1 -Install
```

It installs Java 17 and the Android SDK (command-line tools, platform, build
tools, NDK, CMake), sets `JAVA_HOME`, `ANDROID_HOME` and `Path`, asks you to
accept Google's SDK licences, and runs `npm install`. It takes about 45 minutes
and ~5 GB the first time. You can run it again safely: anything already
installed is skipped.

Then **open a new terminal**, so the new environment variables apply, and check:

```powershell
java -version
```

```powershell
adb --version
```

The first should print `openjdk version "17…`. The second should print a
version. If either says *not recognized*, the terminal was opened before the
install.

> The script also sets `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT`.
> Java then trusts the same certificates as Windows. Without it, antivirus or
> firewall HTTPS inspection makes the SDK manager and Gradle fail to download
> anything. Java prints `Picked up JAVA_TOOL_OPTIONS…` when it starts; that
> line is harmless.

## Step 1 — Turn on developer options on the phone

For the **motorola edge 70 fusion**, the README's *The motorola edge 70 fusion*
section has these steps with what to expect on that phone and on this
computer.

1. **Settings → About phone** → tap **Build number** seven times, until it
   says *You are now a developer*. On Samsung, *Build number* is under **About
   phone → Software information**.
2. **Settings → System → Developer options** → turn on **USB debugging**. On
   Samsung, *Developer options* is at the bottom of **Settings**.

## Step 2 — Connect the phone

Use **Wi-Fi** if you can: it needs no USB driver, and some phones have no USB
driver for Windows on Arm.

### Over Wi-Fi (Android 11 or newer)

The phone and the computer must be on the same network.

1. On the phone: **Developer options → Wireless debugging** → turn on → **Pair
   device with pairing code**. It shows an address such as
   `192.168.1.23:37123` and a six-digit code.
2. On the computer, pair with that address and enter the code when asked:

   ```powershell
   adb pair 192.168.1.23:37123
   ```

   You pair once. The phone remembers the computer.
3. Back on the phone's **Wireless debugging** screen (not the pairing dialog),
   note **IP address & Port**. It has a different port from the pairing one.
   Connect to it:

   ```powershell
   adb connect 192.168.1.23:41567
   ```

The connect port changes whenever Wireless debugging is turned off and on, or
the phone restarts. Repeat step 3 (not the pairing) when that happens.

### Over USB

Plug the phone in. If the phone asks what the USB connection is for, choose
**File transfer**. Allow the *Allow USB debugging?* prompt and tick **Always
allow from this computer**. Some phones need their maker's USB driver on
Windows; Samsung's is the *Samsung Android USB Driver*.

### Check

```powershell
adb devices
```

The phone should be listed as `device`.

| Listed as | Meaning |
| --- | --- |
| `device` | Ready |
| `unauthorized` | Accept the *Allow USB debugging?* prompt on the phone |
| `offline` | Run `adb kill-server`, then connect again |
| nothing | Wi-Fi: repeat `adb connect`. USB: try another cable (charge-only cables carry no data), *File transfer* mode, or the maker's driver |

## Step 3 — Build and install

In the app's folder:

```powershell
.\scripts\deploy.ps1 -Release
```

This is the build for everyday use. The JavaScript is inside the APK, so the
app runs on its own with the computer off. The script checks the toolchain and
the phone, then runs `npx expo run:android --variant release`, which:

1. generates the native project in `android\` (not committed; see *Rules* in
   `AGENTS.md`),
2. compiles it with Gradle,
3. installs the APK on the phone and opens the app.

The script compiles the release build only for the connected phone's CPU type
(`arm64-v8a` on most phones), not all four Android ones. That makes the build
about four times quicker, but the APK is then for that phone. The **first
build still takes much longer**: 15–30 minutes, more on Windows on Arm,
where the SDK's x64 tools run under emulation. Gradle downloads its
dependencies once. Later builds take a few minutes.

**While developing**, use the debug build instead:

```powershell
.\scripts\deploy.ps1
```

A debug build loads its JavaScript from the dev server the command starts on
this computer. A code change then only needs a reload on the phone: press `r`
in the terminal, or shake the phone → **Reload**. Build again only after adding
a package with native code. The first time, Windows asks whether Node.js may
use the network. Allow **private networks**, or the phone can't reach the dev
server over Wi-Fi.

Both builds share the same package name and signing key, so either one
installs over the other and keeps the app's data.

## Step 4 — Let Google sign-in accept this build

Google sign-in on Android only works for a build whose **package name +
signing certificate** Google knows. Builds made here are signed with the
**debug keystore** in `android\app\debug.keystore`, both debug and release
variants, so Google needs that certificate.

Read its SHA-1. `keytool` comes with the JDK; the store and key passwords of
the debug keystore are the well-known `android`:

```powershell
keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android 2>$null | Select-String 'SHA1:'
```

It prints only the **SHA1:** line; copy it.

> Without the `2>$null | Select-String 'SHA1:'` part, `keytool` also prints
> two warnings. **Ignore both. Nothing needs changing:**
>
> - *The certificate uses the SHA1withRSA signature algorithm which is
>   considered a security risk.* This is about how the certificate signs
>   itself (it dates from 2013 and is shared by all React Native projects), not
>   about the SHA-1 fingerprint Google asks for. That fingerprint is simply a
>   hash that identifies the certificate. Android and Google accept this
>   keystore.
> - *The JKS keystore uses a proprietary format. It is recommended to migrate
>   to PKCS12.* Don't run the suggested `keytool -importkeystore`.
>   `android\` is generated: regenerating it (deleting it, or
>   `npx expo prebuild --clean`) brings back the original file, and the
>   project's rules say never to edit `android\` by hand. Gradle reads JKS
>   fine.

Then, in <https://console.cloud.google.com/>, in the
**same project as the desktop** (the Drive folder belongs to that project):

1. **Google Auth platform → Clients → Create client**
2. Application type **Android**
3. Package name `com.pivarnikjan.timeblock`
4. SHA-1 certificate fingerprint: paste it
5. **Create**. There is no secret to copy.

Google needs one Android client per signing certificate. It can take a few
minutes to accept a new client.

You do this once. Do it again only if `android\` is regenerated (deleted, or
`npx expo prebuild --clean`) and the new keystore's SHA-1 differs.

> The debug keystore is a well-known one, meant for your own devices. Don't
> share APKs signed with it.

## Step 5 — Sign in on the phone

Open **TimeBlock → ⚙ → Sign in with Google** with the **desktop's account**.
On Google's screen, allow both:

- access to your calendars, and
- *See, create, and delete its own configuration data in your Google Drive*.

The desktop's plan arrives with the first sync. After that the phone syncs
when the app opens or comes back to the foreground, a few seconds after a
change, and on pull-to-refresh.

Optional: Google recommends also passing a web client ID; sign-in works
without it. To pass it, put the desktop's `GOOGLE_CLIENT_ID` in a `.env.local`
file in the app's folder (git ignores it) and build again:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
```

---

## Updating the app later

```powershell
git pull
```

```powershell
git submodule update --init
```

```powershell
npm install
```

```powershell
.\scripts\deploy.ps1 -Release
```

Reconnect the phone first if its Wireless debugging port changed (step 2,
`adb connect`). The update installs over the old version and keeps its data.

## When Android refuses to update the app

Android installs an update only if it is signed with the same key as the
installed copy. If the installed copy came from somewhere else, such as an APK
built on another computer with a different key, the install fails with
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`. To replace it:

1. Open the installed app and pull to refresh, so everything it holds is
   synced.
2. Uninstall it (long-press the icon → **Uninstall**), or run:

   ```powershell
   adb uninstall com.pivarnikjan.timeblock
   ```

3. Deploy again and sign in again. The plan comes back from the sync.

## Troubleshooting

| What you see | Why | Do this |
| --- | --- | --- |
| `deploy.ps1 cannot be loaded because running scripts is disabled` | PowerShell's execution policy. | `powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -Release` |
| `Missing: JAVA_HOME … ANDROID_HOME … adb` | The terminal was opened before `-Install`, or `-Install` wasn't run. | Open a new terminal; otherwise run `.\scripts\deploy.ps1 -Install`. |
| `No phone connected` | `adb devices` lists no `device`. | Step 2. On Wi-Fi, usually the connect port changed: `adb connect` again. |
| `PKIX path building failed` / `Failed to download any source lists` | Java doesn't trust your network's HTTPS inspection. | Run `-Install` again (it sets `JAVA_TOOL_OPTIONS`), then open a new terminal. |
| `SDK location not found` | `ANDROID_HOME` isn't set in this terminal. | Open a new terminal. |
| `This folder's path is … characters long` | The project is at a long path. | Move it to `C:\dev\timeblock-mobile` (*Before you start*). |
| `ninja: error: manifest 'build.ninja' still dirty after 100 tries`, or another CMake / ninja error about a missing file | A path inside the build is over 260 characters, so ninja can't see the file. The *long paths* setting doesn't help ninja 1.10. | Move the project to a short path, then delete `android\` and the `.cxx` folders (*Before you start*). |
| A native build step fails on Windows on Arm | An x64 SDK tool didn't run under emulation. | Run the build again; the first runs under emulation are the slowest. If it fails at the same step again, note which one. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | The installed copy has a different signing key. | See *When Android refuses to update the app*. |
| Debug build: red screen *Unable to load script* | The phone can't reach the dev server. | Keep the `deploy.ps1` terminal open. Allow Node.js through the Windows firewall on private networks. Put the phone and computer on the same Wi-Fi. |
| Sign-in fails with `DEVELOPER_ERROR` (code 10) | Google doesn't know this package + SHA-1 pair. | Step 4, with the SHA-1 of the keystore that signed *this* build. Wait a few minutes after creating the client. |
| *Google Drive access missing* | A box was left unticked on Google's screen. | **⚙ → Grant access**. |
| Sync stops after a week | The Google Cloud app is in *Testing*, and Google expires sign-ins after 7 days. | Publish the app (desktop's `docs/google-calendar-setup.md`). |

More SDK details, including removing it all: the desktop's
[`docs/android-sdk.md`](https://github.com/pivarnikjan/timeblock/blob/main/docs/android-sdk.md).
