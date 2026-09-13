# Nest Music

Lossless audio streaming — web + dual Android apps (**v1.3.1**).

**Repo:** https://github.com/nestmusicfree/Nest-Music  
**Live web:** https://nest-music.vercel.app  
**Admin console:** https://nest-music.vercel.app/admin/  
**Releases:** https://github.com/nestmusicfree/Nest-Music/releases  
**User APK:** https://github.com/nestmusicfree/Nest-Music/releases/latest/download/NestMusic-user.apk  
**Version API:** https://nest-music.vercel.app/api/app-version  
**OTA bundles:** https://nest-music.vercel.app/bundles/v1.3.1/

## What's new in 1.3.1

- Compact professional home UI (calmer themes; English only; no emoji in UI copy)
- Now Playing actions: **Comment**, **Share**, **Download**, **Add to playlist** + overflow menu
- Real device downloads (MediaStore / Filesystem) with ID3 metadata, Nest Music cover badge, progress
- Lyrics from Firebase `tracks/{id}/lyrics` with language picker + LRC sync when timestamps exist
- Install-or-open share links (`https://nest-music.vercel.app/?track=ID`, `nestmusic://`) + smart banner / APK CTA
- Filled rating stars matching the user's 1–5 rating
- In-app notification toggle sheets removed (system FCM remains)

## YouTube / Content ID (honest limit)

Nest Music **cannot** auto-inject Nest Music branding into YouTube uploads without a YouTube Content ID partner account.  
What we do on **download** instead:

- Write ID3/metadata: title, artist, album, comment/copyright `Nest Music — https://nest-music.vercel.app`, encoded-by Nest Music
- Embed a subtle Nest Music mark on the cover art stored with the file
- Optional audible bumper is **not** applied by default (avoids ruining the song)

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
- Lyrics: `tracks/{id}/lyrics` as a language map, e.g. `{ "en": "...", "hi": "..." }` (plain text or LRC)

## App Links

- Android App Links host: `nest-music.vercel.app`
- Digital Asset Links: `https://nest-music.vercel.app/.well-known/assetlinks.json`
- Custom scheme: `nestmusic://track/{id}` · `nestmusic://open`

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

Open **Settings** → Midnight / Aurora / Ocean / Sunset / Space (calmer professional palettes).  
Choice is stored in `localStorage` and synced to Firebase `users/{uid}/prefs` when signed in.
