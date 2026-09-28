# Contributing to MalwareShield

Thank you for your interest in contributing to MalwareShield! This document provides guidelines and instructions.

## Getting Started

### Prerequisites
- Android Studio Hedgehog (2023.1.1) or later
- JDK 17
- Android SDK with API 34
- A device or emulator running Android 8.0+ (API 26)

### Setup
1. Clone the repository: `git clone https://github.com/christiancagan/zap-scanware.git`
2. Open the project in Android Studio
3. Configure `local.properties` with your signing keys (for release builds):
   ```
   KEYSTORE_PATH=/path/to/your/release-key.jks
   KEYSTORE_PASSWORD=your_password
   KEY_ALIAS=your_alias
   KEY_PASSWORD=your_key_password
   ```
4. Sync Gradle: `./gradlew` or click "Sync Now" in Android Studio

### Build
```bash
# Debug build
./gradlew assembleDebug

# Release build
./gradlew assembleRelease

# Run unit tests
./gradlew testDebugUnitTest

# Run instrumented tests
./gradlew connectedDebugAndroidTest

# Clean build
./gradlew clean
```

## Development Workflow

### Branch Naming
- `main` — stable, production-ready code
- `feature/<description>` — new features
- `fix/<description>` — bug fixes
- `enhancement/<description>` — improvements

### Commit Messages
Follow conventional commits format:
```
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `security`

Examples:
- `feat: add MalwareBazaar Auth-Key support`
- `fix: resolve cancellation race condition in scan loops`
- `security: require biometric authentication for encrypted credentials`
- `docs: update API documentation`

### Code Style
- Use Kotlin 1.9+ syntax
- Follow the official Kotlin code style (`kotlin.code.style=official` in `gradle.properties`)
- Use Hilt for dependency injection
- Use coroutines for async operations
- Use Room for database operations
- Add JUnit4 tests for pure logic functions
- No `org.json` in production code — use Gson

### Testing
- Unit tests in `app/src/test/java/`
- Instrumented tests in `app/src/androidTest/java/`
- Tests must pass before pushing: `./gradlew testDebugUnitTest`
- All tests must have 0 failures

### Code Review
- All PRs require at least one approval
- Security-sensitive changes require additional review
- Run the full test suite before submitting

## Architecture

The project follows MVVM + Clean Architecture:

```
app/src/main/java/com/malwareshield/
├── core/          # Core logic (security, analysis, reputation, etc.)
├── data/          # Data layer (database, repositories, entities)
├── di/            # Dependency injection (Hilt modules)
├── presentation/  # UI layer (Compose screens, ViewModels)
└── MalwareShieldApp.kt  # Application entry point
```

## Key Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Development guide and release process |
| `ENHANCEMENT_PLAN_*.md` | Feature requirements and assessments |
| `build.gradle.kts` | Gradle configuration |
| `settings.gradle.kts` | Project settings |
| `gradle.properties` | Gradle properties |

## Security Guidelines

- Never commit secrets (API keys, keystores) to git
- Use `local.properties` for local keys (git-ignored)
- All network calls use HTTPS
- Encrypted credentials require biometric authentication
- No telemetry unless explicitly opted in

## Reporting Issues

Use the GitHub Issues tracker at https://github.com/christiancagan/zap-scanware/issues

Include:
- Device/Android version
- Scan mode used (Quick/Deep)
- Steps to reproduce
- Relevant log output
- Expected vs actual behavior

## License

This project is licensed under the terms specified in the LICENSE file.
