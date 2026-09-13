# Deploy

## Web (Vercel)

- Project: `nest-music`
- Production URL: https://nest-music.vercel.app
- Admin: https://nest-music.vercel.app/admin/

```bash
npm run build
vercel pull --yes --environment production
vercel build --yes --prod
vercel deploy --prebuilt --prod
```

Set env `FIREBASE_SERVICE_ACCOUNT` for live FCM (see `docs/FCM_SETUP.md`).

## GitHub

Canonical repo: https://github.com/nestmusicfree/Nest-Music  
Release APKs via `gh release create v1.2.1 dist-apks/*.apk`
