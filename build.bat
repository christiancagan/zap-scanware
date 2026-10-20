@echo off
REM ============================================
REM Zap Scanware Build Script
REM ============================================
setlocal enabledelayedexpansion

REM Resolve toolchain
set ANDROID_HOME=C:\AndroidSDK
set ANDROID_SDK_ROOT=C:\AndroidSDK
set JAVA_HOME=C:\Java\jdk-17.0.20+8
set PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\bin;%JAVA_HOME%\bin;%PATH%
cd /d "%~dp0"

echo ============================================
echo  Zap Scanware Build Script
echo ============================================
echo.

echo Building Zap Scanware debug APK...
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo.
    echo BUILD FAILED!
    echo Check error messages above
    goto DONE
)

echo.
echo BUILD SUCCESSFUL!
echo APK located at: app\build\outputs\apk\debug\zap-scanware-debug.apk
echo.
echo To install on device:
echo   adb install -r app\build\outputs\apk\debug\zap-scanware-debug.apk

:DONE
echo.
echo ============================================
echo  Build Complete
echo ============================================
endlocal
pause
