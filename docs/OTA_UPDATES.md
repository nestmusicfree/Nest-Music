# In-app OTA updates (Nest Music)

Nest Music Capacitor apps ship a native shell (APK) plus a web bundle (`www`).  
**OTA updates hot-swap the web bundle** so users do **not** need to uninstall/reinstall for most feature releases.

## Manifest

- Static: `https://nest-music.vercel.app/app-version.json`
- API: `https://nest-music.vercel.app/api/app-version`

```json
{
  "version": "1.3.0",
  "build": 130,
  "bundleUrl": "https://nest-music.vercel.app/bundles/v1.3.0/www.zip",
  "staticBase": "https://nest-music.vercel.app/bundles/v1.3.0/",
  "notes": "…",
  "minNative": "1.3.0"
}
```

## Hosted bundles

Versioned static mirrors live at:

`/bundles/vX.Y.Z/` → full `www` copy + `www.zip`

Build them with:

```bash
node scripts/pack-bundle.js
# (also run automatically from prepare-public.js)
```

## Client flow

1. On launch and via **Settings → Check for updates**, the app fetches the remote manifest.
2. Compares `version` / `build` to local `APP_VERSION` (`1.3.0` / `130` in `www/js/nest-v13.js`).
3. If newer: shows English **Update available** sheet.
4. User taps **Update now** → download progress → store zip / cache static mirror (Filesystem + Preferences on native; Cache API + localStorage on web).
5. App reloads / reopens onto the new bundle.

## Native notes

- Pure JS/CSS/HTML changes ship via OTA.
- New Capacitor plugins or Android permission changes require a **new APK** (`minNative`).
- Plugins used: `@capacitor/filesystem`, `@capacitor/preferences`, `@capacitor/app`.

## Test steps

1. Install user APK `1.3.0`.
2. Confirm Settings shows `v1.3.0`.
3. Temporarily raise remote `app-version.json` to `1.3.1` and upload `/bundles/v1.3.1/`.
4. Open app → sheet appears → Update now → progress → reload.
5. Confirm Settings shows the new version string from the updated bundle.
6. Revert or ship the real next version.

## Web

Browser clients always load from Vercel; OTA still refreshes cached assets and shows the update sheet when the embedded `APP_VERSION` lags the manifest.
