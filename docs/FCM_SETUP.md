# Nest Music — Real FCM Setup (project jokefi)

## Done in repo / builds

- Android apps registered: `com.nestmusic.app`, `com.nestmusic.admin`
- Client `google-services.json` baked into:
  - `apps/user/android/app/google-services.json`
  - `apps/admin/android/app/google-services.json`
- Sender ID / project number: `968982416863`
- User APK requests `POST_NOTIFICATIONS` and registers tokens to RTDB `device_tokens/*`
- Admin / approve flows write `notification_requests`
- Vercel sender: `POST|GET /api/fcm-send` and `/api/fcm-drain` (FCM HTTP v1)

## Remaining (server push)

1. Firebase Console → Project settings → Service accounts → **Generate new private key**
2. Vercel project `nest-music` → Environment Variables (Production):
   - `FIREBASE_SERVICE_ACCOUNT` = entire JSON (one line)
   - Optional: `FCM_SEND_SECRET`, `FIREBASE_PROJECT_ID=jokefi`, `FIREBASE_DATABASE_URL=https://jokefi-default-rtdb.firebaseio.com`
3. Redeploy Vercel (or wait for next deploy)
4. Test: Admin → Send Push, or `curl -X POST https://nest-music.vercel.app/api/fcm-send -H 'Content-Type: application/json' -d '{"requestId":"..."}'`

**Never commit** the Admin SDK private key to git.
