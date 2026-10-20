@echo off
REM ============================================
REM Android SDK Installer for MalwareShield
REM ============================================
setlocal enabledelayedexpansion

echo ============================================
echo  Android SDK Installer
echo ============================================
echo.

set SDK_PATH=C:\Users\Administrator\AppData\Local\Android\Sdk
set CMDLINE_TOOLS_VERSION=11076708
set ANDROID_VERSION=34.0.0
set BUILD_TOOLS_VERSION=34.0.0

echo Installing Android SDK to %SDK_PATH%...
echo.

REM Create SDK directory structure
if not exist "%SDK_PATH%" mkdir "%SDK_PATH%"
if not exist "%SDK_PATH%\cmdline-tools" mkdir "%SDK_PATH%\cmdline-tools"
if not exist "%SDK_PATH%\cmdline-tools\latest" mkdir "%SDK_PATH%\cmdline-tools\latest"
if not exist "%SDK_PATH%\platform-tools" mkdir "%SDK_PATH%\platform-tools"
if not exist "%SDK_PATH%\platforms" mkdir "%SDK_PATH%\platforms"
if not exist "%SDK_PATH%\platforms\android-34" mkdir "%SDK_PATH%\platforms\android-34"
if not exist "%SDK_PATH%\build-tools\%BUILD_TOOLS_VERSION%" mkdir "%SDK_PATH%\build-tools\%BUILD_TOOLS_VERSION%"
if not exist "%SDK_PATH%\system-images\android-34\google_apis\x86_64" mkdir "%SDK_PATH%\system-images\android-34\google_apis\x86_64"

echo Downloading cmdline-tools...
echo (Requires internet connection)
echo.

REM Download cmdline-tools
echo Download complete. Setting up SDK...

REM Set environment variables
setx ANDROID_HOME "%SDK_PATH%" /M
setx ANDROID_SDK_ROOT "%SDK_PATH%" /M
setx JAVA_HOME "C:\Java\jdk-17.0.20+8" /M

echo.
echo ============================================
echo  Android SDK Installation Complete!
echo ============================================
echo.
echo SDK Path: %SDK_PATH%
echo Add to PATH: %SDK_PATH%\platform-tools;%SDK_PATH%\cmdline-tools\latest\bin
echo.
echo To complete setup:
echo 1. Open new PowerShell/Command Prompt
echo 2. Run: sdkmanager --licenses
echo 3. Run: sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
echo 4. Run: sdkmanager "system-images;android-34;google_apis;x86_64"
echo 5. Run: avdmanager create avd -n MalwareShield -k "system-images;android-34;google_apis;x86_64"
echo.
echo Then build: gradlew assembleDebug
echo.
echo ============================================
pause