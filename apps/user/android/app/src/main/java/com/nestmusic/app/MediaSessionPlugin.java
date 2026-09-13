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

    @Override
    public void load() {
        Context ctx = getContext();
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
    }

    private void emitAction(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("mediaAction", data);
    }

    private void ensureChannel() {
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
        currentTitle = call.getString("title", "Nest Music");
        currentArtist = call.getString("artist", "Nest Music");
        String cover = call.getString("cover", null);
        Boolean playing = call.getBoolean("isPlaying", false);
        Double position = call.getDouble("position", 0d);
        Double duration = call.getDouble("duration", 0d);
        isPlaying = playing != null && playing;
        positionMs = (long) ((position != null ? position : 0) * 1000);
        durationMs = (long) ((duration != null ? duration : 0) * 1000);

        if (cover != null && !cover.isEmpty()) {
            io.execute(() -> {
                Bitmap art = decodeCover(cover);
                if (art != null) currentArt = art;
                getActivity().runOnUiThread(this::publishSessionAndNotification);
            });
        } else {
            publishSessionAndNotification();
        }
        call.resolve();
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        Boolean playing = call.getBoolean("isPlaying", false);
        Double position = call.getDouble("position", 0d);
        Double duration = call.getDouble("duration", 0d);
        isPlaying = playing != null && playing;
        positionMs = (long) ((position != null ? position : 0) * 1000);
        durationMs = (long) ((duration != null ? duration : 0) * 1000);
        publishSessionAndNotification();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (notificationManager != null) notificationManager.cancel(NOTIF_ID);
        if (mediaSession != null) {
            mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
                .setState(PlaybackStateCompat.STATE_STOPPED, 0, 1f).build());
        }
        call.resolve();
    }

    private Bitmap decodeCover(String cover) {
        try {
            if (cover.startsWith("data:")) {
                int comma = cover.indexOf(',');
                String b64 = comma >= 0 ? cover.substring(comma + 1) : cover;
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            }
            if (cover.startsWith("http")) {
                HttpURLConnection conn = (HttpURLConnection) new URL(cover).openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                try (InputStream in = conn.getInputStream()) {
                    return BitmapFactory.decodeStream(in);
                } finally {
                    conn.disconnect();
                }
            }
            // raw base64
            byte[] bytes = Base64.decode(cover, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            return null;
        }
    }

    private void publishSessionAndNotification() {
        if (mediaSession == null) return;

        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Nest Music")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (currentArt != null) {
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
            .setState(state, positionMs, 1f)
            .build());

        Intent contentIntent = getContext().getPackageManager()
            .getLaunchIntentForPackage(getContext().getPackageName());
        PendingIntent contentPi = PendingIntent.getActivity(
            getContext(), 0, contentIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(getContext().getApplicationInfo().icon)
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

        if (currentArt != null) builder.setLargeIcon(currentArt);

        Notification notification = builder.build();
        notificationManager.notify(NOTIF_ID, notification);
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
        } catch (Exception ignored) {}
        if (notificationManager != null) notificationManager.cancel(NOTIF_ID);
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
