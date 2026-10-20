#!/bin/bash
# ============================================
# MalwareShield - Build Script for Linux/Mac
# ============================================
echo "==========================================="
echo " MalwareShield Build Script"
echo "==========================================="
echo ""

# Check ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
    echo "ERROR: ANDROID_HOME not set"
    echo "Export it: export ANDROID_HOME=~/Library/Android/sdk"
    exit 1
fi

# Check if SDK exists
if [ ! -d "$ANDROID_HOME/platform-tools" ]; then
    echo "ERROR: Android SDK not found at $ANDROID_HOME"
    exit 1
fi

# Build
echo "Building MalwareShield debug APK..."
./gradlew assembleDebug

if [ $? -eq 0 ]; then
    echo ""
    echo "BUILD SUCCESSFUL!"
    echo "APK: app/build/outputs/apk/debug/app-debug.apk"
    echo ""
    echo "To install: adb install app/build/outputs/apk/debug/app-debug.apk"
else
    echo "BUILD FAILED!"
    exit 1
fi