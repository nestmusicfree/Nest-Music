package com.nestmusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NestMainActivity";
    public static final String CHANNEL_ID = "nest_music_notifications";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            ensureNotificationChannel();
        } catch (Throwable t) {
            Log.w(TAG, "notification channel failed (fail-soft)", t);
        }
        try {
            registerPlugin(MediaSessionPlugin.class);
        } catch (Throwable t) {
            Log.e(TAG, "NestMediaSession register failed (fail-soft)", t);
        }
        try {
            super.onCreate(savedInstanceState);
        } catch (Throwable t) {
            Log.e(TAG, "BridgeActivity onCreate failed", t);
            throw t;
        }
        try {
            handleDeepLink(getIntent());
        } catch (Throwable t) {
            Log.w(TAG, "deep link handle failed", t);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        try { handleDeepLink(intent); } catch (Throwable ignored) {}
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Nest Music",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Song releases and Nest Music alerts");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLightColor(Color.parseColor("#1DB954"));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        // Capacitor App plugin getLaunchUrl covers this; keep intent data intact.
    }
}
