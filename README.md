# Nest Music

Lossless audio streaming — web + dual Android apps (**v1.3.0**).

**Repo:** https://github.com/nestmusicfree/Nest-Music  
**Live web:** https://nest-music.vercel.app  
**Admin console:** https://nest-music.vercel.app/admin/  
**Releases:** https://github.com/nestmusicfree/Nest-Music/releases  
**Version API:** https://nest-music.vercel.app/api/app-version  
**OTA bundles:** https://nest-music.vercel.app/bundles/v1.3.0/

## What's new in 1.3.0

- **In-app OTA updates** (no uninstall) — see `docs/OTA_UPDATES.md`
- **Five UI themes:** Midnight, Aurora, Ocean, Sunset, Space
- **Phase 1 features:** queue, offline downloads, Smart Radio (heuristic), comments/follow, album upload, Settings, trending/new releases, search filters

## Structure

```
www/                 # User web UI (index.html + css/ + js/)
apps/admin-web/      # Multi-file Admin (Vite + TS)
apps/user/           # Capacitor user app (com.nestmusic.app)
apps/admin/          # Capacitor admin app (com.nestmusic.admin)
api/                 # Vercel: FCM + app-version
public/bundles/      # Versioned OTA static mirrors (generated)
docs/                # ANDROID / FCM / SIGNING / DEPLOY / OTA_UPDATES
```

## Firebase (jokefi)

- RTDB: `https://jokefi-default-rtdb.firebaseio.com`
- FCM: see `docs/FCM_SETUP.md`

## Build web

```bash
npm run build
```

## Build Android (release)

```bash
export ANDROID_HOME=/path/to/android-sdk JAVA_HOME=/path/to/jdk-17-or-21
cd apps/user && npm i && npm run cap:sync && cd android && ./gradlew assembleRelease
cd apps/admin && npm i && npm run cap:sync && cd android && ./gradlew assembleRelease
```

APKs land under `android/app/build/outputs/apk/release/` and are copied to `dist-apks/`.

## Themes

Open **Settings** (drawer) → pick Midnight / Aurora / Ocean / Sunset / Space.  
Choice is stored in `localStorage` and synced to Firebase `users/{uid}/prefs` when signed in.  
First launch shows an optional theme picker.
