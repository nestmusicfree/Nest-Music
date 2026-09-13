/**
 * Nest Music v1.4.0 — Spotify-like UI controller.
 * Wraps existing player / library / search / FCM without replacing them.
 * English only. No emoji in UI copy.
 */
(function (global) {
  'use strict';

  const LOGO = 'https://i.postimg.cc/sg287hck/thinkogic-sharpen-image-209299.png';
  const BROWSE = [
    { id: 'music', label: 'Music', color: '#DC148C', cat: 'music' },
    { id: 'live', label: 'Live', color: '#7358FF', cat: 'radio' },
    { id: 'made', label: 'Made For You', color: '#1E3264', cat: 'made' },
    { id: 'new', label: 'New Releases', color: '#E8115B', cat: 'new' },
    { id: 'charts', label: 'Charts', color: '#8D67AB', cat: 'charts' },
    { id: 'mood', label: 'Mood', color: '#148A08', cat: 'mood' },
    { id: 'bgm', label: 'BGM', color: '#477D95', cat: 'bgm' },
    { id: 'sfx', label: 'SFX', color: '#E61E32', cat: 'sfx' },
    { id: 'liked', label: 'Liked Songs', color: '#503750', cat: 'liked' },
    { id: 'radio', label: 'Radio', color: '#BA5D07', cat: 'radio' }
  ];

  let libFilter = 'all';
  let libGrid = false;
  let libQuery = '';
  let libSort = 'recents';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function coverOf(t) {
    if (!t) return LOGO;
    const c = t.coverUrl || t.coverBase64 || '';
    if (c && (c.indexOf('data:') === 0 || /^https?:\/\//i.test(c))) return c;
    return LOGO;
  }
  function publicTracks() {
    return (global.allSongs || []).filter(t => t.status === 'approved' || !t.status || t.status === 'public');
  }
  function recentTracks() {
    if (global.NestV13 && NestV13.getRecentlyPlayed) return NestV13.getRecentlyPlayed();
    try {
      const list = JSON.parse(localStorage.getItem('nest_recent') || '[]');
      return list.map(id => (global.allSongs || []).find(t => t.id === id)).filter(Boolean);
    } catch (_) { return []; }
  }
  function artistsFromTracks(list) {
    const map = {};
    (list || []).forEach(t => {
      const name = t.artist || t.creator || 'Artist';
      if (!map[name]) map[name] = { name, cover: coverOf(t), tracks: [], uid: t.uploaderUid };
      map[name].tracks.push(t);
    });
    return Object.values(map);
  }
  function refreshIcons() {
    try { if (global.lucide) lucide.createIcons(); } catch (_) {}
  }
  function avatarLetter() {
    const u = global.currentUserData || {};
    const n = u.name || u.username || (global.currentUser && global.currentUser.email) || 'N';
    return String(n).charAt(0).toUpperCase();
  }
  function paintAvatars() {
    document.querySelectorAll('[data-nm-avatar]').forEach(el => {
      el.textContent = avatarLetter();
    });
  }

  /* ---------- Tabs ---------- */
  function viewToTab(viewId) {
    if (viewId === 'searchView') return 'search';
    if (viewId === 'libraryView' || viewId === 'playlistView' || viewId === 'likedView' || viewId === 'downloadsView') return 'library';
    if (viewId === 'createView') return 'create';
    return 'home';
  }
  function setActiveTab(tab) {
    document.querySelectorAll('.nm-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
  }
  function goTab(tab) {
    if (tab === 'create') {
      openCreateSheet();
      setActiveTab('create');
      return;
    }
    closeCreateSheet();
    const map = { home: 'homeView', search: 'searchView', library: 'libraryView' };
    if (typeof global.switchView === 'function') global.switchView(map[tab] || 'homeView');
  }
  function onSwitch(viewId) {
    setActiveTab(viewToTab(viewId));
    if (viewId === 'libraryView') renderLibrary();
    if (viewId === 'searchView') renderSearchBrowse();
    if (viewId === 'homeView') renderHomeExtras();
    paintAvatars();
    refreshIcons();
  }

  function installSwitchViewPatch() {
    const orig = global.switchView;
    if (!orig || orig._nmUi) return;
    function patched(viewId) {
      if (viewId === 'createView') {
        openCreateSheet();
        setActiveTab('create');
        return;
      }
      const el = document.getElementById(viewId);
      if (!el) return;
      orig(viewId);
      onSwitch(viewId);
    }
    patched._nmUi = true;
    global.switchView = patched;
  }

  /* ---------- Home extras ---------- */
  function renderHomeExtras() {
    const tracks = publicTracks();
    const recent = recentTracks();
    const likedIds = global.likedTrackIds || [];
    const playlists = global.userPlaylists || [];

    const tiles = document.getElementById('homeQuickTiles');
    if (tiles) {
      const items = [];
      items.push({
        kind: 'liked',
        title: 'Liked Songs',
        onclick: "switchView('likedView')"
      });
      playlists.slice(0, 3).forEach(pl => {
        const first = (pl.trackIds || []).map(id => tracks.find(t => t.id === id)).find(Boolean);
        items.push({
          kind: 'pl',
          title: pl.name || 'Playlist',
          cover: first ? coverOf(first) : LOGO,
          onclick: "openPlaylist('" + pl.id + "')"
        });
      });
      artistsFromTracks(recent).slice(0, 2).forEach(a => {
        items.push({
          kind: 'artist',
          title: a.name,
          cover: a.cover,
          onclick: a.tracks[0] ? "playTrack('" + a.tracks[0].id + "')" : ''
        });
      });
      recent.slice(0, 4).forEach(t => {
        if (items.length >= 6) return;
        items.push({
          kind: 'track',
          title: t.title || 'Track',
          cover: coverOf(t),
          onclick: "playTrack('" + t.id + "')"
        });
      });
      tiles.innerHTML = items.slice(0, 6).map(it => {
        const art = it.kind === 'liked'
          ? '<div class="nm-quick-cover nm-liked-grad"><i data-lucide="heart" class="w-5 h-5"></i></div>'
          : '<img class="nm-quick-cover" src="' + esc(it.cover || LOGO) + '" alt="" />';
        return '<button type="button" class="nm-quick-tile" onclick="' + it.onclick + '">' + art + '<span>' + esc(it.title) + '</span></button>';
      }).join('');
    }

    const mixes = document.getElementById('homeMixesRow');
    if (mixes) {
      const rec = [...tracks].sort((a, b) => (parseFloat(b.rating) || 5) - (parseFloat(a.rating) || 5)).slice(0, 8);
      const colors = ['#8D67AB', '#BA5D07', '#148A08', '#E61E32', '#1E3264', '#DC148C'];
      mixes.innerHTML = rec.map((t, i) =>
        '<button type="button" class="nm-mix-card" onclick="playTrack(\'' + t.id + '\')">' +
        '<img src="' + esc(coverOf(t)) + '" alt="" style="box-shadow:0 0 0 4px ' + colors[i % colors.length] + '22" />' +
        '<div class="t">' + esc(t.title) + '</div>' +
        '<div class="s">Mix · ' + esc(t.artist || 'Nest Music') + '</div></button>'
      ).join('') || '<p class="text-xs text-gray-500 px-2">Play tracks to build your mixes.</p>';
    }

    const stations = document.getElementById('homeStationsRow');
    if (stations) {
      const arts = artistsFromTracks(tracks).slice(0, 8);
      stations.innerHTML = arts.map(a =>
        '<button type="button" class="nm-mix-card nm-station-card" onclick="' +
        (a.tracks[0] ? "playTrack('" + a.tracks[0].id + "');if(window.NestV13)NestV13.startSmartRadio();" : '') + '">' +
        '<img src="' + esc(a.cover) + '" alt="" />' +
        '<div class="t">' + esc(a.name) + ' Radio</div>' +
        '<div class="s">Artist station</div></button>'
      ).join('') || '';
    }

    paintAvatars();
    refreshIcons();
  }

  /* ---------- Search ---------- */
  function renderSearchBrowse() {
    const grid = document.getElementById('searchBrowseGrid');
    if (grid) {
      grid.innerHTML = BROWSE.map(b =>
        '<button type="button" class="nm-cat-tile" style="background:' + b.color + '" onclick="NestUI.browseCategory(\'' + b.cat + '\')">' +
        esc(b.label) + '</button>'
      ).join('');
    }
    const disc = document.getElementById('searchDiscoverRow');
    if (disc) {
      const rec = [...publicTracks()].sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0)).slice(0, 8);
      disc.innerHTML = rec.map(t =>
        '<button type="button" class="nm-mix-card" onclick="playTrack(\'' + t.id + '\')">' +
        '<img src="' + esc(coverOf(t)) + '" alt="" />' +
        '<div class="t">' + esc(t.title) + '</div>' +
        '<div class="s">' + esc(t.artist || '') + '</div></button>'
      ).join('');
    }
    if (global.NestV13 && NestV13.renderSearchHistory) NestV13.renderSearchHistory();
  }

  function browseCategory(cat) {
    const box = document.getElementById('searchResults');
    const browse = document.getElementById('searchBrowseWrap');
    if (cat === 'liked') {
      if (typeof global.switchView === 'function') global.switchView('likedView');
      return;
    }
    if (cat === 'radio') {
      if (global.NestV13) NestV13.startSmartRadio();
      return;
    }
    let list = publicTracks();
    if (cat === 'music' || cat === 'bgm' || cat === 'sfx') list = list.filter(t => t.category === cat);
    if (cat === 'new') list = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);
    if (cat === 'charts') list = [...list].sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0)).slice(0, 20);
    if (cat === 'made' || cat === 'mood') list = (global.NestV13 && NestV13.smartRecommend) ? NestV13.smartRecommend().slice(0, 16) : list.slice(0, 16);
    showResultList(list);
    if (browse) browse.classList.add('hidden');
    if (box) box.classList.remove('hidden');
  }

  function showResultList(list) {
    const box = document.getElementById('searchResults');
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = (list || []).map(t =>
      '<button type="button" class="nm-lib-row" onclick="playTrack(\'' + t.id + '\')">' +
      '<img class="nm-lib-art" src="' + esc(coverOf(t)) + '" alt="" />' +
      '<div class="min-w-0"><div class="t">' + esc(t.title) + '</div>' +
      '<div class="s">' + esc(t.artist || t.creator || 'Nest Music') + '</div></div></button>'
    ).join('') || '<p class="text-sm text-gray-400 px-4 py-6">No results.</p>';
  }

  function showSearchResults(q) {
    const term = String(q || '').toLowerCase().trim();
    const browse = document.getElementById('searchBrowseWrap');
    const box = document.getElementById('searchResults');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !term);
    if (!term) {
      if (browse) browse.classList.remove('hidden');
      if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
      return;
    }
    if (browse) browse.classList.add('hidden');
    const users = global.usersMap || {};
    const filtered = publicTracks().filter(t => {
      const up = users[t.uploaderUid] || {};
      return [t.title, t.artist, t.creator, t.category, up.username, up.name].join(' ').toLowerCase().includes(term);
    });
    showResultList(filtered);
    try { if (global.NestV13) { NestV13.pushSearchHistory(term); NestV13.renderSearchHistory(); } } catch (_) {}
  }

  function installSearchPatch() {
    const orig = global.handleSearch;
    global.handleSearch = function (q) {
      if (document.getElementById('searchView') && !document.getElementById('searchView').classList.contains('hidden')) {
        showSearchResults(q);
        return;
      }
      if (typeof global.switchView === 'function') global.switchView('searchView');
      const input = document.getElementById('searchInput');
      if (input && q != null) input.value = q;
      showSearchResults(q);
    };
    const origClear = global.clearSearch;
    global.clearSearch = function () {
      const input = document.getElementById('searchInput');
      if (input) input.value = '';
      showSearchResults('');
      if (typeof origClear === 'function') {
        try { origClear(); } catch (_) {}
      }
    };
    if (global.NestV13 && NestV13.enhancedSearch && !NestV13.enhancedSearch._nmUi) {
      const es = NestV13.enhancedSearch;
      NestV13.enhancedSearch = function (q, filterType) {
        if (typeof global.switchView === 'function') global.switchView('searchView');
        const input = document.getElementById('searchInput');
        if (input) input.value = q || '';
        showSearchResults(q);
      };
      NestV13.enhancedSearch._nmUi = true;
    }
  }

  /* ---------- Library ---------- */
  function renderLibrary() {
    const box = document.getElementById('libraryList');
    if (!box) return;
    const liked = (global.likedTrackIds || []).length;
    const playlists = global.userPlaylists || [];
    const arts = artistsFromTracks(publicTracks().filter(t => {
      const followed = false;
      return (global.likedTrackIds || []).length ? (global.likedTrackIds || []).some(() => true) : true;
    }).concat(recentTracks()));
    const rows = [];

    if (libFilter !== 'artists') {
      rows.push({
        kind: 'liked',
        title: 'Liked Songs',
        sub: 'Playlist · ' + liked + ' songs',
        onclick: "switchView('likedView')",
        round: false
      });
      playlists.forEach(pl => {
        const first = (pl.trackIds || []).map(id => (global.allSongs || []).find(t => t.id === id)).find(Boolean);
        if (libQuery && !(pl.name || '').toLowerCase().includes(libQuery)) return;
        rows.push({
          kind: 'pl',
          title: pl.name || 'Playlist',
          sub: 'Playlist · ' + ((pl.trackIds || []).length) + ' songs',
          cover: first ? coverOf(first) : LOGO,
          onclick: "openPlaylist('" + pl.id + "')",
          round: false
        });
      });
      rows.push({
        kind: 'dl',
        title: 'Downloads',
        sub: 'Playlist · Saved on this device',
        onclick: "switchView('downloadsView');if(window.NestV13)NestV13.renderDownloadsList();",
        cover: LOGO,
        round: false
      });
    }
    if (libFilter !== 'playlists') {
      artistsFromTracks(recentTracks().concat(publicTracks().slice(0, 20))).forEach(a => {
        if (libQuery && !a.name.toLowerCase().includes(libQuery)) return;
        rows.push({
          kind: 'artist',
          title: a.name,
          sub: 'Artist',
          cover: a.cover,
          onclick: a.tracks[0] ? "playTrack('" + a.tracks[0].id + "')" : '',
          round: true
        });
      });
    }

    if (libSort === 'alpha') {
      rows.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    }

    const addArtists = libFilter !== 'playlists'
      ? '<button type="button" class="nm-lib-row" onclick="NestUI.addArtists()">' +
        '<div class="nm-lib-art" style="display:flex;align-items:center;justify-content:center;background:#282828;font-size:28px;color:#b3b3b3">+</div>' +
        '<div class="t">Add artists</div></button>'
      : '';

    const html = rows.map(r => {
      const art = r.kind === 'liked'
        ? '<div class="nm-lib-art nm-liked-grad"><i data-lucide="heart" class="w-6 h-6"></i></div>'
        : '<img class="nm-lib-art' + (r.round ? ' round' : '') + '" src="' + esc(r.cover || LOGO) + '" alt="" />';
      return '<button type="button" class="nm-lib-row" onclick="' + r.onclick + '">' + art +
        '<div class="min-w-0"><div class="t">' + esc(r.title) + '</div>' +
        '<div class="s">' + esc(r.sub) + '</div></div></button>';
    }).join('') + addArtists;

    box.className = libGrid ? 'nm-lib-grid' : 'nm-lib-list';
    box.innerHTML = html || '<p class="text-sm text-gray-400 px-4 py-6">Your library is empty.</p>';
    refreshIcons();
  }

  function setLibFilter(f) {
    libFilter = f;
    document.querySelectorAll('[data-lib-chip]').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-lib-chip') === f);
    });
    renderLibrary();
  }
  function toggleLibGrid() {
    libGrid = !libGrid;
    const btn = document.getElementById('libGridToggle');
    if (btn) btn.setAttribute('aria-pressed', libGrid ? 'true' : 'false');
    renderLibrary();
    refreshIcons();
  }
  function toggleLibSearch() {
    const wrap = document.getElementById('libSearchWrap');
    if (!wrap) return;
    wrap.classList.toggle('hidden');
    const input = document.getElementById('libSearchInput');
    if (input && !wrap.classList.contains('hidden')) input.focus();
  }
  function onLibSearch(q) {
    libQuery = String(q || '').toLowerCase().trim();
    renderLibrary();
  }
  function cycleLibSort() {
    libSort = libSort === 'recents' ? 'alpha' : 'recents';
    const lab = document.getElementById('libSortLabel');
    if (lab) lab.textContent = libSort === 'recents' ? 'Recents' : 'Alphabetical';
    renderLibrary();
  }
  function addArtists() {
    if (typeof global.showToast === 'function') global.showToast('Follow artists from a track — open Now Playing, then Follow.');
  }

  /* ---------- Create sheet ---------- */
  function openCreateSheet() {
    const a = document.getElementById('createSheetBackdrop');
    const b = document.getElementById('createSheet');
    if (a) a.classList.remove('hidden');
    if (b) b.classList.remove('hidden');
    setActiveTab('create');
    refreshIcons();
  }
  function closeCreateSheet() {
    const a = document.getElementById('createSheetBackdrop');
    const b = document.getElementById('createSheet');
    if (a) a.classList.add('hidden');
    if (b) b.classList.add('hidden');
    const current = document.querySelector('.view-panel:not(.hidden)');
    setActiveTab(viewToTab(current ? current.id : 'homeView'));
  }
  function createFromSheet(kind) {
    closeCreateSheet();
    if (kind === 'playlist') {
      if (typeof global.createCustomPlaylist === 'function') global.createCustomPlaylist();
      if (typeof global.switchView === 'function') global.switchView('playlistView');
    } else if (kind === 'collab') {
      if (typeof global.createCustomPlaylist === 'function') {
        const name = prompt('Collaborative playlist name');
        if (name) {
          const orig = global.prompt;
          // createCustomPlaylist prompts internally — call then rename last
          global.createCustomPlaylist();
        }
      }
      if (typeof global.showToast === 'function') global.showToast('Collaborative playlist created on this device. Invite coming soon.');
      if (typeof global.switchView === 'function') global.switchView('playlistView');
    } else if (kind === 'blend') {
      if (global.NestV13) NestV13.startSmartRadio();
      if (typeof global.showToast === 'function') global.showToast('Blend started from your listening mix.');
    } else if (kind === 'folder') {
      const name = prompt('Folder name');
      if (!name) return;
      let folders = [];
      try { folders = JSON.parse(localStorage.getItem('nest_folders') || '[]'); } catch (_) {}
      folders.push({ id: 'f_' + Date.now(), name: name.trim(), at: Date.now() });
      localStorage.setItem('nest_folders', JSON.stringify(folders));
      if (typeof global.showToast === 'function') global.showToast('Folder "' + name + '" created.');
      if (typeof global.switchView === 'function') global.switchView('libraryView');
    } else if (kind === 'upload') {
      if (typeof global.openModal === 'function') global.openModal('uploadModal');
    }
  }

  /* ---------- Now Playing extras ---------- */
  function refreshNowPlaying() {
    const t = global.currentPlayingTrack;
    if (!t) return;
    const users = global.usersMap || {};
    const up = users[t.uploaderUid] || {};
    const artist = up.name || t.artist || t.creator || 'Nest Music';
    const handle = up.username ? '@' + up.username : artist;

    const ctx = document.getElementById('npContextLine');
    if (ctx) ctx.textContent = t.album || t.albumTitle || 'Nest Music';
    const ctxK = document.getElementById('npContextKind');
    if (ctxK) ctxK.textContent = 'Playing from';

    const stickyT = document.getElementById('npStickyTitle');
    const stickyA = document.getElementById('npStickyArtist');
    if (stickyT) stickyT.textContent = t.title || '';
    if (stickyA) stickyA.textContent = handle;

    const lyrCard = document.getElementById('npLyricsPreview');
    if (lyrCard) {
      const lyr = t.lyrics;
      let text = '';
      if (typeof lyr === 'string') text = lyr;
      else if (lyr && typeof lyr === 'object') text = lyr.en || Object.values(lyr)[0] || '';
      const snippet = String(text).replace(/\[\d+:\d+[^\]]*\]/g, '').trim().split('\n').filter(Boolean).slice(0, 3).join(' · ');
      document.getElementById('npLyricsSnippet').textContent = snippet || 'Lyrics for this track will appear here when available.';
    }

    const about = document.getElementById('npAboutArtist');
    if (about) {
      about.innerHTML =
        '<div class="flex items-center gap-3 mb-3">' +
        '<img src="' + esc(coverOf(t)) + '" class="w-14 h-14 rounded-full object-cover" alt="" />' +
        '<div><div class="text-xs text-gray-400 font-bold uppercase">About the artist</div>' +
        '<div class="text-base font-extrabold">' + esc(artist) + '</div></div></div>' +
        '<p class="text-sm text-gray-300 mb-3">Creator on Nest Music. Tap Follow to see more from this artist.</p>' +
        '<button type="button" class="nm-follow-pill" onclick="followCurrentArtist()">Follow</button>';
    }

    const explore = document.getElementById('npExploreRow');
    if (explore && global.NestV13 && NestV13.smartRecommend) {
      const recs = NestV13.smartRecommend(t).slice(0, 8);
      explore.innerHTML = recs.map(x =>
        '<button type="button" class="nm-mix-card" onclick="playTrack(\'' + x.id + '\')">' +
        '<img src="' + esc(coverOf(x)) + '" alt="" />' +
        '<div class="t">' + esc(x.title) + '</div>' +
        '<div class="s">' + esc(x.artist || '') + '</div></button>'
      ).join('');
    }

    const credits = document.getElementById('npCredits');
    if (credits) {
      credits.innerHTML =
        '<div class="flex items-center justify-between py-2">' +
        '<div><div class="text-xs text-gray-400">Performed by</div><div class="font-bold">' + esc(artist) + '</div></div>' +
        '<button type="button" class="nm-follow-pill" onclick="followCurrentArtist()">Follow</button></div>' +
        '<div class="flex items-center justify-between py-2">' +
        '<div><div class="text-xs text-gray-400">Written by</div><div class="font-bold">' + esc(t.creator || artist) + '</div></div>' +
        '<button type="button" class="nm-follow-pill" onclick="followCurrentArtist()">Follow</button></div>' +
        '<div class="flex items-center justify-between py-2">' +
        '<div><div class="text-xs text-gray-400">Source</div><div class="font-bold">Nest Music</div></div></div>';
    }

    const plus = document.getElementById('npPlusBtn');
    if (plus) {
      const liked = (global.likedTrackIds || []).indexOf(t.id) >= 0;
      plus.classList.toggle('liked', liked);
      plus.textContent = liked ? '✓' : '+';
    }
    refreshIcons();
  }

  function bindNowPlayingScroll() {
    const modal = document.getElementById('fullPlayerModal');
    const sticky = document.getElementById('npSticky');
    const title = document.getElementById('npTitleBlock');
    if (!modal || !sticky || !title) return;
    modal.addEventListener('scroll', function () {
      const r = title.getBoundingClientRect();
      const mr = modal.getBoundingClientRect();
      sticky.classList.toggle('show', r.bottom < mr.top + 8);
    }, { passive: true });
  }

  function installPlayPatch() {
    const orig = global.playTrack;
    if (!orig || orig._nmUiExtra) return;
    // nest-v13 already patches playTrack; chain after
    const current = global.playTrack;
    function extra(id) {
      current(id);
      setTimeout(function () {
        refreshNowPlaying();
        renderHomeExtras();
        renderLibrary();
      }, 120);
    }
    extra._nmUiExtra = true;
    extra._nestPatched = current._nestPatched;
    global.playTrack = extra;
  }

  function installPlayIcons() {
    const orig = global.updatePlayIcons;
    if (!orig || orig._nmUi) return;
    global.updatePlayIcons = function (isPlaying) {
      orig(isPlaying);
      const icon = isPlaying ? 'pause' : 'play';
      const fp = document.getElementById('fpPlayBtn');
      const mini = document.getElementById('miniPlayBtn');
      const sticky = document.getElementById('npStickyPlay');
      if (fp) {
        fp.classList.add('nm-play-white');
        fp.innerHTML = '<i data-lucide="' + icon + '" class="w-8 h-8 text-black fill-black"></i>';
      }
      if (mini) mini.innerHTML = '<i data-lucide="' + icon + '" class="w-5 h-5 text-black fill-black"></i>';
      if (sticky) sticky.innerHTML = '<i data-lucide="' + icon + '" class="w-4 h-4 text-black fill-black"></i>';
      refreshIcons();
    };
    global.updatePlayIcons._nmUi = true;
  }

  /* ---------- Announcements inbox ---------- */
  function listenAnnouncements() {
    if (!global.db) return;
    try {
      global.db.ref('announcements').limitToLast(20).on('value', function (snap) {
        const val = snap.val() || {};
        const rows = Object.keys(val).map(k => ({ id: k, ...val[k] }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderInbox(rows);
      });
    } catch (e) { console.warn('announcements', e); }
  }
  function renderInbox(rows) {
    const home = document.getElementById('homeInbox');
    const list = document.getElementById('inboxList');
    const latest = rows && rows[0];
    if (home) {
      if (latest) {
        home.classList.remove('hidden');
        home.innerHTML =
          '<button type="button" class="nm-lib-row" onclick="NestUI.openInbox()">' +
          (latest.imageUrl ? '<img class="nm-lib-art" src="' + esc(latest.imageUrl) + '" alt="" />' : '') +
          '<div class="min-w-0"><div class="t">' + esc(latest.title || 'Announcement') + '</div>' +
          '<div class="s">' + esc((latest.body || '').slice(0, 80)) + '</div></div></button>';
      } else {
        home.innerHTML = '';
        home.classList.add('hidden');
      }
    }
    if (list) {
      list.innerHTML = (rows || []).map(r =>
        '<div class="nm-inbox-row">' +
        (r.imageUrl ? '<img src="' + esc(r.imageUrl) + '" alt="" />' : '<div style="width:48px;height:48px;background:#282828;border-radius:6px"></div>') +
        '<div><div class="font-bold text-sm">' + esc(r.title || 'Nest Music') + '</div>' +
        '<div class="text-xs text-gray-400">' + esc(r.body || '') + '</div></div></div>'
      ).join('') || '<p class="text-sm text-gray-400 py-4">No announcements yet.</p>';
    }
  }
  function openInbox() {
    if (typeof global.openModal === 'function') global.openModal('inboxModal');
  }

  /* ---------- FCM image helper for uploads ---------- */
  function trackPublicImage(t) {
    if (!t) return LOGO;
    const c = t.coverUrl || t.imageUrl || '';
    if (/^https?:\/\//i.test(c)) return c;
    return LOGO;
  }
  function installFcmImagePatch() {
    const orig = global.queueAndSendFcm;
    if (!orig || orig._nmUi) return;
    global.queueAndSendFcm = function (payload) {
      payload = payload || {};
      if (!payload.imageUrl && !payload.image) {
        const t = (global.allSongs || []).find(s => s.id === payload.songId);
        payload.imageUrl = trackPublicImage(t);
      }
      return orig(payload);
    };
    global.queueAndSendFcm._nmUi = true;
  }

  function boot() {
    document.body.classList.add('nm-body');
    installSwitchViewPatch();
    installSearchPatch();
    installPlayPatch();
    installPlayIcons();
    installFcmImagePatch();
    bindNowPlayingScroll();
    listenAnnouncements();
    renderHomeExtras();
    renderSearchBrowse();
    renderLibrary();
    paintAvatars();
    setActiveTab('home');
    if (global.NestV13 && NestV13.renderLibraryView && !NestV13.renderLibraryView._nmUi) {
      NestV13.renderLibraryView = function () { renderLibrary(); };
      NestV13.renderLibraryView._nmUi = true;
    }
    refreshIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 80); });
  } else {
    setTimeout(boot, 80);
  }

  global.NestUI = {
    goTab, openCreateSheet, closeCreateSheet, createFromSheet,
    renderLibrary, renderHomeExtras, renderSearchBrowse,
    browseCategory, showSearchResults, setLibFilter, toggleLibGrid,
    toggleLibSearch, onLibSearch, cycleLibSort, addArtists,
    refreshNowPlaying, openInbox, coverOf, trackPublicImage
  };
  global.goTab = goTab;
})(window);
