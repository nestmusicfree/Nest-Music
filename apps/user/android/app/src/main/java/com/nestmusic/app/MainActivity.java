package com.nestmusic.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "NestMainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
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

    private void handleDeepLink(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        // Capacitor App plugin getLaunchUrl covers this; keep intent data intact.
    }
}
