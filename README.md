# Nest Music

Lossless audio streaming — web + dual Android apps.

**Repo:** https://github.com/nestmusicfree/Nest-Music  
**Live web:** https://nest-music.vercel.app  
**Admin console:** https://nest-music.vercel.app/admin.html

## Structure

```
www/           # Web UI (index + admin)
public/        # Vercel static sync from www/
apps/user/     # Capacitor user app (com.nestmusic.app)
apps/admin/    # Capacitor admin app (com.nestmusic.admin)
dist-apks/     # NestMusic-user-debug.apk, NestMusic-admin-debug.apk
```

## Firebase

- Project: `jokefi`
- RTDB: `https://jokefi-default-rtdb.firebaseio.com`
- Same web config kept in HTML.

See `docs/ANDROID.md` and `docs/DEPLOY.md`.
