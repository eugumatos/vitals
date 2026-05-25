# Installing Vitals (Beta)

## Download

Go to [GitHub Releases](https://github.com/gustavomatos/Vitals/releases) and download the latest `.dmg` for your architecture:

- **Apple Silicon (M1/M2/M3/M4):** `Vitals-X.X.X-arm64.dmg`
- **Intel:** `Vitals-X.X.X-x64.dmg`

## Install

1. Open the DMG
2. Drag **Vitals** to your Applications folder
3. Open Vitals from Applications

## Bypass Gatekeeper

Since the app is not code-signed, macOS will block it on first launch. To bypass:

**Option A:** Right-click the app → Open → Click "Open" in the dialog

**Option B:** Run in Terminal:
```bash
xattr -cr /Applications/Vitals.app
```

## Notes

- Vitals lives in the **menu bar** (top-right of your screen), not in the Dock
- Press `Cmd+Shift+N` to toggle the overlay
- Right-click the menu bar icon for Settings
- Logs are at `~/Library/Logs/Vitals/main.log` — share this if you hit a bug
- Updates are automatic — you'll get new versions without re-downloading
