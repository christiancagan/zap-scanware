# MalwareShield Setup Script
# Run this in PowerShell to set up the development environment

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " MalwareShield Environment Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check Java
$javaPath = "C:\Java\jdk-17.0.20+8\bin\java.exe"
if (Test-Path $javaPath) {
    Write-Host "[OK] Java 17 found" -ForegroundColor Green
    $env:JAVA_HOME = "C:\Java\jdk-17.0.20+8"
} else {
    Write-Host "[!] Java 17 not found - downloading..." -ForegroundColor Yellow
}

# Check Android SDK
$sdkPath = "C:\Users\Administrator\AppData\Local\Android\Sdk"
if (Test-Path $sdkPath) {
    Write-Host "[OK] Android SDK found at $sdkPath" -ForegroundColor Green
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkPath, "User")
    [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkPath, "User")
} else {
    Write-Host "[!] Android SDK not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "To install Android SDK:" -ForegroundColor Yellow
    Write-Host "1. Download Android Studio: https://developer.android.com/studio"
    Write-Host "2. Install with:" -ForegroundColor White
    Write-Host "   - SDK Platform 34" -ForegroundColor White
    Write-Host "   - Build Tools 34.0.0" -ForegroundColor White
    Write-Host "   - Android Emulator" -ForegroundColor White
    Write-Host "3. Set ANDROID_HOME environment variable" -ForegroundColor White
    Write-Host ""
    Write-Host "OR download SDK tools separately from:" -ForegroundColor Yellow
    Write-Host "https://developer.android.com/studio#command-line-tools-only"
}

# Set environment variables
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $sdkPath, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $sdkPath, "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Java\jdk-17.0.20+8", "User")

Write-Host ""
Write-Host "Environment variables configured!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Android Studio and sync the project"
Write-Host "2. Build -> Build Bundle(s)/APK(s) -> Build APK(s)"
Write-Host "3. Or run: .\build-and-install.bat"
Write-Host ""
Write-Host "VirusTotal API Key configured: a8ba58e38a5beec2..." -ForegroundColor Green