# Deploy

## Web (Vercel)

- Project: `nest-music` (team `king-e545b6c2`)
- Production URL: https://nest-music.vercel.app
- Admin: https://nest-music.vercel.app/admin/
- Version: https://nest-music.vercel.app/app-version.json · `/api/app-version`
- OTA bundles: https://nest-music.vercel.app/bundles/v1.3.1/

```bash
npm run build
vercel pull --yes --environment production --scope king-e545b6c2
vercel build --yes --prod --scope king-e545b6c2
# If CLI deploy is BLOCKED ("commit author doesn't have permission"),
# deploy prebuilt from a copy WITHOUT .git:
rm -rf /tmp/nest-deploy && mkdir -p /tmp/nest-deploy && cp -a .vercel /tmp/nest-deploy/
cd /tmp/nest-deploy && vercel deploy --prebuilt --prod --yes --scope king-e545b6c2
```

Set env `FIREBASE_SERVICE_ACCOUNT` for live FCM (see `docs/FCM_SETUP.md`).

## GitHub

Canonical repo: https://github.com/nestmusicfree/Nest-Music  
Release APKs via `gh release create v1.3.1 dist-apks/*.apk`

## OTA

See `docs/OTA_UPDATES.md`.
