# Zap Scanware — Download

This folder is served by **GitHub Pages** as the app's public download page.

- Open the site at: `https://<your-username>.github.io/<your-repo>/`
- The download button serves `zap-scanware-debug.apk` (v1.11.0, 21.2 MB, signed).

## Files
- `index.html` — the landing page with the download button/icon
- `zap-scanware-debug.apk` — the Android app (debug build)
- `.nojekyll` — disables Jekyll so the `.apk` is served as-is

## To update the APK
Replace `zap-scanware-debug.apk` with a new build, commit, and push. GitHub Pages
re-deploys automatically.

> The current APK is a **debug** build. For a production/Play-ready download,
> provide a **signed release** APK (`zap-scanware-release.apk`) here instead.
