package com.nestmusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NestMediaSession")
public class MediaSessionPlugin extends Plugin {
    private static final String TAG = "NestMediaSession";
    public static final String ACTION_PLAY = "com.nestmusic.app.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.nestmusic.app.ACTION_PAUSE";
    public static final String ACTION_NEXT = "com.nestmusic.app.ACTION_NEXT";
    public static final String ACTION_PREV = "com.nestmusic.app.ACTION_PREV";
    public static final String CHANNEL_ID = "nest_music_playback";
    public static final int NOTIF_ID = 4401;

    private MediaSessionCompat mediaSession;
    private NotificationManager notificationManager;
    private BroadcastReceiver actionReceiver;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Bitmap currentArt;
    private String currentTitle = "Nest Music";
    private String currentArtist = "Unknown";
    private boolean isPlaying = false;
    private long positionMs = 0;
    private long durationMs = 0;
    private boolean ready = false;

    @Override
    public void load() {
        // Fail-soft: never crash the WebView/app if media session setup fails
        try {
            Context ctx = getContext();
            if (ctx == null) {
                Log.w(TAG, "load skipped: null context");
                return;
            }
            notificationManager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            ensureChannel();
            mediaSession = new MediaSessionCompat(ctx, "NestMusicSession");
            mediaSession.setActive(true);
            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                @Override public void onPlay() { emitAction("play"); }
                @Override public void onPause() { emitAction("pause"); }
                @Override public void onSkipToNext() { emitAction("next"); }
                @Override public void onSkipToPrevious() { emitAction("previous"); }
            });

            actionReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null || intent.getAction() == null) return;
                    switch (intent.getAction()) {
                        case ACTION_PLAY: emitAction("play"); break;
                        case ACTION_PAUSE: emitAction("pause"); break;
                        case ACTION_NEXT: emitAction("next"); break;
                        case ACTION_PREV: emitAction("previous"); break;
                    }
                }
            };
            IntentFilter filter = new IntentFilter();
            filter.addAction(ACTION_PLAY);
            filter.addAction(ACTION_PAUSE);
            filter.addAction(ACTION_NEXT);
            filter.addAction(ACTION_PREV);
            if (Build.VERSION.SDK_INT >= 33) {
                ctx.registerReceiver(actionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                ctx.registerReceiver(actionReceiver, filter);
            }
            ready = true;
        } catch (Throwable t) {
            Log.e(TAG, "MediaSession load failed (fail-soft)", t);
            ready = false;
            mediaSession = null;
        }
    }

    private void emitAction(String action) {
        try {
            JSObject data = new JSObject();
            data.put("action", action);
            notifyListeners("mediaAction", data);
        } catch (Throwable t) {
            Log.w(TAG, "emitAction failed", t);
        }
    }

    private void ensureChannel() {
        if (notificationManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Now Playing", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Nest Music playback controls");
            ch.setShowBadge(false);
            notificationManager.createNotificationChannel(ch);
        }
    }

    @PluginMethod
    public void updateNowPlaying(PluginCall call) {
        try {
            currentTitle = safeStr(call.getString("title", "Nest Music"), "Nest Music");
            currentArtist = safeStr(call.getString("artist", "Nest Music"), "Nest Music");
            String cover = call.getString("cover", null);
            Boolean playing = call.getBoolean("isPlaying", false);
            Double position = call.getDouble("position", 0d);
            Double duration = call.getDouble("duration", 0d);
            isPlaying = playing != null && playing;
            positionMs = (long) ((position != null ? position : 0) * 1000);
            durationMs = (long) ((duration != null ? duration : 0) * 1000);

            if (cover != null && !cover.isEmpty() && !"null".equalsIgnoreCase(cover)) {
                final String coverFinal = cover;
                io.execute(() -> {
                    try {
                        Bitmap art = decodeCover(coverFinal);
                        if (art != null) {
                            // Cap huge base64 covers to avoid OOM
                            if (art.getWidth() > 1024 || art.getHeight() > 1024) {
                                art = Bitmap.createScaledBitmap(art, 512, 512, true);
                            }
                            currentArt = art;
                        }
                    } catch (Throwable t) {
                        Log.w(TAG, "cover decode failed", t);
                    }
                    runOnUiSafe(this::publishSessionAndNotification);
                });
            } else {
                publishSessionAndNotification();
            }
            call.resolve();
        } catch (Throwable t) {
            Log.e(TAG, "updateNowPlaying failed", t);
            call.resolve(); // never reject hard — fail soft
        }
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        try {
            Boolean playing = call.getBoolean("isPlaying", false);
            Double position = call.getDouble("position", 0d);
            Double duration = call.getDouble("duration", 0d);
            isPlaying = playing != null && playing;
            positionMs = (long) ((position != null ? position : 0) * 1000);
            durationMs = (long) ((duration != null ? duration : 0) * 1000);
            publishSessionAndNotification();
            call.resolve();
        } catch (Throwable t) {
            Log.e(TAG, "setPlaybackState failed", t);
            call.resolve();
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            if (notificationManager != null) notificationManager.cancel(NOTIF_ID);
            if (mediaSession != null) {
                mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
                    .setState(PlaybackStateCompat.STATE_STOPPED, 0, 1f).build());
            }
        } catch (Throwable t) {
            Log.w(TAG, "clear failed", t);
        }
        call.resolve();
    }

    private static String safeStr(String s, String fallback) {
        if (s == null || s.trim().isEmpty() || "null".equalsIgnoreCase(s) || "undefined".equalsIgnoreCase(s)) {
            return fallback;
        }
        return s;
    }

    private void runOnUiSafe(Runnable r) {
        try {
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    try { r.run(); } catch (Throwable t) { Log.w(TAG, "ui task failed", t); }
                });
            } else {
                r.run();
            }
        } catch (Throwable t) {
            Log.w(TAG, "runOnUiSafe failed", t);
        }
    }

    private Bitmap decodeCover(String cover) {
        if (cover == null || cover.isEmpty()) return null;
        try {
            // Reject absurd payloads
            if (cover.length() > 8_000_000) return null;

            if (cover.startsWith("data:")) {
                int comma = cover.indexOf(',');
                if (comma < 0) return null;
                String b64 = cover.substring(comma + 1);
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                if (bytes == null || bytes.length == 0) return null;
                BitmapFactory.Options opts = new BitmapFactory.Options();
                opts.inSampleSize = bytes.length > 1_500_000 ? 4 : (bytes.length > 500_000 ? 2 : 1);
                return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
            }
            if (cover.startsWith("http://") || cover.startsWith("https://")) {
                HttpURLConnection conn = (HttpURLConnection) new URL(cover).openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setInstanceFollowRedirects(true);
                try (InputStream in = conn.getInputStream()) {
                    return BitmapFactory.decodeStream(in);
                } finally {
                    conn.disconnect();
                }
            }
            // raw base64 — only if it looks plausible
            if (cover.length() < 64) return null;
            byte[] bytes = Base64.decode(cover, Base64.DEFAULT);
            if (bytes == null || bytes.length == 0) return null;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Throwable e) {
            return null;
        }
    }

    private void publishSessionAndNotification() {
        if (!ready || mediaSession == null || notificationManager == null) return;
        try {
            MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Nest Music")
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, Math.max(0, durationMs));
            if (currentArt != null && !currentArt.isRecycled()) {
                meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentArt);
                meta.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, currentArt);
            }
            mediaSession.setMetadata(meta.build());

            int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
            mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY |
                    PlaybackStateCompat.ACTION_PAUSE |
                    PlaybackStateCompat.ACTION_PLAY_PAUSE |
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                )
                .setState(state, Math.max(0, positionMs), 1f)
                .build());

            Intent contentIntent = getContext().getPackageManager()
                .getLaunchIntentForPackage(getContext().getPackageName());
            if (contentIntent == null) {
                contentIntent = new Intent(getContext(), MainActivity.class);
            }
            PendingIntent contentPi = PendingIntent.getActivity(
                getContext(), 0, contentIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            int smallIcon = getContext().getApplicationInfo().icon;
            if (smallIcon == 0) {
                smallIcon = android.R.drawable.ic_media_play;
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setSmallIcon(smallIcon)
                .setContentIntent(contentPi)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setOngoing(isPlaying)
                .setShowWhen(false)
                .setStyle(new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2))
                .addAction(android.R.drawable.ic_media_previous, "Previous", pending(ACTION_PREV, 1))
                .addAction(
                    isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                    isPlaying ? "Pause" : "Play",
                    pending(isPlaying ? ACTION_PAUSE : ACTION_PLAY, 2))
                .addAction(android.R.drawable.ic_media_next, "Next", pending(ACTION_NEXT, 3));

            if (currentArt != null && !currentArt.isRecycled()) {
                builder.setLargeIcon(currentArt);
            }

            Notification notification = builder.build();
            notificationManager.notify(NOTIF_ID, notification);
        } catch (Throwable t) {
            Log.e(TAG, "publishSessionAndNotification failed", t);
        }
    }

    private PendingIntent pending(String action, int req) {
        Intent i = new Intent(action);
        i.setPackage(getContext().getPackageName());
        return PendingIntent.getBroadcast(
            getContext(), req, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (actionReceiver != null) getContext().unregisterReceiver(actionReceiver);
        } catch (Throwable ignored) {}
        try {
            if (notificationManager != null) notificationManager.cancel(NOTIF_ID);
        } catch (Throwable ignored) {}
        try {
            if (mediaSession != null) {
                mediaSession.setActive(false);
                mediaSession.release();
            }
        } catch (Throwable ignored) {}
        try { io.shutdownNow(); } catch (Throwable ignored) {}
        super.handleOnDestroy();
    }
}
