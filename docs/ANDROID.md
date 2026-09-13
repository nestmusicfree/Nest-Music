# Nest Music Android

## Apps

| App | applicationId | Web entry | APK |
|-----|---------------|-----------|-----|
| Nest Music (user) | `com.nestmusic.app` | `www/index.html` | `dist-apks/NestMusic-user-debug.apk` |
| Nest Music Admin | `com.nestmusic.admin` | `www/admin.html` (as index) | `dist-apks/NestMusic-admin-debug.apk` |

## Features (user app)

- **FCM push** via `@capacitor/push-notifications`. Tokens saved under Firebase RTDB `device_tokens/{uid|guest}/{tokenId}`.
- **Auto notify**: admin writes to `notification_requests`; devices toast on `child_added`. Real device push still needs an FCM server / Cloud Function that reads `notification_requests` and calls FCM HTTP v1 with stored tokens.
- **MediaStyle / MediaSession**: custom Capacitor plugin `NestMediaSession` shows cover, title, artist, play/pause/next on the system notification and lock screen while audio plays.
- **Share deep links**: `https://nest-music.vercel.app?track=TRACK_ID` or `?invite=app` opens the install banner (web) and/or plays that track. Also `nestmusic://track/...`.

## Firebase setup still required

1. Create Android apps in Firebase console (project **jokefi**) for both package names.
2. Download `google-services.json` into:
   - `apps/user/android/app/google-services.json`
   - `apps/admin/android/app/google-services.json` (optional for admin)
3. Enable Cloud Messaging API and (recommended) a Cloud Function that watches `notification_requests` and sends FCM to `device_tokens/*`.
4. Without `google-services.json`, the APK builds but FCM registration will not work.

## Rebuild

```bash
export ANDROID_HOME=/path/to/android-sdk JAVA_HOME=/path/to/jdk-17-or-21
cd apps/user && npm i && npx cap sync android && cd android && ./gradlew assembleDebug
cd apps/admin && npm i && npx cap sync android && cd android && ./gradlew assembleDebug
```
