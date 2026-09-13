package com.nestmusic.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Saves audio into the device Music library (MediaStore) with title/artist
 * and optional album art. Fail-soft: never crash the WebView.
 */
@CapacitorPlugin(name = "NestMediaStore")
public class MediaStorePlugin extends Plugin {
    private static final String TAG = "NestMediaStore";
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void saveAudio(PluginCall call) {
        final String base64 = call.getString("base64");
        final String title = safe(call.getString("title"), "Nest Music Track");
        final String artist = safe(call.getString("artist"), "Nest Music");
        final String album = safe(call.getString("album"), "Nest Music");
        final String fileName = safe(call.getString("fileName"), sanitize(title) + ".mp3");
        final String mime = safe(call.getString("mimeType"), "audio/mpeg");
        final String coverBase64 = call.getString("coverBase64");
        final String comment = safe(call.getString("comment"), "Nest Music — https://nest-music.vercel.app");

        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing audio data");
            return;
        }

        io.execute(() -> {
            try {
                byte[] audio = decodeDataUrl(base64);
                if (audio == null || audio.length == 0) {
                    call.reject("Could not decode audio");
                    return;
                }
                Context ctx = getContext();
                Uri uri = writeToMediaStore(ctx, audio, fileName, mime, title, artist, album, comment);
                if (coverBase64 != null && !coverBase64.isEmpty() && uri != null) {
                    tryEmbedAlbumArt(ctx, uri, coverBase64);
                }
                // Media scan for older paths / visibility in gallery apps
                try {
                    if (uri != null && "file".equalsIgnoreCase(uri.getScheme())) {
                        MediaScannerConnection.scanFile(ctx, new String[]{uri.getPath()}, new String[]{mime}, null);
                    }
                } catch (Throwable ignored) {}

                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("uri", uri != null ? uri.toString() : "");
                ret.put("bytes", audio.length);
                call.resolve(ret);
            } catch (Throwable t) {
                Log.e(TAG, "saveAudio failed", t);
                call.reject("Save failed: " + t.getMessage());
            }
        });
    }

    private Uri writeToMediaStore(Context ctx, byte[] audio, String fileName, String mime,
                                  String title, String artist, String album, String comment) throws Exception {
        ContentResolver cr = ctx.getContentResolver();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
            values.put(MediaStore.Audio.Media.MIME_TYPE, mime);
            values.put(MediaStore.Audio.Media.IS_PENDING, 1);
            values.put(MediaStore.Audio.Media.TITLE, title);
            values.put(MediaStore.Audio.Media.ARTIST, artist);
            values.put(MediaStore.Audio.Media.ALBUM, album);
            values.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/Nest Music");
            Uri collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri item = cr.insert(collection, values);
            if (item == null) throw new IllegalStateException("MediaStore insert failed");
            try (OutputStream out = cr.openOutputStream(item)) {
                if (out == null) throw new IllegalStateException("No output stream");
                out.write(audio);
            }
            values.clear();
            values.put(MediaStore.Audio.Media.IS_PENDING, 0);
            // Some OEMs accept DESCRIPTION as comment-like field
            cr.update(item, values, null, null);
            return item;
        }

        // Pre-Q fallback: public Music dir + scan
        File music = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC);
        File nest = new File(music, "Nest Music");
        if (!nest.exists() && !nest.mkdirs()) {
            nest = ctx.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
            if (nest != null && !nest.exists()) nest.mkdirs();
        }
        File outFile = new File(nest, fileName);
        try (FileOutputStream fos = new FileOutputStream(outFile)) {
            fos.write(audio);
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.Audio.Media.DATA, outFile.getAbsolutePath());
        values.put(MediaStore.Audio.Media.TITLE, title);
        values.put(MediaStore.Audio.Media.ARTIST, artist);
        values.put(MediaStore.Audio.Media.ALBUM, album);
        values.put(MediaStore.Audio.Media.MIME_TYPE, mime);
        values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
        Uri item = cr.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
        MediaScannerConnection.scanFile(ctx, new String[]{outFile.getAbsolutePath()}, new String[]{mime}, null);
        return item != null ? item : Uri.fromFile(outFile);
    }

    private void tryEmbedAlbumArt(Context ctx, Uri audioUri, String coverBase64) {
        // MediaStore album art association is OEM-specific; write a sibling JPEG
        // into Pictures/Nest Music Covers so the user still has branded artwork.
        try {
            byte[] raw = decodeDataUrl(coverBase64);
            if (raw == null) return;
            Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (bmp == null) return;
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 90, baos);
            byte[] jpeg = baos.toByteArray();
            String name = "cover-" + System.currentTimeMillis() + ".jpg";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Nest Music Covers");
                cv.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri img = ctx.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (img != null) {
                    try (OutputStream out = ctx.getContentResolver().openOutputStream(img)) {
                        if (out != null) out.write(jpeg);
                    }
                    cv.clear();
                    cv.put(MediaStore.Images.Media.IS_PENDING, 0);
                    ctx.getContentResolver().update(img, cv, null, null);
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "album art soft-fail", t);
        }
    }

    private static byte[] decodeDataUrl(String data) {
        try {
            String s = data;
            int comma = s.indexOf(',');
            if (s.startsWith("data:") && comma > 0) s = s.substring(comma + 1);
            return Base64.decode(s, Base64.DEFAULT);
        } catch (Throwable t) {
            return null;
        }
    }

    private static String safe(String v, String d) {
        return (v == null || v.trim().isEmpty()) ? d : v.trim();
    }

    private static String sanitize(String name) {
        return name.replaceAll("[\\\\/:*?\"<>|]+", "_").trim();
    }
}
