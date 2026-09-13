# Nest Music Android

## Apps

| App | applicationId | Web entry | Version |
|-----|---------------|-----------|---------|
| Nest Music (user) | `com.nestmusic.app` | `www/index.html` | 1.2.1 |
| Nest Music Admin | `com.nestmusic.admin` | `apps/admin-web` build | 1.2.1 |

## Features (user app)

- **FCM push** via `@capacitor/push-notifications` (requires `google-services.json`)
- Tokens: Firebase RTDB `device_tokens/{uid|guest}/{tokenId}`
- Sender: Vercel `/api/fcm-send` reads `notification_requests` + service account
- **MediaStyle / MediaSession**: `NestMediaSession` plugin (fail-soft; never crashes startup)
- Deep links: `?track=TRACK_ID` open-to-play only (no APK install prompts)

## Firebase setup

See `docs/FCM_SETUP.md`. Place:

- `apps/user/android/app/google-services.json`
- `apps/admin/android/app/google-services.json` (optional)

## Rebuild

```bash
export ANDROID_HOME=... JAVA_HOME=...
cd apps/user && npm i && npm run cap:sync && cd android && ./gradlew assembleRelease
cd apps/admin && npm i && npm run cap:sync && cd android && ./gradlew assembleRelease
```

## System tray notifications (v1.2.1)

- Default FCM icon: `ic_stat_nest` + channel `nest_music_notifications` created in `MainActivity`
- First launch shows an English Allow Notifications sheet, then Android `POST_NOTIFICATIONS`
- Native in-app RTDB toasts are gated so they do not replace real FCM tray alerts
