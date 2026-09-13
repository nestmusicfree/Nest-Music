# Nest Music

Lossless audio streaming — web + dual Android apps (v1.2.1).

**Repo:** https://github.com/nestmusicfree/Nest-Music  
**Live web:** https://nest-music.vercel.app  
**Admin console:** https://nest-music.vercel.app/admin/  
**Releases:** https://github.com/nestmusicfree/Nest-Music/releases

## Structure

```
www/                 # User web UI (index.html)
apps/admin-web/      # Multi-file Admin (Vite + TS) — source of truth
apps/user/           # Capacitor user app (com.nestmusic.app)
apps/admin/          # Capacitor admin app (com.nestmusic.admin) wraps admin-web
api/                 # Vercel FCM sender (/api/fcm-send, /api/fcm-drain)
icons/               # Brand logo + generated launcher assets
dist-apks/           # Built APKs
docs/                # ANDROID / FCM / SIGNING / DEPLOY
```

## Firebase (jokefi)

- RTDB: `https://jokefi-default-rtdb.firebaseio.com`
- FCM: see `docs/FCM_SETUP.md` (needs `google-services.json` + `FIREBASE_SERVICE_ACCOUNT`)

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
