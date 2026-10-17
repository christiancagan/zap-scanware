<#
.SYNOPSIS
  Push the harmless EICAR test file to a connected device and confirm
  MalwareShield detects it.

.DESCRIPTION
  EICAR is the 68-byte industry-standard anti-malware TEST file. It is not
  malware - its only purpose is to make security products react, so it is the
  safest way to prove an end-to-end detection pipeline really works.

  The script:
    1. Finds adb (-Adb, then $env:ANDROID_HOME / $env:ANDROID_SDK_ROOT, then PATH)
    2. Checks exactly one device/emulator is connected
    3. Installs MalwareShield when it is missing (connected Android tests
       uninstall their APKs afterwards, so the app is often absent)
    4. Grants "All files access" - without it ApkFinder skips the filesystem
       walk entirely and only queries MediaStore
    5. Writes /sdcard/Download/eicar.com (68 bytes) - a directory the DEEP
       scan walks (SEARCH_DIRS in ApkFinder)
    6. Launches the app
    7. Prints the taps to run a Deep scan and exactly what alert to look for

  The same behaviour is asserted automatically by
  app/src/androidTest/java/com/malwareshield/core/EicarDetectionInstrumentedTest.kt
  and EicarOnDeviceScanTest.kt:

      gradlew connectedDebugAndroidTest

.PARAMETER Adb
  Full path to adb.exe. Auto-detected when omitted.

.PARAMETER Apk
  APK to install if the app is missing. Defaults to the freshly built
  app/build/outputs/apk/debug/app-debug.apk, falling back to the published
  docs/zap-scanware-debug.apk.

.PARAMETER Clean
  Remove the EICAR sample from the device instead of installing/launching.

.PARAMETER Logcat
  After printing the steps, follow logcat so scan activity is visible.

.EXAMPLE
  .\scripts\verify-eicar-detection.ps1

.EXAMPLE
  .\scripts\verify-eicar-detection.ps1 -Adb C:\AndroidSDK\platform-tools\adb.exe -Logcat

.EXAMPLE
  .\scripts\verify-eicar-detection.ps1 -Clean
#>
[CmdletBinding()]
param(
    [string]$Adb,
    [string]$Apk,
    [switch]$Clean,
    [switch]$Logcat,
    [string]$PackageName = 'com.zapscanware.debug'
)

$ErrorActionPreference = 'Stop'

# Industry-standard anti-malware test file (exactly 68 bytes).
$EicarString = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
$RemoteSample = '/sdcard/Download/eicar.com'

function Write-Step([string]$m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok([string]$m)   { Write-Host "    $m" -ForegroundColor Green }
function Write-Warn2([string]$m){ Write-Host "    $m" -ForegroundColor Yellow }

function Find-Adb {
    if ($Adb) {
        if (-not (Test-Path $Adb)) { throw "adb not found at $Adb" }
        return $Adb
    }
    foreach ($root in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT)) {
        if ($root) {
            $candidate = Join-Path $root 'platform-tools\adb.exe'
            if (Test-Path $candidate) { return $candidate }
        }
    }
    $cmd = Get-Command adb.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw 'adb.exe not found. Pass -Adb or set ANDROID_HOME / ANDROID_SDK_ROOT.'
}

function Resolve-ApkPath {
    if ($Apk) {
        if (-not (Test-Path $Apk)) { throw "APK not found at $Apk" }
        return (Resolve-Path $Apk).Path
    }
    $repo = Split-Path -Parent $PSScriptRoot
    foreach ($rel in @(
        'app\build\outputs\apk\debug\app-debug.apk',
        'docs\zap-scanware-debug.apk'
    )) {
        $candidate = Join-Path $repo $rel
        if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
    }
    return $null
}

# --- 1. adb + device -------------------------------------------------------
Write-Step 'Locating adb'
$adb = Find-Adb
Write-Ok $adb

$devices = (& $adb devices) |
    Where-Object { $_ -match "`tdevice`r?$" } |
    ForEach-Object { ($_ -split "`t")[0] }
if (-not $devices) { throw 'No device/emulator connected. Start an emulator first.' }
if ($devices.Count -gt 1) { Write-Warn2 "Multiple devices found ($($devices.Count)); using first: $($devices[0])" }
Write-Ok "Device: $($devices[0])"

$adbs = @($adb, '-s', $devices[0])
function Invoke-Adb([string[]]$Arguments) { & $adbs[0] @($adbs[1..($adbs.Count-1)] + $Arguments) }

# --- 2. cleanup mode -------------------------------------------------------
if ($Clean) {
    Write-Step "Removing $RemoteSample"
    Invoke-Adb @('shell', 'rm', '-f', $RemoteSample) | Out-Null
    Write-Ok 'Sample removed.'
    return
}

# --- 3. verify the local sample -------------------------------------------
Write-Step 'Preparing EICAR sample'
$bytes = [System.Text.Encoding]::ASCII.GetBytes($EicarString)
if ($bytes.Length -ne 68) { throw "EICAR must be 68 bytes, got $($bytes.Length)." }
$tmp = Join-Path $env:TEMP 'eicar.com'
[System.IO.File]::WriteAllBytes($tmp, $bytes)
Write-Ok "Wrote 68-byte sample to $tmp"

# --- 4. install ------------------------------------------------------------
Write-Step 'Checking MalwareShield installation'
$installed = (Invoke-Adb @('shell', 'pm', 'path', $PackageName)) -match 'package:'
if (-not $installed) {
    $apkPath = Resolve-ApkPath
    if (-not $apkPath) {
        throw 'MalwareShield is not installed and no APK found. Run "gradlew assembleDebug" first.'
    }
    Write-Ok "Installing $apkPath"
    Invoke-Adb @('install', '-r', $apkPath) | Out-Null
    $installed = (Invoke-Adb @('shell', 'pm', 'path', $PackageName)) -match 'package:'
    if (-not $installed) { throw 'Install failed - see the adb output above.' }
} else {
    Write-Ok 'Already installed.'
}

# --- 5. All files access ---------------------------------------------------
Write-Step 'Granting "All files access" (required for the storage sweep)'
Invoke-Adb @('shell', 'appops', 'set', $PackageName, 'MANAGE_EXTERNAL_STORAGE', 'allow') | Out-Null
$mode = (Invoke-Adb @('shell', 'appops', 'get', $PackageName, 'MANAGE_EXTERNAL_STORAGE')) -join ''
Write-Ok "appops MANAGE_EXTERNAL_STORAGE => $mode"

# --- 6. push the sample ----------------------------------------------------
Write-Step "Pushing sample to $RemoteSample"
Invoke-Adb @('push', $tmp, $RemoteSample) | Out-Null
$size = (Invoke-Adb @('shell', 'stat', '-c', '%s', $RemoteSample)) -join ''
$size = $size.Trim()
if ($size -ne '68') { throw "Remote sample is $size bytes (expected 68)." }
Write-Ok 'Verified 68 bytes on device.'
Write-Host ''
Write-Warning 'EICAR is a harmless test file, but real antivirus products will flag it.'
Write-Host "    Remove it when done:  .\scripts\verify-eicar-detection.ps1 -Clean`n"

# --- 7. launch -------------------------------------------------------------
Write-Step 'Launching MalwareShield'
$resolved = (Invoke-Adb @('shell', 'cmd', 'package', 'resolve-activity', '--brief',
    '-c', 'android.intent.category.LAUNCHER', $PackageName)) -match "$PackageName/"
if ($resolved) {
    $component = ($resolved | Select-Object -Last 1).Trim()
    Invoke-Adb @('shell', 'am', 'start', '-n', $component) | Out-Null
    Write-Ok "Started $component"
} else {
    Invoke-Adb @('shell', 'monkey', '-p', $PackageName, '-c',
        'android.intent.category.LAUNCHER', '1') | Out-Null
    Write-Ok 'Started via monkey.'
}

# --- 8. instructions -------------------------------------------------------
Write-Host ''
Write-Step 'Manual verification steps'
Write-Host @"
    1. Tap the hamburger menu (top-left) -> Scan (or the "Scan this device" hero).
    2. Set scan mode to **Deep** (Quick does not sweep storage files).
    3. Tap "Scan this device" and wait for it to finish.
    4. Open the results and look for the finding:
         name       : eicar.com
         location   : /sdcard/Download/eicar.com
         verdict    : Malicious / High risk (red card)
         rule       : EICAR_Test_File
         type       : Executable (the .com extension is a scanned target)
    5. Tap "Delete" to remove the sample from the device (or re-run this
       script with -Clean).

    If the file is not found:
      - Confirm "All files access" is ON for the app (Settings -> Apps ->
        MalwareShield -> Files and media -> All files access).
      - Confirm the scan mode was Deep, not Quick.
      - Re-run:  .\scripts\verify-eicar-detection.ps1
"@

# --- 9. optional logcat ----------------------------------------------------
if ($Logcat) {
    Write-Host ''
    Write-Step 'Following logcat (Ctrl+C to stop)'
    & $adb logcat -c
    & $adb logcat -v brief ZapScanware:D AndroidRuntime:E '*:S'
}
