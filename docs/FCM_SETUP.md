# Nest Music — Real FCM (project jokefi)

## Working now (v1.2.1)

- Client `google-services.json` on disk (gitignored) for:
  - `apps/user/android/app/google-services.json` → `com.nestmusic.app`
  - `apps/admin/android/app/google-services.json` → `com.nestmusic.admin` (+ app)
- Sender ID: `968982416863`
- Vercel `/api/fcm-send` + `/api/fcm-drain` use **firebase-admin** + `FIREBASE_SERVICE_ACCOUNT`
- High-priority Android payload: channel `nest_music_notifications`, visibility public, `click_action` OPEN, default white tray icon `ic_stat_nest`
- Admin UI / track approve / user upload write `notification_requests` then POST `/api/fcm-send` with `requestId`
- Immediate POST `/api/fcm-send` after every queue (primary). Vercel Hobby Cron hits `/api/fcm-drain` once daily as a backup; upgrade to Pro for 1–5 minute drain
- Stale `NotRegistered` tokens are removed from `device_tokens`
- User app registers FCM tokens via Capacitor PushNotifications + first-launch **Allow Notifications** English prompt (`POST_NOTIFICATIONS`)

## Local / CI rebuild notes

Keep `google-services.json` files on disk (not in git). Admin SDK JSON lives outside the repo
(e.g. `/home/box/.secrets/nest-music/firebase-admin.json`) and only in Vercel env.

```bash
# Vercel env (already set in production for this project)
# FIREBASE_SERVICE_ACCOUNT=<stringified JSON>
# FIREBASE_PROJECT_ID=jokefi
# FIREBASE_DATABASE_URL=https://jokefi-default-rtdb.firebaseio.com
```

Test:

```bash
curl -X POST https://nest-music.vercel.app/api/fcm-send \
  -H 'Content-Type: application/json' \
  -d '{"title":"Nest Music","body":"hello","type":"system"}'
```

Expect `{ ok: true, tokenCount, sent, failed }`.
