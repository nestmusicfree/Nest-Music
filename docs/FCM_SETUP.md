# Nest Music — Real FCM (project jokefi)

## Working now

- Client `google-services.json` on disk (gitignored) for:
  - `apps/user/android/app/google-services.json` → `com.nestmusic.app`
  - `apps/admin/android/app/google-services.json` → `com.nestmusic.admin` (+ app)
- Sender ID: `968982416863`
- Vercel `/api/fcm-send` + `/api/fcm-drain` use **firebase-admin** + `FIREBASE_SERVICE_ACCOUNT`
- Admin UI / track approve write `notification_requests`; sender delivers to `device_tokens`
- User app registers FCM tokens via Capacitor PushNotifications + `POST_NOTIFICATIONS`

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

Stale tokens return `NotRegistered` and can be pruned later.
