<#
.SYNOPSIS
  Builds TimeBlock on this computer and installs it on the connected phone.

.DESCRIPTION
  scripts\deploy.ps1            build a debug APK and install it on the phone
  scripts\deploy.ps1 -Release   the same, as a release build (runs on its own, no dev server)
  scripts\deploy.ps1 -Install   first-time setup: install everything Android SDK development needs
                                (JDK 17, the SDK command-line tools, the SDK/NDK packages the app's
                                build uses, ANDROID_HOME / JAVA_HOME / Path), then stop
  scripts\deploy.ps1 -NewKey    create your own signing key (asks for its password), then stop
  scripts\deploy.ps1 -Sha1      print your key's SHA-1, for the Google Android client, then stop

  -Install is safe to run again: whatever is already there is left alone. It is the scripted form of
  vendor\timeblock\docs\android-sdk.md. It asks you to accept Google's SDK licences.

  Builds are signed with your own key (plugins\with-own-signing-key.js), not React Native's public
  debug key. The key is %USERPROFILE%\.timeblock\timeblock-release.p12 (or $env:TIMEBLOCK_KEYSTORE);
  its password is kept next to it, encrypted for your Windows account, so deploys don't ask for it.

  The whole route, from phone setup to Google sign-in: docs\deploy-android.md.
#>
[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Release,
  [switch]$NewKey,
  [switch]$Sha1
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Google's SDK command-line tools for Windows (any architecture). Bump this after a new release at
# https://developer.android.com/studio#command-line-tools-only
$cmdlineToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

# Your signing key: PKCS12, RSA 4096, SHA256withRSA, outside the repository. Its password is stored
# beside it with Windows DPAPI (ConvertFrom-SecureString), readable only by this Windows account on
# this computer - so keep your own copy of the password too (a password manager), with a backup of the
# .p12 file. Losing either means the installed app can't be updated, only reinstalled.
$keystore = if ($env:TIMEBLOCK_KEYSTORE) { $env:TIMEBLOCK_KEYSTORE } else { Join-Path $HOME '.timeblock\timeblock-release.p12' }
$keyPasswordFile = "$keystore.password"
$keyAlias = 'timeblock'

function Get-Keytool {
  if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\keytool.exe")) {
    Write-Host 'JAVA_HOME is not set. Run  scripts\deploy.ps1 -Install  first, then open a new terminal.' -ForegroundColor Red
    exit 1
  }
  return "$env:JAVA_HOME\bin\keytool.exe"
}

function ConvertTo-PlainText([Security.SecureString]$secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Get-KeyPassword {
  if (-not (Test-Path $keystore) -or -not (Test-Path $keyPasswordFile)) {
    Write-Host "No signing key at $keystore." -ForegroundColor Red
    Write-Host "Create one with  scripts\deploy.ps1 -NewKey  (see docs\deploy-android.md, 'Your signing key')," -ForegroundColor Red
    Write-Host "or point TIMEBLOCK_KEYSTORE at an existing one and save its password file beside it." -ForegroundColor Red
    exit 1
  }
  try {
    return ConvertTo-PlainText (Get-Content $keyPasswordFile | ConvertTo-SecureString)
  } catch {
    Write-Host "Can't read $keyPasswordFile - it was saved by another Windows account or computer." -ForegroundColor Red
    Write-Host 'Save the password again for this account:' -ForegroundColor Red
    Write-Host "  Read-Host -AsSecureString 'Key password' | ConvertFrom-SecureString | Set-Content '$keyPasswordFile'" -ForegroundColor Red
    exit 1
  }
}

# keytool reads the password from an environment variable (-storepass:env), so it never appears on a
# command line; the variable exists only while keytool runs. Its stderr (warnings, and Java's "Picked up
# JAVA_TOOL_OPTIONS") is dropped; under 'Stop', Windows PowerShell would treat any stderr line as fatal.
function Invoke-Keytool($password, [string[]]$arguments) {
  $env:TIMEBLOCK_KEY_PASSWORD = $password
  $ErrorActionPreference = 'Continue'
  try {
    & (Get-Keytool) @arguments -storepass:env TIMEBLOCK_KEY_PASSWORD 2>$null
    if ($LASTEXITCODE -ne 0) { throw "keytool failed (exit $LASTEXITCODE)." }
  } finally { Remove-Item Env:TIMEBLOCK_KEY_PASSWORD -ErrorAction SilentlyContinue }
}

function Show-KeySha1 {
  $password = Get-KeyPassword
  $line = Invoke-Keytool $password @('-list', '-v', '-storetype', 'PKCS12', '-keystore', $keystore, '-alias', $keyAlias) |
    Select-String 'SHA1:' | Select-Object -First 1
  if (-not $line) { throw "keytool could not read $keystore - is the saved password right?" }
  Write-Host "Your key: $keystore"
  Write-Host 'SHA-1 for the Google Android client (package com.pivarnikjan.timeblock):'
  Write-Host ('  ' + ($line.Line -replace '^\s*SHA1:\s*', '')) -ForegroundColor Green
}

function New-SigningKey {
  if (Test-Path $keystore) {
    Write-Host "A key already exists at $keystore - not replacing it." -ForegroundColor Red
    Write-Host 'A new key would stop the installed app from updating. To really start over, move that file away first.' -ForegroundColor Red
    exit 1
  }
  Get-Keytool | Out-Null
  Write-Host 'Choose a password for your signing key (at least 8 characters). Keep it in your password manager:'
  Write-Host 'you need it to use the key on another computer or Windows account.'
  $first = Read-Host -AsSecureString 'Key password'
  $second = Read-Host -AsSecureString 'Same password again'
  $password = ConvertTo-PlainText $first
  if ($password -ne (ConvertTo-PlainText $second)) { throw 'The two passwords differ - nothing was created.' }
  if ($password.Length -lt 8) { throw 'The password is shorter than 8 characters - nothing was created.' }

  New-Item -ItemType Directory -Force (Split-Path -Parent $keystore) | Out-Null
  Invoke-Keytool $password @('-genkeypair', '-storetype', 'PKCS12', '-keystore', $keystore, '-alias', $keyAlias,
    '-keyalg', 'RSA', '-keysize', '4096', '-sigalg', 'SHA256withRSA', '-validity', '10000',
    '-dname', 'CN=TimeBlock, O=pivarnikjan') | Out-Null
  if (-not (Test-Path $keystore)) { throw 'keytool could not create the key.' }
  $first | ConvertFrom-SecureString | Set-Content $keyPasswordFile

  Write-Host "`nCreated $keystore" -ForegroundColor Green
  Show-KeySha1
  Write-Host "`nNext:" -ForegroundColor Green
  Write-Host "  1. Back up $keystore (not the .password file - it only works for this account)."
  Write-Host '  2. Register the SHA-1 above as a Google Android client (docs\deploy-android.md, step 4).'
  Write-Host '  3. If TimeBlock is installed with the old debug key, sync it and uninstall it once:'
  Write-Host '       adb uninstall com.pivarnikjan.timeblock'
}

# The SDK's CMake 3.22.1 ships ninja 1.10, which cannot open paths over 260 characters - Windows'
# LongPathsEnabled does not help it. The native build reaches files such as
#   <root>\node_modules\react-native-reanimated\android\.cxx\RelWithDebInfo\<hash>\arm64-v8a\..\prefab\
#   arm64-v8a\prefab\lib\aarch64-linux-android\cmake\react-native-worklets\react-native-workletsConfigVersion.cmake
# which is 206 characters plus the root (more for armeabi-v7a); past 260 ninja takes the file for missing
# and fails with "manifest 'build.ninja' still dirty after 100 tries". A 40-character root leaves margin.
$maxRootLength = 40

function Test-ShortRoot {
  if ($root.Length -le $maxRootLength) { return $true }
  Write-Host "This folder's path is $($root.Length) characters long:" -ForegroundColor Red
  Write-Host "  $root" -ForegroundColor Red
  Write-Host "The Android native build needs it to be $maxRootLength or fewer (Windows' path limit)." -ForegroundColor Red
  Write-Host "Move the project to a short path such as C:\dev\timeblock-mobile and delete its android\ folder" -ForegroundColor Red
  Write-Host "and native build caches - see docs\deploy-android.md, 'Before you start'." -ForegroundColor Red
  return $false
}

function Find-Jdk17 {
  foreach ($dir in 'C:\Program Files\Microsoft', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Java') {
    if (Test-Path $dir) {
      $jdk = Get-ChildItem $dir -Directory -Filter 'jdk-17*' | Sort-Object Name | Select-Object -Last 1
      if ($jdk) { return $jdk.FullName }
    }
  }
  if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe") -and ((& "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Out-String) -match 'version "17\.')) {
    return $env:JAVA_HOME
  }
  return $null
}

# Windows PowerShell 5.1 offers only TLS 1.0/1.1 by default, which Google's servers close ("connection
# was forcibly closed"), so ask for TLS 1.2. If that still fails, curl.exe (ships with Windows 10+) retries.
function Download-File($url, $out) {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $progress = $ProgressPreference
  $ProgressPreference = 'SilentlyContinue' # the progress bar makes Invoke-WebRequest much slower
  try {
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
    return
  } catch {
    Write-Host "Invoke-WebRequest failed ($($_.Exception.Message)); trying curl.exe" -ForegroundColor Yellow
  } finally { $ProgressPreference = $progress }
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) { throw "Could not download $url. Download it in a browser and unpack it as described in vendor\timeblock\docs\android-sdk.md, step 2." }
  & $curl.Source -L --fail --retry 3 -o $out $url
  if ($LASTEXITCODE -ne 0) { throw "curl.exe could not download $url (exit $LASTEXITCODE)." }
}

function Add-UserPath($dir) {
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($user -split ';') -notcontains $dir) {
    [Environment]::SetEnvironmentVariable('Path', "$user;$dir".TrimStart(';'), 'User')
  }
  if (($env:Path -split ';') -notcontains $dir) { $env:Path = "$env:Path;$dir" }
}

# The versions React Native's build uses; they change with the Expo SDK, so read them from the app.
function Get-SdkPackages {
  $compileSdk = '36'; $buildTools = '36.0.0'; $ndk = '27.1.12297006'
  $toml = Join-Path $root 'node_modules\react-native\gradle\libs.versions.toml'
  if (Test-Path $toml) {
    $text = Get-Content $toml -Raw
    if ($text -match 'compileSdk\s*=\s*"(\d+)"') { $compileSdk = $Matches[1] }
    if ($text -match 'buildTools\s*=\s*"([\d.]+)"') { $buildTools = $Matches[1] }
    if ($text -match 'ndkVersion\s*=\s*"([\d.]+)"') { $ndk = $Matches[1] }
  } else {
    Write-Host "node_modules not installed yet - using the default package versions." -ForegroundColor Yellow
  }
  return @('platform-tools', "platforms;android-$compileSdk", "build-tools;$buildTools", "ndk;$ndk", 'cmake;3.22.1')
}

function Install-Everything {
  Step 'Node.js and Git'
  foreach ($tool in 'node', 'npm', 'git') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "$tool is not installed. Install Node.js (https://nodejs.org) and Git (https://git-scm.com), then run this again."
    }
  }
  Write-Host "node $(node -v), git found"
  git config --global core.longpaths true
  if (-not (Test-ShortRoot)) {
    Write-Host "The installation continues, but the build will not work from this folder - see the message above." -ForegroundColor Yellow
  }

  Step 'Java 17 (JDK)'
  $jdk = Find-Jdk17
  if (-not $jdk) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      throw 'winget is not available. Install a JDK 17 by hand (e.g. https://learn.microsoft.com/java/openjdk/download), then run this again.'
    }
    winget install --id Microsoft.OpenJDK.17 --source winget --accept-package-agreements --accept-source-agreements
    $jdk = Find-Jdk17
    if (-not $jdk) { throw 'The JDK 17 install finished but was not found under C:\Program Files\Microsoft.' }
  }
  Write-Host "JDK 17: $jdk"
  [Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk, 'User')
  $env:JAVA_HOME = $jdk

  # Java trusts only its own certificate list, not Windows'. Behind antivirus/firewall HTTPS inspection
  # (or a company proxy) that makes sdkmanager and Gradle fail with "PKIX path building failed", and
  # sdkmanager then says "Failed to download any source lists" and accepts no licences. Telling every
  # JVM to use the Windows certificate store fixes it, and changes nothing where there is no inspection.
  $trust = '-Djavax.net.ssl.trustStoreType=Windows-ROOT'
  $opts = [Environment]::GetEnvironmentVariable('JAVA_TOOL_OPTIONS', 'User')
  if (-not $opts -or $opts -notmatch 'trustStoreType') {
    $opts = "$opts $trust".Trim()
    [Environment]::SetEnvironmentVariable('JAVA_TOOL_OPTIONS', $opts, 'User')
  }
  $env:JAVA_TOOL_OPTIONS = $opts
  Write-Host "JAVA_TOOL_OPTIONS = $opts"

  Step 'Android SDK command-line tools'
  $sdkmanager = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
  if (Test-Path $sdkmanager) {
    Write-Host "already installed: $sdk"
  } else {
    $zip = Join-Path $env:TEMP 'android-commandlinetools.zip'
    $tmp = Join-Path $env:TEMP 'android-commandlinetools'
    Write-Host "downloading $cmdlineToolsUrl"
    Download-File $cmdlineToolsUrl $zip
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp
    New-Item -ItemType Directory -Force (Join-Path $sdk 'cmdline-tools') | Out-Null
    Move-Item (Join-Path $tmp 'cmdline-tools') (Join-Path $sdk 'cmdline-tools\latest')
    Remove-Item $zip, $tmp -Recurse -Force
    if (-not (Test-Path $sdkmanager)) { throw "sdkmanager was not found at $sdkmanager after unpacking." }
  }

  Step 'Environment variables'
  [Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
  $env:ANDROID_HOME = $sdk
  Add-UserPath (Join-Path $sdk 'platform-tools')
  Add-UserPath (Join-Path $sdk 'cmdline-tools\latest\bin')
  Write-Host "ANDROID_HOME = $sdk"

  Step 'SDK licences (answer y to each)'
  & $sdkmanager --licenses
  if ($LASTEXITCODE -ne 0) { throw 'sdkmanager --licenses failed.' }

  Step 'SDK packages'
  $packages = Get-SdkPackages
  Write-Host ($packages -join "`n")
  & $sdkmanager @packages
  if ($LASTEXITCODE -ne 0) { throw 'sdkmanager could not install the packages.' }

  Step 'Project dependencies'
  Push-Location $root
  try {
    git submodule update --init
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
  } finally { Pop-Location }

  Write-Host "`nDone. Open a NEW terminal so the environment variables apply, create your signing key once," -ForegroundColor Green
  Write-Host "connect the phone (docs\deploy-android.md, steps 1-2), and deploy:" -ForegroundColor Green
  Write-Host "  scripts\deploy.ps1 -NewKey" -ForegroundColor Green
  Write-Host "  scripts\deploy.ps1 -Release" -ForegroundColor Green
}

function Deploy {
  Step 'Checking the toolchain'
  $missing = @()
  if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { $missing += 'JAVA_HOME (JDK 17)' }
  if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) { $missing += 'ANDROID_HOME (Android SDK)' }
  if (-not (Get-Command adb -ErrorAction SilentlyContinue)) { $missing += 'adb (platform-tools on Path)' }
  if ($missing) {
    Write-Host ("Missing: " + ($missing -join ', ')) -ForegroundColor Red
    Write-Host "Run  scripts\deploy.ps1 -Install  first, then open a new terminal." -ForegroundColor Red
    exit 1
  }
  if (-not (Test-ShortRoot)) { exit 1 }
  $keyPassword = Get-KeyPassword

  Push-Location $root
  try {
    if (-not (Test-Path 'vendor\timeblock\packages\core')) { git submodule update --init }
    if (-not (Test-Path 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' } }

    $devices = @(adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' })
    if ($devices.Count -eq 0) {
      Write-Host 'No phone connected. Enable USB debugging (or `adb pair` / `adb connect` for Wireless debugging), then run again.' -ForegroundColor Red
      exit 1
    }
    $serial = ($devices[0] -split '\s+')[0]
    $model = (adb -s $serial shell getprop ro.product.model).Trim()
    $abi = (adb -s $serial shell getprop ro.product.cpu.abi).Trim()
    Write-Host "Phone: $model ($serial, $abi)"

    # An android\ folder generated before plugins\with-own-signing-key.js existed would still sign with
    # the debug key; prebuild (without --clean) re-applies the config plugins to it.
    $gradleFile = 'android\app\build.gradle'
    if ((Test-Path $gradleFile) -and -not (Select-String -Path $gradleFile -Pattern '@generated timeblock-signing' -Quiet)) {
      Step 'Applying the signing setup to android\'
      npx expo prebuild --platform android --no-install
      if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed.' }
    }

    Step ("Building and installing the " + $(if ($Release) { 'release' } else { 'debug' }) + ' build')
    $variant = if ($Release) { 'release' } else { 'debug' }
    # Expo compiles a debug build for the phone's CPU only, but a release build for all four Android
    # CPU types - four times the native work. This APK is for the connected phone, so build its type
    # only (Gradle reads ORG_GRADLE_PROJECT_* variables as project properties).
    $previousArchs = $env:ORG_GRADLE_PROJECT_reactNativeArchitectures
    if ($Release -and $abi) { $env:ORG_GRADLE_PROJECT_reactNativeArchitectures = $abi }
    # Both variants sign with your key, so either installs over the other. The key reaches Gradle as
    # project properties for this run only.
    $env:ORG_GRADLE_PROJECT_timeblockKeystore = $keystore
    $env:ORG_GRADLE_PROJECT_timeblockKeystorePassword = $keyPassword
    # A release build carries its JavaScript inside the APK, so it needs no dev server.
    $runArgs = @('expo', 'run:android', '--variant', $variant)
    if ($Release) { $runArgs += '--no-bundler' }
    try {
      npx @runArgs
      if ($LASTEXITCODE -ne 0) {
        Write-Host 'If it says INSTALL_FAILED_UPDATE_INCOMPATIBLE, the installed TimeBlock has another key:' -ForegroundColor Yellow
        Write-Host 'sync it, run  adb uninstall com.pivarnikjan.timeblock , and deploy again.' -ForegroundColor Yellow
        throw 'The build or install failed.'
      }
    } finally {
      $env:ORG_GRADLE_PROJECT_reactNativeArchitectures = $previousArchs
      Remove-Item Env:ORG_GRADLE_PROJECT_timeblockKeystore, Env:ORG_GRADLE_PROJECT_timeblockKeystorePassword -ErrorAction SilentlyContinue
    }
  } finally { Pop-Location }
}

if ($Install) { Install-Everything }
elseif ($NewKey) { New-SigningKey }
elseif ($Sha1) { Show-KeySha1 }
else { Deploy }
