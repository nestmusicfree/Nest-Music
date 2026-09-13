# Android release signing

Upload keystore: `apps/keystore/nest-music-upload.jks`  
Alias: `nestmusic`

Passwords are loaded from `apps/keystore/keystore.properties` (gitignored) or env:

```bash
export NEST_STORE_PASSWORD=...
export NEST_KEY_PASSWORD=...
```

Copy `apps/keystore/keystore.properties.example` → `keystore.properties` for local release builds.

**Play Protect:** Always distribute **release-signed** APKs (`assembleRelease`), never debug-signed sideloads, to reduce scam warnings. First install from unknown sources may still warn until Play listing exists.
