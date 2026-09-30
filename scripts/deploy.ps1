<#
.SYNOPSIS
  Builds TimeBlock on this computer and installs it on the connected phone.

.DESCRIPTION
  scripts\deploy.ps1            build a debug APK and install it on the phone
  scripts\deploy.ps1 -Release   the same, as a release build (runs on its own, no dev server)
  scripts\deploy.ps1 -Install   first-time setup: install everything Android SDK development needs
                                (JDK 17, the SDK command-line tools, the SDK/NDK packages the app's
                                build uses, ANDROID_HOME / JAVA_HOME / Path), then stop

  -Install is safe to run again: whatever is already there is left alone. It is the scripted form of
  vendor\timeblock\docs\android-sdk.md. It asks you to accept Google's SDK licences.

  The whole route, from phone setup to Google sign-in: docs\deploy-android.md.
#>
[CmdletBinding()]
param(
  [switch]$Install,
  [switch]$Release
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Google's SDK command-line tools for Windows (any architecture). Bump this after a new release at
# https://developer.android.com/studio#command-line-tools-only
$cmdlineToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

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

  Write-Host "`nDone. Open a NEW terminal so the environment variables apply, connect the phone" -ForegroundColor Green
  Write-Host "(USB debugging or Wireless debugging - see docs\deploy-android.md, steps 1-2), then run:" -ForegroundColor Green
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

    Step ("Building and installing the " + $(if ($Release) { 'release' } else { 'debug' }) + ' build')
    $variant = if ($Release) { 'release' } else { 'debug' }
    # Expo compiles a debug build for the phone's CPU only, but a release build for all four Android
    # CPU types - four times the native work. This APK is for the connected phone, so build its type
    # only (Gradle reads ORG_GRADLE_PROJECT_* variables as project properties).
    $previousArchs = $env:ORG_GRADLE_PROJECT_reactNativeArchitectures
    if ($Release -and $abi) { $env:ORG_GRADLE_PROJECT_reactNativeArchitectures = $abi }
    # A release build carries its JavaScript inside the APK, so it needs no dev server.
    $runArgs = @('expo', 'run:android', '--variant', $variant)
    if ($Release) { $runArgs += '--no-bundler' }
    try {
      npx @runArgs
      if ($LASTEXITCODE -ne 0) { throw 'The build failed.' }
    } finally { $env:ORG_GRADLE_PROJECT_reactNativeArchitectures = $previousArchs }
  } finally { Pop-Location }
}

if ($Install) { Install-Everything } else { Deploy }
