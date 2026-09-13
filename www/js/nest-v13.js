/**
 * Nest Music v1.3.0 — Themes, OTA updater, Downloads/Offline, Queue,
 * Settings, Social lite, Smart recommendations, Search history, Album upload helpers.
 * Loaded after the main inline app script hooks; extends window globals.
 */
(function (global) {
  'use strict';

  const APP_VERSION = '1.3.0';
  const APP_BUILD = 130;
  const APP_MIN_NATIVE = '1.3.0';
  const VERSION_URLS = [
    '/app-version.json',
    '/api/app-version',
    'https://nest-music.vercel.app/app-version.json'
  ];
  const THEMES = [
    { id: 'midnight', label: 'Midnight', desc: 'Classic green night' },
    { id: 'aurora', label: 'Aurora', desc: 'Violet & mint glow' },
    { id: 'ocean', label: 'Ocean', desc: 'Cyan deep sea' },
    { id: 'sunset', label: 'Sunset', desc: 'Warm orange rose' },
    { id: 'space', label: 'Space', desc: 'Indigo & magenta' }
  ];

  global.APP_VERSION = APP_VERSION;
  global.APP_BUILD = APP_BUILD;
  global.NEST_THEMES = THEMES;

  // ---------- Utilities ----------
  function toast(msg) {
    if (typeof global.showToast === 'function') global.showToast(msg);
    else console.log('[Nest]', msg);
  }
  function isNative() {
    return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
  }
  function parseVer(v) {
    return String(v || '0').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  }
  function cmpVer(a, b) {
    const A = parseVer(a), B = parseVer(b);
    for (let i = 0; i < 3; i++) {
      if ((A[i] || 0) > (B[i] || 0)) return 1;
      if ((A[i] || 0) < (B[i] || 0)) return -1;
    }
    return 0;
  }
  function settingsGet(key, fallback) {
    try {
      const raw = localStorage.getItem('nest_settings');
      const s = raw ? JSON.parse(raw) : {};
      return s[key] !== undefined ? s[key] : fallback;
    } catch (_) { return fallback; }
  }
  function settingsSet(key, val) {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('nest_settings') || '{}'); } catch (_) {}
    s[key] = val;
    localStorage.setItem('nest_settings', JSON.stringify(s));
    syncPrefsToFirebase(s);
  }
  async function syncPrefsToFirebase(s) {
    try {
      if (global.currentUser && global.db) {
        await global.db.ref('users/' + global.currentUser.uid + '/prefs').update({
          theme: s.theme || 'midnight',
          audioQuality: s.audioQuality || 'high',
          dataSaver: !!s.dataSaver,
          wifiOnlyDownloads: s.wifiOnlyDownloads !== false,
          crossfade: !!s.crossfade,
          language: 'en',
          updatedAt: Date.now()
        });
      }
    } catch (e) { console.warn('prefs sync', e); }
  }

  // ---------- Themes ----------
  function applyTheme(themeId, persist) {
    const id = THEMES.some(t => t.id === themeId) ? themeId : 'midnight';
    document.documentElement.setAttribute('data-theme', id);
    document.body && document.body.setAttribute('data-theme', id);
    const meta = document.querySelector('meta[name="theme-color"]');
    const colors = { midnight: '#1DB954', aurora: '#a78bfa', ocean: '#22d3ee', sunset: '#fb923c', space: '#818cf8' };
    if (meta) meta.setAttribute('content', colors[id] || '#1DB954');
    if (persist !== false) {
      localStorage.setItem('nest_theme', id);
      settingsSet('theme', id);
    }
    document.querySelectorAll('.theme-swatch').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-theme-id') === id);
    });
    const label = document.getElementById('settingsThemeLabel');
    if (label) label.textContent = (THEMES.find(t => t.id === id) || {}).label || id;
  }
  function initTheme() {
    const saved = localStorage.getItem('nest_theme') || settingsGet('theme', 'midnight');
    applyTheme(saved, false);
    if (!localStorage.getItem('nest_theme_picked')) {
      setTimeout(() => {
        const sheet = document.getElementById('themeFirstRunSheet');
        if (sheet) sheet.classList.remove('hidden');
      }, 2200);
    }
  }
  function pickTheme(id) {
    applyTheme(id, true);
    localStorage.setItem('nest_theme_picked', '1');
    const sheet = document.getElementById('themeFirstRunSheet');
    if (sheet) sheet.classList.add('hidden');
    toast('Theme: ' + ((THEMES.find(t => t.id === id) || {}).label || id));
  }
  function skipThemePicker() {
    localStorage.setItem('nest_theme_picked', '1');
    const sheet = document.getElementById('themeFirstRunSheet');
    if (sheet) sheet.classList.add('hidden');
  }

  // ---------- OTA Updates ----------
  let lastRemoteVersion = null;

  async function fetchRemoteVersion() {
    for (const url of VERSION_URLS) {
      try {
        const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) continue;
        const j = await res.json();
        if (j && j.version) return j;
      } catch (_) {}
    }
    return null;
  }

  function isNewer(remote) {
    if (!remote) return false;
    if (cmpVer(remote.version, APP_VERSION) > 0) return true;
    if (cmpVer(remote.version, APP_VERSION) === 0 && (remote.build || 0) > APP_BUILD) return true;
    return false;
  }

  async function checkForUpdates(opts) {
    opts = opts || {};
    const remote = await fetchRemoteVersion();
    lastRemoteVersion = remote;
    const el = document.getElementById('settingsAppVersion');
    if (el) el.textContent = 'v' + APP_VERSION + ' (build ' + APP_BUILD + ')';
    const remoteEl = document.getElementById('settingsRemoteVersion');
    if (remoteEl) remoteEl.textContent = remote ? ('Remote: v' + remote.version) : 'Remote: unreachable';

    if (!remote) {
      if (opts.manual) toast('Could not reach update server');
      return null;
    }
    if (isNewer(remote)) {
      showUpdateSheet(remote);
      return remote;
    }
    if (opts.manual) toast('You are on the latest version (v' + APP_VERSION + ')');
    return null;
  }

  function showUpdateSheet(remote) {
    const sheet = document.getElementById('otaUpdateSheet');
    if (!sheet) return;
    document.getElementById('otaVersionText').textContent = 'v' + remote.version + (remote.build ? ' · build ' + remote.build : '');
    document.getElementById('otaNotesText').textContent = remote.notes || 'Bug fixes and improvements.';
    document.getElementById('otaProgressWrap').classList.add('hidden');
    document.getElementById('otaActions').classList.remove('hidden');
    document.getElementById('otaStatusText').textContent = 'Update available';
    sheet.classList.remove('hidden');
  }

  function hideUpdateSheet() {
    const sheet = document.getElementById('otaUpdateSheet');
    if (sheet) sheet.classList.add('hidden');
  }

  async function startOtaDownload() {
    const remote = lastRemoteVersion || await fetchRemoteVersion();
    if (!remote || !remote.bundleUrl) {
      toast('No bundle URL in version manifest');
      return;
    }
    document.getElementById('otaActions').classList.add('hidden');
    document.getElementById('otaProgressWrap').classList.remove('hidden');
    document.getElementById('otaStatusText').textContent = 'Downloading update…';
    const fill = document.getElementById('otaProgressFill');
    const pct = document.getElementById('otaPercentText');
    try {
      const res = await fetch(remote.bundleUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = Number(res.headers.get('content-length') || 0);
      const reader = res.body && res.body.getReader ? res.body.getReader() : null;
      let received = 0;
      const chunks = [];
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          const p = total ? Math.min(99, Math.round((received / total) * 100)) : Math.min(90, received / 50000);
          fill.style.width = p + '%';
          pct.textContent = Math.round(p) + '%';
        }
      } else {
        const buf = await res.arrayBuffer();
        chunks.push(new Uint8Array(buf));
        fill.style.width = '100%';
        pct.textContent = '100%';
      }
      const blob = new Blob(chunks);
      document.getElementById('otaStatusText').textContent = 'Applying update…';
      await applyOtaBundle(blob, remote);
      fill.style.width = '100%';
      pct.textContent = '100%';
      document.getElementById('otaStatusText').textContent = 'Update applied — restarting…';
      toast('Updated to v' + remote.version);
      setTimeout(() => restartApp(), 900);
    } catch (e) {
      console.error(e);
      document.getElementById('otaStatusText').textContent = 'Update failed';
      document.getElementById('otaActions').classList.remove('hidden');
      toast('Update failed: ' + (e.message || 'network error'));
    }
  }

  async function applyOtaBundle(blob, remote) {
    // Store metadata + mark pending apply
    localStorage.setItem('nest_ota_pending', JSON.stringify({
      version: remote.version,
      build: remote.build,
      appliedAt: Date.now(),
      bundleUrl: remote.bundleUrl
    }));
    // Cache full site shell for web / Capacitor fallback: open remote shell
    try {
      if ('caches' in global) {
        const cache = await caches.open('nest-ota-' + remote.version);
        await cache.put('/app-version.json', new Response(JSON.stringify(remote), { headers: { 'Content-Type': 'application/json' } }));
        // Prefer hosting static mirror under /bundles/vX.Y.Z/
        const base = remote.staticBase || ('/bundles/v' + remote.version + '/');
        try {
          const idx = await fetch(base + 'index.html', { cache: 'no-store' });
          if (idx.ok) await cache.put('/', idx.clone());
        } catch (_) {}
      }
    } catch (e) { console.warn('cache ota', e); }

    // Native: write zip + extract key files via Filesystem if available
    if (isNative()) {
      try {
        const Filesystem = global.Capacitor.Plugins.Filesystem;
        const Preferences = global.Capacitor.Plugins.Preferences;
        if (Filesystem) {
          const b64 = await blobToBase64(blob);
          await Filesystem.writeFile({
            path: 'ota/www-' + remote.version + '.zip',
            data: b64.split(',').pop(),
            directory: 'DATA',
            recursive: true
          });
          // Soft-apply: also try to fetch and store index.html from staticBase
          const base = remote.staticBase || ('https://nest-music.vercel.app/bundles/v' + remote.version + '/');
          const idxRes = await fetch(base + 'index.html', { cache: 'no-store' });
          if (idxRes.ok) {
            const html = await idxRes.text();
            await Filesystem.writeFile({
              path: 'ota/active/index.html',
              data: btoa(unescape(encodeURIComponent(html))),
              directory: 'DATA',
              recursive: true
            });
          }
        }
        if (Preferences) {
          await Preferences.set({ key: 'nest_ota_version', value: remote.version });
          await Preferences.set({ key: 'nest_ota_build', value: String(remote.build || 0) });
          await Preferences.set({ key: 'nest_ota_static', value: remote.staticBase || ('https://nest-music.vercel.app/bundles/v' + remote.version + '/') });
        }
      } catch (e) {
        console.warn('native ota write', e);
      }
    }
    // Web soft-apply: reload from static bundle if available
    localStorage.setItem('nest_ota_active_version', remote.version);
    localStorage.setItem('nest_ota_static_base', remote.staticBase || ('/bundles/v' + remote.version + '/'));
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function restartApp() {
    try {
      const App = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
      // Prefer navigating to static bundle mirror (works for web + remote-capable WebView)
      const base = localStorage.getItem('nest_ota_static_base');
      if (base && !isNative()) {
        location.href = base + 'index.html?ota=' + Date.now();
        return;
      }
      if (isNative()) {
        // Reload WebView; next launch reads Preferences and can soft-load remote shell
        const Preferences = global.Capacitor.Plugins.Preferences;
        if (Preferences) {
          const { value } = await Preferences.get({ key: 'nest_ota_static' });
          if (value) {
            // Capacitor allowNavigation must include host — fall back to reload
            console.log('OTA static base', value);
          }
        }
        location.reload();
        return;
      }
    } catch (_) {}
    location.reload();
  }

  // ---------- Queue ----------
  let playQueue = [];
  try { playQueue = JSON.parse(localStorage.getItem('nest_queue') || '[]'); } catch (_) {}

  function persistQueue() {
    localStorage.setItem('nest_queue', JSON.stringify(playQueue));
    const n = document.getElementById('queueCountBadge');
    if (n) n.textContent = String(playQueue.length);
  }
  function addToQueue(trackId) {
    if (!trackId) return;
    if (!playQueue.includes(trackId)) playQueue.push(trackId);
    persistQueue();
    toast('Added to queue');
    renderQueueModal();
  }
  function addCurrentToQueue() {
    if (global.currentPlayingTrack) addToQueue(global.currentPlayingTrack.id);
  }
  function clearQueue() {
    playQueue = [];
    persistQueue();
    renderQueueModal();
    toast('Queue cleared');
  }
  function removeFromQueue(trackId) {
    playQueue = playQueue.filter(id => id !== trackId);
    persistQueue();
    renderQueueModal();
  }
  function renderQueueModal() {
    const box = document.getElementById('queueList');
    if (!box) return;
    const songs = global.allSongs || [];
    box.innerHTML = playQueue.map((id, i) => {
      const t = songs.find(s => s.id === id) || { title: id, artist: '' };
      return `<div class="glass p-2.5 rounded-xl flex items-center justify-between gap-2">
        <button onclick="playTrack('${id}')" class="flex-1 text-left truncate">
          <span class="text-[10px] text-brand font-mono mr-1">${i + 1}</span>
          <span class="text-xs font-bold text-white">${escapeSafe(t.title)}</span>
          <span class="block text-[10px] text-gray-400">${escapeSafe(t.artist || '')}</span>
        </button>
        <button onclick="NestV13.removeFromQueue('${id}')" class="p-1.5 text-gray-400 hover:text-red-400"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>`;
    }).join('') || '<p class="text-center text-xs text-gray-500 py-6">Queue is empty. Add tracks from the player.</p>';
    if (global.lucide) global.lucide.createIcons();
  }
  function openQueueModal() {
    renderQueueModal();
    if (typeof global.openModal === 'function') global.openModal('queueModal');
  }
  function playNextFromQueue() {
    if (!playQueue.length) {
      if (typeof global.playNextTrack === 'function') global.playNextTrack();
      return;
    }
    const next = playQueue.shift();
    persistQueue();
    if (typeof global.playTrack === 'function') global.playTrack(next);
  }

  // Wrap ended handler enhancement via flag
  function installQueueHook() {
    const audio = document.getElementById('globalAudio');
    if (!audio || audio._nestQueueHook) return;
    audio._nestQueueHook = true;
    audio.addEventListener('ended', () => {
      if (playQueue.length && !global.isLooping) {
        // Slight delay so original ended handler can run; we also provide playNextFromQueue override
      }
    });
  }

  // ---------- Volume ----------
  function setVolume(val) {
    const v = Math.max(0, Math.min(1, Number(val)));
    const audio = document.getElementById('globalAudio');
    if (audio) audio.volume = v;
    settingsSet('volume', v);
    const label = document.getElementById('volumeLabel');
    if (label) label.textContent = Math.round(v * 100) + '%';
  }
  function initVolume() {
    const v = settingsGet('volume', 1);
    setVolume(v);
    const slider = document.getElementById('volumeSlider');
    if (slider) slider.value = v;
  }

  // ---------- Offline Downloads (IndexedDB) ----------
  const IDB_NAME = 'nest_music_offline';
  const IDB_STORE = 'tracks';
  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbPut(track) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(track);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbGet(id) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbAll() {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDelete(id) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  let downloadProgress = {};

  async function downloadSongOffline(trackId) {
    const track = (global.allSongs || []).find(t => t.id === trackId) || global.currentPlayingTrack;
    if (!track || track.id !== trackId && trackId) {
      const t2 = (global.allSongs || []).find(t => t.id === trackId);
      if (!t2) return toast('Track not found');
      return downloadSongOfflineTrack(t2);
    }
    return downloadSongOfflineTrack(track);
  }
  async function downloadSongOfflineTrack(track) {
    if (!track || !track.audioBase64) return toast('No audio data for offline save');
    const wifiOnly = settingsGet('wifiOnlyDownloads', true);
    if (wifiOnly && navigator.connection && navigator.connection.type === 'cellular') {
      return toast('Wi‑Fi only downloads enabled. Connect to Wi‑Fi or disable in Settings.');
    }
    downloadProgress[track.id] = 10;
    renderDownloadsList();
    try {
      downloadProgress[track.id] = 50;
      await idbPut({
        id: track.id,
        title: track.title,
        artist: track.artist,
        coverBase64: track.coverBase64,
        audioBase64: track.audioBase64,
        category: track.category,
        uploaderUid: track.uploaderUid,
        savedAt: Date.now()
      });
      downloadProgress[track.id] = 100;
      // bump server count if signed in
      try {
        if (global.currentUser && global.db) {
          const newCount = (track.downloadsCount || 0) + 1;
          await global.db.ref('tracks/' + track.id).update({ downloadsCount: newCount });
        }
      } catch (_) {}
      toast('Saved offline: ' + track.title);
      renderDownloadsList();
      setTimeout(() => { delete downloadProgress[track.id]; renderDownloadsList(); }, 800);
    } catch (e) {
      toast('Offline save failed (storage full?)');
      console.error(e);
    }
  }
  async function downloadCurrentOffline() {
    if (!global.currentPlayingTrack) return toast('Nothing playing');
    if (!global.currentUser) {
      toast('Sign in to save offline downloads');
      if (typeof global.switchView === 'function') global.switchView('profileView');
      return;
    }
    await downloadSongOfflineTrack(global.currentPlayingTrack);
  }
  async function playOfflineTrack(id) {
    const t = await idbGet(id);
    if (!t) return toast('Offline track missing');
    // Inject into allSongs temporarily if needed
    const exists = (global.allSongs || []).find(s => s.id === id);
    if (!exists) {
      global.allSongs = global.allSongs || [];
      global.allSongs.push(t);
    } else if (!exists.audioBase64) {
      exists.audioBase64 = t.audioBase64;
      exists.coverBase64 = t.coverBase64;
    }
    if (typeof global.playTrack === 'function') global.playTrack(id);
  }
  async function removeOfflineTrack(id) {
    await idbDelete(id);
    toast('Removed from offline library');
    renderDownloadsList();
  }
  async function renderDownloadsList() {
    const box = document.getElementById('downloadsList');
    if (!box) return;
    const items = await idbAll();
    box.innerHTML = items.map(t => `
      <div class="glass p-2.5 rounded-2xl flex items-center justify-between gap-2">
        <button onclick="NestV13.playOfflineTrack('${t.id}')" class="flex items-center space-x-3 flex-1 min-w-0 text-left">
          <img src="${t.coverBase64 || ''}" class="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-neutral-900" />
          <div class="truncate">
            <h5 class="text-xs font-bold text-white truncate">${escapeSafe(t.title)}</h5>
            <p class="text-[10px] text-brand font-mono truncate">${escapeSafe(t.artist || 'Offline')}</p>
          </div>
        </button>
        <button onclick="NestV13.removeOfflineTrack('${t.id}')" class="p-2 text-gray-400 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
    `).join('') || '<p class="text-center text-xs text-gray-500 py-6">No offline downloads yet. Use Save Offline in the player.</p>';
    if (global.lucide) global.lucide.createIcons();
    const badge = document.getElementById('drawerDownloadsCount');
    if (badge) badge.textContent = String(items.length);
  }

  // ---------- Recently played / Library / Discover ----------
  function pushRecentlyPlayed(trackId) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('nest_recent') || '[]'); } catch (_) {}
    list = [trackId].concat(list.filter(id => id !== trackId)).slice(0, 40);
    localStorage.setItem('nest_recent', JSON.stringify(list));
  }
  function getRecentlyPlayed() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('nest_recent') || '[]'); } catch (_) {}
    return list.map(id => (global.allSongs || []).find(t => t.id === id)).filter(Boolean);
  }
  function renderLibraryView() {
    const box = document.getElementById('librarySections');
    if (!box) return;
    const liked = (global.likedTrackIds || []).length;
    const pls = (global.userPlaylists || []).length;
    const recent = getRecentlyPlayed().slice(0, 8);
    box.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <button onclick="switchView('likedView')" class="glass p-4 rounded-2xl text-left hover:border-brand/40">
          <i data-lucide="heart" class="w-5 h-5 text-red-400 mb-2"></i>
          <div class="text-xs font-black text-white">Liked Songs</div>
          <div class="text-[10px] text-gray-400">${liked} tracks</div>
        </button>
        <button onclick="switchView('playlistView')" class="glass p-4 rounded-2xl text-left hover:border-brand/40">
          <i data-lucide="list-music" class="w-5 h-5 text-brand mb-2"></i>
          <div class="text-xs font-black text-white">Playlists</div>
          <div class="text-[10px] text-gray-400">${pls} lists</div>
        </button>
        <button onclick="switchView('downloadsView')" class="glass p-4 rounded-2xl text-left hover:border-brand/40">
          <i data-lucide="download" class="w-5 h-5 text-brand mb-2"></i>
          <div class="text-xs font-black text-white">Downloads</div>
          <div class="text-[10px] text-gray-400">Offline library</div>
        </button>
        <button onclick="NestV13.startSmartRadio()" class="glass p-4 rounded-2xl text-left hover:border-brand/40">
          <i data-lucide="radio" class="w-5 h-5 text-brand mb-2"></i>
          <div class="text-xs font-black text-white">Smart Radio</div>
          <div class="text-[10px] text-gray-400">Genre heuristics</div>
        </button>
      </div>
      <div class="pt-2">
        <h4 class="text-xs font-black text-white mb-2 flex items-center gap-2"><i data-lucide="history" class="w-4 h-4"></i> Recently Played</h4>
        <div class="space-y-2">${recent.map(t => `
          <div onclick="playTrack('${t.id}')" class="glass p-2 rounded-xl flex items-center gap-3 cursor-pointer">
            <img src="${t.coverBase64 || ''}" class="w-9 h-9 rounded-lg object-cover" />
            <div class="truncate"><div class="text-xs font-bold text-white truncate">${escapeSafe(t.title)}</div>
            <div class="text-[10px] text-brand truncate">${escapeSafe(t.artist || '')}</div></div>
          </div>`).join('') || '<p class="text-xs text-gray-500">Play something to build history.</p>'}
        </div>
      </div>`;
    if (global.lucide) global.lucide.createIcons();
  }
  function renderDiscoverExtras() {
    const trendingBox = document.getElementById('trendingList');
    const newBox = document.getElementById('newReleasesList');
    if (!trendingBox && !newBox) return;
    const publicTracks = (global.allSongs || []).filter(t => t.status === 'approved' || !t.status || t.status === 'public');
    const trending = [...publicTracks].sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0)).slice(0, 6);
    const newest = [...publicTracks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    const row = (list) => list.map(t => `
      <div onclick="playTrack('${t.id}')" class="min-w-[140px] glass p-2 rounded-2xl cursor-pointer">
        <img src="${t.coverBase64 || ''}" class="w-full aspect-square object-cover rounded-xl mb-1.5 bg-neutral-900" />
        <div class="text-[11px] font-bold text-white truncate">${escapeSafe(t.title)}</div>
        <div class="text-[10px] text-brand truncate">${escapeSafe(t.artist || '')}</div>
      </div>`).join('') || '<p class="text-xs text-gray-500 px-2">No tracks yet.</p>';
    if (trendingBox) trendingBox.innerHTML = row(trending);
    if (newBox) newBox.innerHTML = row(newest);
  }

  // ---------- Smart recommendations (heuristic, not GPT) ----------
  function smartRecommend(seedTrack) {
    const all = (global.allSongs || []).filter(t => t.status === 'approved' || !t.status || t.status === 'public');
    if (!all.length) return [];
    const seed = seedTrack || global.currentPlayingTrack || getRecentlyPlayed()[0];
    const liked = new Set(global.likedTrackIds || []);
    const scores = all.map(t => {
      let s = 0;
      if (seed) {
        if (t.category && seed.category && t.category === seed.category) s += 5;
        if (t.artist && seed.artist && t.artist === seed.artist) s += 4;
        if (t.uploaderUid && seed.uploaderUid && t.uploaderUid === seed.uploaderUid) s += 3;
        if (t.id === seed.id) s -= 100;
      }
      if (liked.has(t.id)) s += 2;
      s += (parseFloat(t.rating) || 5) * 0.5;
      s += Math.min(3, (t.downloadsCount || 0) / 10);
      return { t, s };
    });
    return scores.sort((a, b) => b.s - a.s).slice(0, 12).map(x => x.t);
  }
  function startSmartRadio(mood) {
    let pool = smartRecommend();
    if (mood) {
      const map = { chill: ['bgm', 'music'], energy: ['music', 'sfx'], focus: ['bgm'] };
      const cats = map[mood] || null;
      if (cats) {
        const filtered = (global.allSongs || []).filter(t => cats.includes(t.category));
        if (filtered.length) pool = filtered;
      }
    }
    if (!pool.length) return toast('Not enough tracks for Smart Radio');
    playQueue = pool.slice(1).map(t => t.id);
    persistQueue();
    toast('Smart Radio · heuristic mix (not AI/GPT)');
    if (typeof global.playTrack === 'function') global.playTrack(pool[0].id);
  }
  function renderSmartRecs() {
    const box = document.getElementById('smartRecGrid');
    if (!box) return;
    const recs = smartRecommend().slice(0, 4);
    box.innerHTML = recs.map(t => `
      <div onclick="playTrack('${t.id}')" class="glass p-2 rounded-2xl cursor-pointer">
        <img src="${t.coverBase64 || ''}" class="w-full aspect-square object-cover rounded-xl mb-1" />
        <div class="text-[11px] font-bold truncate text-white">${escapeSafe(t.title)}</div>
      </div>`).join('') || '<p class="col-span-2 text-xs text-gray-500">Play tracks to personalize Smart picks.</p>';
  }

  // ---------- Search history + filters ----------
  function pushSearchHistory(q) {
    if (!q || q.length < 2) return;
    let h = [];
    try { h = JSON.parse(localStorage.getItem('nest_search_history') || '[]'); } catch (_) {}
    h = [q].concat(h.filter(x => x !== q)).slice(0, 12);
    localStorage.setItem('nest_search_history', JSON.stringify(h));
  }
  function enhancedSearch(q, filterType) {
    pushSearchHistory(q);
    const term = (q || '').toLowerCase().trim();
    const users = global.usersMap || {};
    let filtered = global.allSongs || [];
    if (term) {
      filtered = filtered.filter(t => {
        const uploader = users[t.uploaderUid] || {};
        const blob = [t.title, t.artist, t.creator, t.category, uploader.username, uploader.name].join(' ').toLowerCase();
        return blob.includes(term);
      });
    }
    if (filterType === 'artist') {
      // keep as-is; already matched artist fields
    } else if (filterType === 'album') {
      filtered = filtered.filter(t => (t.album || t.albumTitle || '').toLowerCase().includes(term) || (t.category || '') === 'music');
    } else if (filterType === 'playlist') {
      // search playlist names
      const pls = (global.userPlaylists || []).filter(p => (p.name || '').toLowerCase().includes(term));
      toast(pls.length ? `Found ${pls.length} playlist(s)` : 'No playlists matched');
    } else if (filterType === 'genre') {
      filtered = filtered.filter(t => (t.category || '').toLowerCase().includes(term) || (t.genre || '').toLowerCase().includes(term));
    }
    if (typeof global.renderFeeds === 'function') global.renderFeeds(filtered);
    if (typeof global.switchView === 'function') global.switchView('homeView');
  }
  function renderSearchHistory() {
    const box = document.getElementById('searchHistoryBox');
    if (!box) return;
    let h = [];
    try { h = JSON.parse(localStorage.getItem('nest_search_history') || '[]'); } catch (_) {}
    box.innerHTML = h.map(q => `<button onclick="document.getElementById('searchInput').value='${escapeSafe(q)}';NestV13.enhancedSearch('${escapeSafe(q)}')" class="px-2.5 py-1 rounded-full glass text-[10px] text-white hover:border-brand/40">${escapeSafe(q)}</button>`).join('');
  }

  // ---------- Social lite: follow, comments, public playlists ----------
  async function followUser(uid) {
    if (!global.currentUser) return toast('Sign in to follow');
    if (!uid || uid === global.currentUser.uid) return;
    await global.db.ref('follows/' + global.currentUser.uid + '/' + uid).set({
      at: firebase.database.ServerValue.TIMESTAMP
    });
    await global.db.ref('followers/' + uid + '/' + global.currentUser.uid).set(true);
    toast('Following creator');
  }
  async function unfollowUser(uid) {
    if (!global.currentUser) return;
    await global.db.ref('follows/' + global.currentUser.uid + '/' + uid).remove();
    await global.db.ref('followers/' + uid + '/' + global.currentUser.uid).remove();
    toast('Unfollowed');
  }
  async function followCurrentArtist() {
    if (!global.currentPlayingTrack) return;
    const uid = global.currentPlayingTrack.uploaderUid;
    if (!uid || uid === 'guest') return toast('No artist account linked');
    await followUser(uid);
  }
  async function loadComments(trackId) {
    const box = document.getElementById('commentsList');
    if (!box || !global.db) return;
    const snap = await global.db.ref('comments/' + trackId).limitToLast(40).once('value');
    const val = snap.val() || {};
    const rows = Object.keys(val).map(k => ({ id: k, ...val[k] })).sort((a, b) => (a.at || 0) - (b.at || 0));
    box.innerHTML = rows.map(c => `
      <div class="glass p-2.5 rounded-xl">
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-brand font-mono">@${escapeSafe(c.username || 'user')}</span>
          <span class="text-[9px] text-gray-500">${c.at ? new Date(c.at).toLocaleString() : ''}</span>
        </div>
        <p class="text-xs text-white mt-1">${escapeSafe(c.text || '')}</p>
      </div>`).join('') || '<p class="text-xs text-gray-500 text-center py-4">No comments yet. Be the first.</p>';
  }
  async function openComments() {
    if (!global.currentPlayingTrack) return toast('Play a track first');
    await loadComments(global.currentPlayingTrack.id);
    if (typeof global.openModal === 'function') global.openModal('commentsModal');
  }
  async function submitComment(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!global.currentUser) return toast('Sign in to comment');
    if (!global.currentPlayingTrack) return;
    const input = document.getElementById('commentInput');
    const text = (input && input.value || '').trim();
    if (!text) return;
    await global.db.ref('comments/' + global.currentPlayingTrack.id).push({
      uid: global.currentUser.uid,
      username: (global.currentUserData && global.currentUserData.username) || global.currentUser.email.split('@')[0],
      text: text.slice(0, 400),
      at: firebase.database.ServerValue.TIMESTAMP
    });
    if (input) input.value = '';
    await loadComments(global.currentPlayingTrack.id);
    toast('Comment posted');
  }
  async function sharePlaylist(plId) {
    const pl = (global.userPlaylists || []).find(p => p.id === plId);
    if (!pl) return;
    // Mark public in Firebase if logged in
    if (global.currentUser && global.db) {
      await global.db.ref('public_playlists/' + pl.id).set({
        ...pl,
        ownerUid: global.currentUser.uid,
        ownerName: (global.currentUserData && global.currentUserData.username) || 'user',
        isPublic: true,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    }
    const url = 'https://nest-music.vercel.app/?playlist=' + encodeURIComponent(pl.id);
    try {
      await navigator.clipboard.writeText(url);
      toast('Public playlist link copied');
    } catch (_) { toast(url); }
  }

  // ---------- Album upload (multi-track) ----------
  let albumDraft = { title: '', tracks: [] };
  function resetAlbumDraft() {
    albumDraft = { title: '', tracks: [] };
    const box = document.getElementById('albumTracksPreview');
    if (box) box.innerHTML = '';
  }
  function addAlbumTrackFiles(fileList) {
    const files = Array.from(fileList || []);
    files.forEach(f => albumDraft.tracks.push({ file: f, title: f.name.replace(/\.[^/.]+$/, '') }));
    const box = document.getElementById('albumTracksPreview');
    if (box) {
      box.innerHTML = albumDraft.tracks.map((t, i) => `<div class="text-[11px] text-white glass p-2 rounded-lg">${i + 1}. ${escapeSafe(t.title)}</div>`).join('');
    }
  }
  async function submitAlbumUpload(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!global.currentUser) return toast('Sign in to upload an album');
    const title = (document.getElementById('albumTitle') || {}).value || '';
    const artist = (document.getElementById('albumArtist') || {}).value || '';
    const coverFile = (document.getElementById('albumCoverInput') || {}).files?.[0];
    if (!title || !coverFile || !albumDraft.tracks.length) return toast('Album title, cover, and at least one track required');
    const coverBase64 = await fileToB64(coverFile);
    const albumId = 'alb_' + Date.now();
    toast('Uploading album (' + albumDraft.tracks.length + ' tracks)…');
    let i = 0;
    for (const tr of albumDraft.tracks) {
      i++;
      const audioBase64 = await fileToB64(tr.file);
      const dur = await getDur(tr.file);
      const newRef = global.db.ref('tracks').push();
      await newRef.set({
        id: newRef.key,
        title: tr.title,
        artist,
        creator: artist,
        category: 'music',
        isExplicit: 'false',
        audioBase64,
        coverBase64,
        albumId,
        albumTitle: title,
        trackNumber: i,
        durationFormatted: formatT(dur),
        rating: '5.0',
        downloadsCount: 0,
        status: 'approved',
        isPinned: false,
        uploaderUid: global.currentUser.uid,
        uploaderUsername: (global.currentUserData && global.currentUserData.username) || 'user',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
    }
    await global.db.ref('albums/' + albumId).set({
      id: albumId,
      title,
      artist,
      coverBase64,
      trackCount: albumDraft.tracks.length,
      uploaderUid: global.currentUser.uid,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    resetAlbumDraft();
    if (typeof global.closeModal === 'function') global.closeModal('uploadModal');
    toast('Album published: ' + title);
  }
  function fileToB64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  function getDur(file) {
    return new Promise(resolve => {
      const a = new Audio();
      a.src = URL.createObjectURL(file);
      a.onloadedmetadata = () => resolve(a.duration || 0);
    });
  }
  function formatT(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function switchUploadTab(tab) {
    document.getElementById('singleUploadPane')?.classList.toggle('hidden', tab !== 'single');
    document.getElementById('albumUploadPane')?.classList.toggle('hidden', tab !== 'album');
    document.getElementById('uploadTabSingle')?.classList.toggle('bg-brand', tab === 'single');
    document.getElementById('uploadTabSingle')?.classList.toggle('text-black', tab === 'single');
    document.getElementById('uploadTabAlbum')?.classList.toggle('bg-brand', tab === 'album');
    document.getElementById('uploadTabAlbum')?.classList.toggle('text-black', tab === 'album');
  }

  // ---------- Settings helpers ----------
  function applySettingsUI() {
    const q = settingsGet('audioQuality', 'high');
    const ds = settingsGet('dataSaver', false);
    const wifi = settingsGet('wifiOnlyDownloads', true);
    const xf = settingsGet('crossfade', false);
    const el = (id, v) => { const n = document.getElementById(id); if (n) n.checked = !!v; };
    el('settingDataSaver', ds);
    el('settingWifiOnly', wifi);
    el('settingCrossfade', xf);
    const sel = document.getElementById('settingAudioQuality');
    if (sel) sel.value = q;
    const ver = document.getElementById('settingsAppVersion');
    if (ver) ver.textContent = 'v' + APP_VERSION + ' (build ' + APP_BUILD + ')';
  }
  function onSettingChange(key, value) {
    settingsSet(key, value);
    if (key === 'dataSaver' && value) {
      settingsSet('audioQuality', 'low');
      toast('Data Saver on — lower quality preference saved');
    } else {
      toast('Setting saved');
    }
    applySettingsUI();
  }

  // ---------- Artist profile ----------
  async function openArtistProfile(uid) {
    if (!uid) return;
    const user = (global.usersMap || {})[uid] || {};
    const tracks = (global.allSongs || []).filter(t => t.uploaderUid === uid);
    const box = document.getElementById('artistProfileBody');
    if (box) {
      box.innerHTML = `
        <div class="text-center space-y-2">
          <h3 class="text-base font-black text-white">${escapeSafe(user.name || user.username || 'Creator')}</h3>
          <p class="text-xs text-brand font-mono">@${escapeSafe(user.username || 'creator')}</p>
          ${user.isVerified ? '<span class="text-brand text-xs font-bold">Verified</span>' : ''}
          <p class="text-[11px] text-gray-400">${tracks.length} tracks</p>
          <button onclick="NestV13.followUser('${uid}')" class="px-4 py-2 rounded-xl bg-brand text-black text-xs font-extrabold">Follow</button>
        </div>
        <div class="space-y-2 pt-3 max-h-64 overflow-y-auto">${tracks.map(t => `
          <div onclick="playTrack('${t.id}');closeModal('artistProfileModal')" class="glass p-2 rounded-xl flex gap-2 cursor-pointer">
            <img src="${t.coverBase64 || ''}" class="w-9 h-9 rounded-lg object-cover" />
            <div class="truncate text-xs font-bold text-white">${escapeSafe(t.title)}</div>
          </div>`).join('') || '<p class="text-xs text-gray-500 text-center">No public tracks.</p>'}
        </div>`;
    }
    if (typeof global.openModal === 'function') global.openModal('artistProfileModal');
    if (global.lucide) global.lucide.createIcons();
  }
  function openCurrentArtistProfile() {
    if (!global.currentPlayingTrack) return;
    openArtistProfile(global.currentPlayingTrack.uploaderUid);
  }

  function escapeSafe(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Patch playTrack for recent + offline fallback ----------
  function installPlayTrackPatch() {
    const orig = global.playTrack;
    if (!orig || orig._nestPatched) return;
    function patched(trackId) {
      pushRecentlyPlayed(trackId);
      const track = (global.allSongs || []).find(t => t.id === trackId);
      if (track && !track.audioBase64) {
        idbGet(trackId).then(off => {
          if (off && off.audioBase64) {
            track.audioBase64 = off.audioBase64;
            if (!track.coverBase64) track.coverBase64 = off.coverBase64;
          }
          orig(trackId);
          setTimeout(() => { renderSmartRecs(); renderLibraryView(); }, 100);
        });
        return;
      }
      orig(trackId);
      setTimeout(() => { renderSmartRecs(); renderDiscoverExtras(); renderLibraryView(); }, 100);
    }
    patched._nestPatched = true;
    global.playTrack = patched;
  }

  function installNextPrevButtons() {
    // Enhance transport: ensure next/prev exist
    const shuffleBtn = document.getElementById('fpShuffleBtn');
    if (!shuffleBtn || document.getElementById('fpPrevBtn')) return;
    // seekStep buttons already exist; add dedicated next/prev near play if missing — skip DOM surgery if fragile
  }

  // ---------- Crossfade (simple Web Audio gain ramp) ----------
  function maybeCrossfadeTo(nextId) {
    if (!settingsGet('crossfade', false)) {
      if (typeof global.playTrack === 'function') global.playTrack(nextId);
      return;
    }
    const audio = document.getElementById('globalAudio');
    if (!audio) return global.playTrack(nextId);
    const startVol = audio.volume;
    let step = 0;
    const fade = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / 8));
      if (step >= 8) {
        clearInterval(fade);
        global.playTrack(nextId);
        audio.volume = startVol;
      }
    }, 60);
  }

  // ---------- Boot ----------
  function boot() {
    initTheme();
    initVolume();
    applySettingsUI();
    installQueueHook();
    installPlayTrackPatch();
    persistQueue();
    renderSearchHistory();
    renderDownloadsList();
    setTimeout(() => {
      renderDiscoverExtras();
      renderSmartRecs();
      renderLibraryView();
      checkForUpdates({ manual: false });
    }, 1800);
    // Refresh discover when songs load
    const origListen = global.listenForData;
    // version labels
    document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = 'v' + APP_VERSION; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 50));
  } else {
    setTimeout(boot, 50);
  }

  global.NestV13 = {
    APP_VERSION, APP_BUILD, THEMES,
    applyTheme, pickTheme, skipThemePicker,
    checkForUpdates, startOtaDownload, hideUpdateSheet, restartApp,
    addToQueue, addCurrentToQueue, clearQueue, removeFromQueue, openQueueModal, playNextFromQueue, renderQueueModal,
    setVolume,
    downloadCurrentOffline, downloadSongOffline, playOfflineTrack, removeOfflineTrack, renderDownloadsList,
    renderLibraryView, renderDiscoverExtras, startSmartRadio, smartRecommend, renderSmartRecs,
    enhancedSearch, renderSearchHistory, pushSearchHistory,
    followUser, unfollowUser, followCurrentArtist, openComments, submitComment, sharePlaylist,
    switchUploadTab, addAlbumTrackFiles, submitAlbumUpload, resetAlbumDraft,
    onSettingChange, applySettingsUI, settingsGet, settingsSet,
    openArtistProfile, openCurrentArtistProfile, maybeCrossfadeTo
  };

  // Global aliases used by HTML onclick
  global.pickTheme = pickTheme;
  global.skipThemePicker = skipThemePicker;
  global.checkForUpdates = (manual) => checkForUpdates({ manual: manual !== false });
  global.startOtaDownload = startOtaDownload;
  global.hideUpdateSheet = hideUpdateSheet;
  global.openQueueModal = openQueueModal;
  global.clearQueue = clearQueue;
  global.addCurrentToQueue = addCurrentToQueue;
  global.downloadCurrentOffline = downloadCurrentOffline;
  global.followCurrentArtist = followCurrentArtist;
  global.openComments = openComments;
  global.submitComment = submitComment;
  global.switchUploadTab = switchUploadTab;
  global.submitAlbumUpload = submitAlbumUpload;
  global.addAlbumTrackFiles = addAlbumTrackFiles;
  global.openCurrentArtistProfile = openCurrentArtistProfile;
  global.startSmartRadio = startSmartRadio;

})(window);
