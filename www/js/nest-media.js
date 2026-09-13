/**
 * Nest Music v1.3.1 — Real device downloads (MediaStore + ID3 + cover badge),
 * lyrics (Firebase multi-lang / LRC), rating stars, install-or-open helpers.
 * English UI only. No emoji characters in UI strings.
 */
(function (global) {
  'use strict';

  const ATTR_COMMENT = 'Nest Music — https://nest-music.vercel.app';
  const ATTR_ENCODED = 'Nest Music';
  const APK_LATEST_URL = 'https://github.com/nestmusicfree/Nest-Music/releases/latest/download/NestMusic-user.apk';
  const APP_ORIGIN = 'https://nest-music.vercel.app';
  const PKG = 'com.nestmusic.app';

  let lyricsState = { lines: [], synced: false, lang: 'en', map: null, activeIdx: -1 };
  let downloadBusy = false;

  function toast(msg) {
    if (typeof global.showToast === 'function') global.showToast(msg);
    else console.log('[NestMedia]', msg);
  }
  function isNative() {
    try {
      return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
    } catch (_) { return false; }
  }
  function escapeSafe(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function sanitizeFileName(name) {
    return String(name || 'NestMusic').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80);
  }

  // ---------- Base64 / bytes ----------
  function dataUrlToBytes(dataUrl) {
    if (!dataUrl) return null;
    let s = String(dataUrl);
    const comma = s.indexOf(',');
    if (s.indexOf('data:') === 0 && comma > 0) s = s.slice(comma + 1);
    try {
      const bin = atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (_) { return null; }
  }
  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function guessMime(dataUrl, fallback) {
    const m = String(dataUrl || '').match(/^data:([^;]+);/);
    return (m && m[1]) || fallback || 'audio/mpeg';
  }

  // ---------- Minimal ID3v2.3 writer ----------
  function encodeLatin1(str) {
    const s = String(str || '');
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }
  function encodeUtf16(str) {
    const s = String(str || '');
    const out = new Uint8Array(2 + s.length * 2);
    out[0] = 0xff; out[1] = 0xfe; // BOM LE
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out[2 + i * 2] = c & 0xff;
      out[3 + i * 2] = (c >> 8) & 0xff;
    }
    return out;
  }
  function synchsafe(n) {
    return [
      (n >> 21) & 0x7f,
      (n >> 14) & 0x7f,
      (n >> 7) & 0x7f,
      n & 0x7f
    ];
  }
  function frame(id, body) {
    const idb = encodeLatin1(id);
    const size = body.length;
    const out = new Uint8Array(10 + size);
    out.set(idb, 0);
    out[4] = (size >> 24) & 0xff;
    out[5] = (size >> 16) & 0xff;
    out[6] = (size >> 8) & 0xff;
    out[7] = size & 0xff;
    out.set(body, 10);
    return out;
  }
  function textFrame(id, text) {
    const payload = encodeUtf16(text);
    const body = new Uint8Array(1 + payload.length);
    body[0] = 1; // UTF-16
    body.set(payload, 1);
    return frame(id, body);
  }
  function commentFrame(text) {
    const desc = encodeUtf16('');
    const val = encodeUtf16(text);
    const body = new Uint8Array(1 + 3 + desc.length + 1 + 1 + val.length);
    let o = 0;
    body[o++] = 1; // UTF-16
    body[o++] = 0x65; body[o++] = 0x6e; body[o++] = 0x67; // eng
    body.set(desc, o); o += desc.length;
    // UTF-16 null terminator already ends with zeros in empty desc; add explicit 00 00
    body[o++] = 0; body[o++] = 0;
    body.set(val, o);
    return frame('COMM', body);
  }
  function apicFrame(jpegBytes, mime) {
    const mimeB = encodeLatin1(mime || 'image/jpeg');
    const desc = encodeUtf16('Cover');
    const body = new Uint8Array(1 + mimeB.length + 1 + 1 + desc.length + jpegBytes.length);
    let o = 0;
    body[o++] = 1;
    body.set(mimeB, o); o += mimeB.length;
    body[o++] = 0;
    body[o++] = 3; // front cover
    body.set(desc, o); o += desc.length;
    body.set(jpegBytes, o);
    return frame('APIC', body);
  }
  function stripExistingId3(audioBytes) {
    if (!audioBytes || audioBytes.length < 10) return audioBytes;
    if (audioBytes[0] === 0x49 && audioBytes[1] === 0x44 && audioBytes[2] === 0x33) {
      const size = ((audioBytes[6] & 0x7f) << 21) | ((audioBytes[7] & 0x7f) << 14) |
        ((audioBytes[8] & 0x7f) << 7) | (audioBytes[9] & 0x7f);
      const start = 10 + size;
      if (start < audioBytes.length) return audioBytes.subarray(start);
    }
    return audioBytes;
  }
  function buildId3TaggedMp3(audioBytes, meta) {
    const raw = stripExistingId3(audioBytes);
    const frames = [];
    frames.push(textFrame('TIT2', meta.title || 'Untitled'));
    frames.push(textFrame('TPE1', meta.artist || 'Nest Music'));
    frames.push(textFrame('TALB', meta.album || 'Nest Music'));
    frames.push(textFrame('TENC', ATTR_ENCODED));
    frames.push(textFrame('TCOP', ATTR_COMMENT));
    frames.push(commentFrame(ATTR_COMMENT));
    if (meta.coverJpeg && meta.coverJpeg.length) {
      frames.push(apicFrame(meta.coverJpeg, 'image/jpeg'));
    }
    let frameSize = 0;
    frames.forEach(f => { frameSize += f.length; });
    const header = new Uint8Array(10);
    header[0] = 0x49; header[1] = 0x44; header[2] = 0x33; // ID3
    header[3] = 3; header[4] = 0; // v2.3
    header[5] = 0;
    const ss = synchsafe(frameSize);
    header[6] = ss[0]; header[7] = ss[1]; header[8] = ss[2]; header[9] = ss[3];
    const out = new Uint8Array(10 + frameSize + raw.length);
    out.set(header, 0);
    let o = 10;
    frames.forEach(f => { out.set(f, o); o += f.length; });
    out.set(raw, o);
    return out;
  }

  // ---------- Cover badge (subtle corner mark) ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  async function badgeCoverToJpeg(coverSrc) {
    try {
      if (!coverSrc) return null;
      const img = await loadImage(coverSrc);
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      // Subtle bottom-right pill badge
      const pad = 14;
      const bw = 150, bh = 36;
      const x = size - bw - pad, y = size - bh - pad;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, x, y, bw, bh, 10);
      ctx.fill();
      ctx.fillStyle = '#1DB954';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('Nest Music', x + 14, y + 23);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      return dataUrlToBytes(dataUrl);
    } catch (e) {
      console.warn('cover badge soft-fail', e);
      try {
        const raw = dataUrlToBytes(coverSrc);
        return raw;
      } catch (_) { return null; }
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Progress UI ----------
  function ensureProgressUI() {
    let el = document.getElementById('downloadProgressSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'downloadProgressSheet';
    el.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm hidden z-[70] flex items-center justify-center p-4';
    el.innerHTML = `
      <div class="glass-modal max-w-sm w-full p-5 rounded-3xl space-y-3 text-xs">
        <h3 class="text-sm font-black text-white">Downloading</h3>
        <p id="downloadProgressLabel" class="text-gray-300">Preparing file…</p>
        <div class="w-full bg-white/10 rounded-full h-2 overflow-hidden">
          <div id="downloadProgressFill" class="bg-brand h-full w-0 transition-all"></div>
        </div>
        <p id="downloadProgressPct" class="text-brand font-mono text-[11px]">0%</p>
      </div>`;
    document.body.appendChild(el);
    return el;
  }
  function showDownloadProgress(pct, label) {
    const sheet = ensureProgressUI();
    sheet.classList.remove('hidden');
    const fill = document.getElementById('downloadProgressFill');
    const pctEl = document.getElementById('downloadProgressPct');
    const lab = document.getElementById('downloadProgressLabel');
    if (fill) fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    if (lab && label) lab.textContent = label;
  }
  function hideDownloadProgress() {
    const sheet = document.getElementById('downloadProgressSheet');
    if (sheet) sheet.classList.add('hidden');
  }

  // ---------- Real device download ----------
  async function saveTrackToDevice(track) {
    if (!track) { toast('Nothing to download'); return; }
    if (downloadBusy) { toast('Download already in progress'); return; }
    if (!global.currentUser) {
      toast('Please sign in to download tracks');
      if (typeof global.switchView === 'function') global.switchView('profileView');
      return;
    }
    if (!track.audioBase64) { toast('Audio not available for this track'); return; }

    downloadBusy = true;
    try {
      showDownloadProgress(5, 'Preparing audio…');
      let audioBytes = dataUrlToBytes(track.audioBase64);
      if (!audioBytes) throw new Error('Could not read audio data');

      showDownloadProgress(25, 'Adding Nest Music cover badge…');
      const coverJpeg = await badgeCoverToJpeg(track.coverBase64 || track.coverUrl || '');

      showDownloadProgress(45, 'Writing metadata…');
      const title = track.title || 'Untitled';
      const artist = track.artist || 'Nest Music';
      const album = track.album || track.category || 'Nest Music';
      const tagged = buildId3TaggedMp3(audioBytes, {
        title, artist, album, coverJpeg
      });
      const mime = guessMime(track.audioBase64, 'audio/mpeg');
      const fileName = sanitizeFileName(title + ' - ' + artist) + (mime.indexOf('wav') >= 0 ? '.wav' : '.mp3');
      const taggedB64 = bytesToBase64(tagged);
      const dataUrl = 'data:' + mime + ';base64,' + taggedB64;

      showDownloadProgress(70, 'Saving to device…');

      let saved = false;
      // 1) Native MediaStore plugin
      try {
        const plugin = global.Capacitor?.Plugins?.NestMediaStore;
        if (isNative() && plugin && plugin.saveAudio) {
          const coverData = coverJpeg ? ('data:image/jpeg;base64,' + bytesToBase64(coverJpeg)) : (track.coverBase64 || '');
          await plugin.saveAudio({
            base64: dataUrl,
            title, artist, album,
            fileName,
            mimeType: mime,
            coverBase64: coverData,
            comment: ATTR_COMMENT
          });
          saved = true;
        }
      } catch (e) {
        console.warn('MediaStore save note:', e);
      }

      // 2) Capacitor Filesystem fallback into Documents/Nest Music
      if (!saved && isNative()) {
        try {
          const Filesystem = global.Capacitor?.Plugins?.Filesystem;
          if (Filesystem) {
            await Filesystem.writeFile({
              path: 'Nest Music/' + fileName,
              data: taggedB64,
              directory: 'DOCUMENTS',
              recursive: true
            });
            saved = true;
          }
        } catch (e) {
          console.warn('Filesystem save note:', e);
        }
      }

      // 3) Browser download fallback
      if (!saved) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        saved = true;
      }

      showDownloadProgress(90, 'Updating library…');
      // Also keep IndexedDB offline cache
      try {
        if (global.NestV13 && typeof global.NestV13.downloadSongOffline === 'function') {
          await global.NestV13.downloadSongOffline(track.id);
        }
      } catch (_) {}

      try {
        if (global.db && track.id) {
          const newCount = (track.downloadsCount || 0) + 1;
          await global.db.ref('tracks/' + track.id).update({ downloadsCount: newCount });
          track.downloadsCount = newCount;
          const el = document.getElementById('fpDownloadCount');
          if (el) el.innerText = String(newCount);
        }
      } catch (_) {}

      showDownloadProgress(100, 'Saved');
      toast('Saved to device: ' + title);
      setTimeout(hideDownloadProgress, 600);
    } catch (e) {
      console.error(e);
      hideDownloadProgress();
      toast('Download failed: ' + (e.message || 'unknown error'));
    } finally {
      downloadBusy = false;
    }
  }

  async function downloadCurrentToDevice() {
    await saveTrackToDevice(global.currentPlayingTrack);
  }

  // ---------- Lyrics ----------
  function parseLrc(text) {
    const lines = [];
    String(text || '').split(/\r?\n/).forEach(line => {
      const m = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
      if (m) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
        const t = min * 60 + sec + ms / 1000;
        const body = (m[4] || '').trim();
        if (body) lines.push({ t, text: body });
      } else if (line.trim() && !/^\[/.test(line.trim())) {
        lines.push({ t: null, text: line.trim() });
      }
    });
    return lines;
  }
  function normalizeLyricsMap(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') return { en: raw };
    if (typeof raw === 'object') return raw;
    return null;
  }
  function pickLang(map, preferred) {
    if (!map) return null;
    if (preferred && map[preferred]) return preferred;
    if (map.en) return 'en';
    if (map.EN) return 'EN';
    const keys = Object.keys(map);
    return keys[0] || null;
  }
  function renderLyricsBox() {
    const box = document.getElementById('lyricsContentBox');
    if (!box) return;
    const lines = lyricsState.lines || [];
    if (!lines.length) {
      box.innerHTML = '<p class="text-gray-400 text-sm py-8">No lyrics available for this track.</p>';
      return;
    }
    box.innerHTML = lines.map((ln, i) =>
      `<p class="lyric-line transition ${lyricsState.synced ? 'py-1' : ''}" data-idx="${i}" data-t="${ln.t == null ? '' : ln.t}">${escapeSafe(ln.text)}</p>`
    ).join('');
  }
  function updateLyricsLangPicker(map, active) {
    const wrap = document.getElementById('lyricsLangPicker');
    if (!wrap) return;
    if (!map || Object.keys(map).length <= 1) {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      return;
    }
    wrap.classList.remove('hidden');
    wrap.innerHTML = Object.keys(map).map(k =>
      `<button type="button" onclick="NestMedia.setLyricsLang('${escapeSafe(k)}')" class="px-2.5 py-1 rounded-full text-[10px] font-bold ${k === active ? 'bg-brand text-black' : 'glass text-white'}">${escapeSafe(String(k).toUpperCase())}</button>`
    ).join('');
  }
  async function loadLyricsForTrack(track) {
    lyricsState = { lines: [], synced: false, lang: 'en', map: null, activeIdx: -1 };
    const box = document.getElementById('lyricsContentBox');
    if (box) box.innerHTML = '<p class="text-gray-400 text-sm py-6">Loading lyrics…</p>';
    updateLyricsLangPicker(null, null);

    let map = normalizeLyricsMap(track && (track.lyrics || track.lyricsMap));
    // Prefer live Firebase field when possible
    try {
      if (global.db && track && track.id) {
        const snap = await global.db.ref('tracks/' + track.id + '/lyrics').once('value');
        const v = snap.val();
        if (v) map = normalizeLyricsMap(v);
      }
    } catch (_) {}

    if (!map || !Object.keys(map).length) {
      if (box) box.innerHTML = '<p class="text-gray-400 text-sm py-8">No lyrics available for this track.</p>';
      return;
    }
    lyricsState.map = map;
    const lang = pickLang(map, localStorage.getItem('nest_lyrics_lang') || 'en');
    setLyricsLang(lang, true);
  }
  function setLyricsLang(lang, skipPersist) {
    if (!lyricsState.map) return;
    const text = lyricsState.map[lang] || lyricsState.map[pickLang(lyricsState.map)];
    if (!skipPersist) localStorage.setItem('nest_lyrics_lang', lang);
    lyricsState.lang = lang;
    const parsed = parseLrc(text);
    const hasTimes = parsed.some(l => l.t != null);
    // If LRC-like, keep; else treat as plain lines
    if (hasTimes) {
      lyricsState.lines = parsed.filter(l => l.text);
      lyricsState.synced = true;
    } else {
      const plain = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      lyricsState.lines = plain.map(t => ({ t: null, text: t }));
      lyricsState.synced = false;
    }
    updateLyricsLangPicker(lyricsState.map, lang);
    renderLyricsBox();
  }
  function syncLyricsToTime(t) {
    if (!lyricsState.synced || !lyricsState.lines.length) return;
    let idx = -1;
    for (let i = 0; i < lyricsState.lines.length; i++) {
      const lt = lyricsState.lines[i].t;
      if (lt != null && lt <= t) idx = i;
      else if (lt != null && lt > t) break;
    }
    if (idx === lyricsState.activeIdx || idx < 0) return;
    lyricsState.activeIdx = idx;
    const box = document.getElementById('lyricsContentBox');
    if (!box) return;
    box.querySelectorAll('.lyric-line').forEach((el, i) => {
      if (i === idx) {
        el.classList.add('text-brand', 'font-extrabold', 'text-sm', 'scale-105');
        el.classList.remove('text-gray-300');
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      } else {
        el.classList.remove('text-brand', 'font-extrabold', 'text-sm', 'scale-105');
        el.classList.add('text-gray-300');
      }
    });
  }
  function bindLyricsClock() {
    const audio = document.getElementById('globalAudio');
    if (!audio || audio._nestLyricsBound) return;
    audio._nestLyricsBound = true;
    audio.addEventListener('timeupdate', () => {
      try { syncLyricsToTime(audio.currentTime || 0); } catch (_) {}
    });
  }

  // ---------- Rating stars (filled) ----------
  function paintRatingStars(userStars) {
    const n = Math.max(0, Math.min(5, parseInt(userStars, 10) || 0));
    const wrap = document.getElementById('fpRatingStars');
    if (!wrap) return;
    const buttons = wrap.querySelectorAll('[data-star]');
    buttons.forEach((btn) => {
      const v = parseInt(btn.getAttribute('data-star'), 10);
      const icon = btn.querySelector('[data-lucide], svg, i');
      const filled = v <= n;
      btn.classList.toggle('text-brand', filled);
      btn.classList.toggle('text-white', !filled);
      btn.setAttribute('aria-pressed', filled ? 'true' : 'false');
      // Rebuild lucide icon with fill when selected
      btn.innerHTML = `<i data-lucide="star" class="w-4 h-4 ${filled ? 'text-brand fill-brand' : 'text-white'}"></i>`;
    });
    if (global.lucide) global.lucide.createIcons();
    try {
      const id = global.currentPlayingTrack && global.currentPlayingTrack.id;
      if (id) localStorage.setItem('nest_rating_' + id, String(n));
    } catch (_) {}
  }
  function restoreUserRating(trackId) {
    try {
      const v = parseInt(localStorage.getItem('nest_rating_' + trackId) || '0', 10);
      if (v > 0) paintRatingStars(v);
      else paintRatingStars(0);
    } catch (_) { paintRatingStars(0); }
  }

  // ---------- Overflow menu ----------
  function togglePlayerOverflow(force) {
    const menu = document.getElementById('playerOverflowMenu');
    if (!menu) return;
    if (force === true) menu.classList.remove('hidden');
    else if (force === false) menu.classList.add('hidden');
    else menu.classList.toggle('hidden');
    if (global.lucide) global.lucide.createIcons();
  }
  function closePlayerOverflow() {
    const menu = document.getElementById('playerOverflowMenu');
    if (menu) menu.classList.add('hidden');
  }

  // ---------- Install-or-open / smart banner ----------
  function isAndroidUA() {
    return /Android/i.test(navigator.userAgent || '');
  }
  function isStandaloneOrNative() {
    if (isNative()) return true;
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  }
  function trackIdFromLocation() {
    try {
      const u = new URL(location.href);
      return u.searchParams.get('track') || u.searchParams.get('song') || u.searchParams.get('id');
    } catch (_) { return null; }
  }
  function buildIntentUrl(trackId) {
    const path = trackId ? ('/?track=' + encodeURIComponent(trackId)) : '/';
    const fallback = APK_LATEST_URL;
    // Android intent URL with package + browser fallback to APK
    return 'intent://nest-music.vercel.app' + path +
      '#Intent;scheme=https;package=' + PKG +
      ';S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end';
  }
  function buildCustomScheme(trackId) {
    return trackId ? ('nestmusic://track/' + encodeURIComponent(trackId)) : 'nestmusic://open';
  }
  function tryOpenApp(trackId) {
    const custom = buildCustomScheme(trackId);
    const intent = buildIntentUrl(trackId);
    // Prefer intent URL on Android browsers
    if (isAndroidUA()) {
      location.href = intent;
      return;
    }
    location.href = custom;
  }
  function startApkDownload() {
    toast('Starting Nest Music APK download…');
    const a = document.createElement('a');
    a.href = APK_LATEST_URL;
    a.rel = 'noopener';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  function ensureSmartBanner() {
    if (isStandaloneOrNative()) return;
    if (document.getElementById('nestSmartBanner')) return;
    const trackId = trackIdFromLocation();
    const bar = document.createElement('div');
    bar.id = 'nestSmartBanner';
    bar.className = 'fixed bottom-0 inset-x-0 z-[55] p-3 pointer-events-none';
    bar.innerHTML = `
      <div class="pointer-events-auto max-w-md mx-auto glass-modal border border-white/10 rounded-2xl p-3 flex items-center gap-3 shadow-2xl">
        <img src="icons/icon-192.png" alt="" class="w-11 h-11 rounded-xl object-cover bg-black flex-shrink-0" onerror="this.style.display='none'" />
        <div class="flex-1 min-w-0">
          <div class="text-xs font-black text-white truncate">Nest Music</div>
          <div class="text-[10px] text-gray-400 truncate">${trackId ? 'Open this track in the app' : 'Install the Android app for offline listening'}</div>
        </div>
        <button type="button" id="smartBannerOpenBtn" class="px-3 py-2 rounded-xl bg-brand text-black text-[11px] font-extrabold whitespace-nowrap">Open app</button>
        <button type="button" id="smartBannerDlBtn" class="px-3 py-2 rounded-xl glass text-white text-[11px] font-bold whitespace-nowrap">Get APK</button>
        <button type="button" id="smartBannerCloseBtn" class="p-1.5 text-gray-400 hover:text-white" aria-label="Dismiss"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>`;
    document.body.appendChild(bar);
    document.getElementById('smartBannerOpenBtn').onclick = () => tryOpenApp(trackId);
    document.getElementById('smartBannerDlBtn').onclick = () => startApkDownload();
    document.getElementById('smartBannerCloseBtn').onclick = () => {
      bar.remove();
      try { sessionStorage.setItem('nest_banner_dismissed', '1'); } catch (_) {}
    };
    if (global.lucide) global.lucide.createIcons();
  }
  function bootSmartBanner() {
    try {
      if (sessionStorage.getItem('nest_banner_dismissed') === '1') return;
    } catch (_) {}
    // Show on Android web, or whenever a track deep link is present on web
    const trackId = trackIdFromLocation();
    if (isStandaloneOrNative()) return;
    if (isAndroidUA() || trackId) {
      setTimeout(ensureSmartBanner, 800);
    }
  }

  // Hook playTrack lyrics + rating restore
  function hookPlayback() {
    bindLyricsClock();
    const orig = global.playTrack;
    if (typeof orig === 'function' && !orig._nestMediaWrapped) {
      const wrapped = function (trackId) {
        const r = orig.apply(this, arguments);
        try {
          const track = (global.allSongs || []).find(t => t.id === trackId) || global.currentPlayingTrack;
          if (track) {
            loadLyricsForTrack(track);
            restoreUserRating(track.id);
          }
        } catch (e) { console.warn('lyrics/rating hook', e); }
        return r;
      };
      wrapped._nestMediaWrapped = true;
      global.playTrack = wrapped;
    }
  }

  // Public API
  const api = {
    saveTrackToDevice,
    downloadCurrentToDevice,
    loadLyricsForTrack,
    setLyricsLang,
    syncLyricsToTime,
    paintRatingStars,
    restoreUserRating,
    togglePlayerOverflow,
    closePlayerOverflow,
    tryOpenApp,
    startApkDownload,
    buildIntentUrl,
    APK_LATEST_URL,
    ATTR_COMMENT,
    bootSmartBanner,
    hookPlayback
  };
  global.NestMedia = api;
  global.downloadCurrentToDevice = downloadCurrentToDevice;
  global.downloadCurrentOffline = downloadCurrentToDevice; // primary Download action = real device save
  global.handleDownloadCurrent = downloadCurrentToDevice;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      try { hookPlayback(); } catch (_) {}
      try { bootSmartBanner(); } catch (_) {}
      try { bindLyricsClock(); } catch (_) {}
    }, 100);
    document.addEventListener('click', (ev) => {
      const menu = document.getElementById('playerOverflowMenu');
      if (!menu || menu.classList.contains('hidden')) return;
      const t = ev.target;
      if (menu.contains(t)) return;
      if (t && t.closest && t.closest('[onclick*="togglePlayerOverflow"]')) return;
      menu.classList.add('hidden');
    });
  });
})(window);
