@echo off
REM ============================================
REM Zap Scanware - One-Click Build & Install
REM ============================================
setlocal enabledelayedexpansion

REM Resolve toolchain
set ANDROID_HOME=C:\AndroidSDK
set ANDROID_SDK_ROOT=C:\AndroidSDK
set JAVA_HOME=C:\Java\jdk-17.0.20+8
set PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\bin;%JAVA_HOME%\bin;%PATH%
cd /d "%~dp0"

echo ============================================
echo  Zap Scanware Build & Install
echo ============================================
echo.

echo Building debug APK...
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo BUILD FAILED! Check errors above.
    goto END
)

echo Build successful!
echo.

REM Check for connected devices
"C:\AndroidSDK\platform-tools\adb.exe" devices | findstr /C:"device" >nul
if errorlevel 1 (
    echo No device connected. APK ready at:
    echo   app\build\outputs\apk\debug\zap-scanware-debug.apk
    goto END
)

echo Installing on device...
"C:\AndroidSDK\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\zap-scanware-debug.apk
if errorlevel 1 (
    echo INSTALL FAILED! Try manually:
    echo   adb install -r app\build\outputs\apk\debug\zap-scanware-debug.apk
) else (
    echo INSTALL SUCCESSFUL!
)

:END
echo.
echo ============================================
endlocal
pause
