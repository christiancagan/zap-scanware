# Host Zap Scanware on GitHub Pages

This guide makes the app downloadable from a public URL like
`https://<your-username>.github.io/<your-repo>/`.

Everything needed is already in the `docs/` folder:
- `docs/index.html` — landing page with the download button/icon
- `docs/zap-scanware-debug.apk` — the app (21.4 MB)
- `docs/.nojekyll` — ensures the `.apk` is served as-is

---

## Option A — Push this project to GitHub (recommended)

1. **Create a GitHub repo** (any name, e.g. `zap-scanware`). Leave it empty.
   Or if you already have one, note its name and owner.

2. **Push this repo** from PowerShell in the project folder:

   ```powershell
   cd "C:\Users\Administrator\Documents\Default Project\MalwareShield"
   git init
   git add -A
   git commit -m "Zap Scanware — app, source, and GitHub Pages download site"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
   git push -u origin main
   ```

   > If you're not signed into `gh` yet, you'll be prompted for credentials, or
   > create a Personal Access Token. The `gh` CLI can do this too:
   > `gh auth login`, then `git push`.

3. **Enable GitHub Pages**:
   - Go to the repo on github.com → **Settings → Pages**
   - Under **Build and deployment**, choose **Deploy from a branch**
   - Branch: `main`, folder: **`/docs`**
   - Click **Save**

4. Wait ~1 minute. Your download page is live at:
   ```
   https://<YOUR_USERNAME>.github.io/<REPO_NAME>/
   ```

---

## Option B — Just the pages, in a separate repo

If you don't want to push the whole Android source, create a repo and push
**only the `docs/` folder** to its root, then enable Pages from the **root**:

```powershell
cd "C:\Users\Administrator\Documents\Default Project\MalwareShield\docs"
git init
git add -A
git commit -m "Zap Scanware download page"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
git push -u origin main
```

Then Settings → Pages → Deploy from branch → `main` → folder: **`/ (root)`**.

---

## Notes

- **Repo size:** the APK is 21.4 MB. GitHub allows files up to 100 MB, so this
  is fine. Keep the repo under 1 GB for Pages.
- **Debug build:** the hosted APK is a debug build. For a production download,
  host a **signed release** APK instead — see the release-signing setup.
- **Updating:** replace `docs/zap-scanware-debug.apk`, then `git add -A`,
  `git commit`, `git push`. Pages redeploys automatically.
