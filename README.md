# Nest Music

Lossless audio streaming — web + dual Android apps (**v1.4.0**).

**Repo:** https://github.com/nestmusicfree/Nest-Music  
**Live web:** https://nest-music.vercel.app  
**Admin console:** https://nest-music.vercel.app/admin/  
**Releases:** https://github.com/nestmusicfree/Nest-Music/releases  
**User APK:** https://github.com/nestmusicfree/Nest-Music/releases/latest/download/NestMusic-user.apk  
**Version API:** https://nest-music.vercel.app/api/app-version  
**OTA bundles:** https://nest-music.vercel.app/bundles/v1.4.0/

## What's new in 1.4.0

- Spotify-like Home, Search, Your Library, and Create (no Premium paywall)
- Bottom navigation: Home, Search, Your Library, Create — icon + text, active filled white
- Home: avatar, All/Music chips (text only), quick tiles, Your top mixes, Recommended Stations
- Search: white field "What do you want to listen to?", colorful browse tiles, Discover
- Your Library: Playlists/Artists chips, Recents + grid, Liked Songs gradient, circular artists
- Create sheet: Playlist / Collaborative playlist / Blend / Folder
- Now Playing: minimize, playing-from context, large cover, white play, timer, Share/Queue, sticky header, lyrics, about artist, explore, credits
- FCM notifications include cover/image (`android.notification.imageUrl`)
- Admin: song push with cover + manual messages (title, body, optional image) without a track
- In-app announcements inbox
- Real device MediaStore downloads with title/artist/cover (unchanged)

## Navigation map

| Tab | Opens |
| --- | --- |
| Home | Discover feed, mixes, stations, catalog |
| Search | Browse tiles + search results |
| Your Library | Liked Songs, playlists, artists, downloads |
| Create | Bottom sheet (not a Premium page) |

Drawer still has Settings, Profile, Upload, SFX, Downloads.

## Admin: manual messages

1. Open https://nest-music.vercel.app/admin/ → **Send Push Notification**
2. Right column **Manual message**
3. Enter **Title** and **Body**
4. Optional: paste an image URL or upload a file
5. Tap **Send**
6. Stored as `notification_requests` `type=message` and `announcements/{id}`
7. Delivered via `/api/fcm-send` with image when present

Song pushes on the left still require a track and attach that track's cover (or the Nest logo if the cover is not a public URL).

## Image notifications

FCM payload includes `notification.imageUrl` and `android.notification.imageUrl` so the Android system tray can show a song/cover image. Uploaded announcement images are served at `/api/announce-image?id=`.

## Structure

```
www/                 # User web UI (index.html + css/ + js/)
apps/admin-web/      # Multi-file Admin (Vite + TS)
apps/user/           # Capacitor user app (com.nestmusic.app)
apps/admin/          # Capacitor admin app (com.nestmusic.admin)
api/                 # Vercel: FCM + app-version + announce-image
public/bundles/      # Versioned OTA static mirrors (generated)
docs/                # ANDROID / FCM / SIGNING / DEPLOY / OTA_UPDATES
```

## Firebase (jokefi)

- RTDB: `https://jokefi-default-rtdb.firebaseio.com`
- FCM: see `docs/FCM_SETUP.md`
- Lyrics: `tracks/{id}/lyrics` as a language map
- Announcements: `announcements/{id}` `{ title, body, imageUrl, imageBase64? }`

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

## Themes

Open **Settings** → Midnight / Aurora / Ocean / Sunset / Space (calmer professional palettes).
