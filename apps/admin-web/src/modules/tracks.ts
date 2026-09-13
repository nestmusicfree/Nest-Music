import { db, escapeHtml, serverTimestamp, type Track } from '../lib/firebase';
import { sendFcmByRequestId, formatFcmResult } from '../lib/fcm';
import { refreshIcons, switchTab } from '../lib/ui';

let adminTracks: Track[] = [];
let onTracksChanged: ((tracks: Track[]) => void) | null = null;

export function getAdminTracks() { return adminTracks; }

export function setTracksListener(cb: (tracks: Track[]) => void) {
  onTracksChanged = cb;
}

export function mountTracks() {
  const root = document.getElementById('tracksAdminTab')!;
  root.innerHTML = `
    <div class="flex items-center justify-between">
      <h3 class="text-base font-bold flex items-center gap-2 text-white">
        <i data-lucide="music" class="w-4 h-4 text-white"></i> Tracks Moderation, Pinning & Downloads
      </h3>
      <input type="text" id="trackSearch" placeholder="Search track or artist..." class="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-brand" />
    </div>
    <div id="adminTracksList" class="space-y-3">
      <div class="text-center py-10 text-gray-500 text-xs">Loading tracks...</div>
    </div>`;

  document.getElementById('trackSearch')!.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase().trim();
    const f = adminTracks.filter(t =>
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.artist && t.artist.toLowerCase().includes(q))
    );
    render(f);
  });

  (window as any).togglePinTrack = async (id: string, pinState: boolean) => {
    await db.ref(`tracks/${id}`).update({ isPinned: pinState });
  };
  (window as any).updateStatus = async (id: string, status: string) => {
    await db.ref(`tracks/${id}`).update({ status });
    if (status === 'approved') {
      const t = adminTracks.find(x => x.id === id);
      if (t) {
        const ref = await db.ref('notification_requests').push({
          type: 'song',
          songId: String(id),
          songTitle: String(t.title || 'New Song'),
          artist: String(t.artist || t.creator || '@nestmusic'),
          uploader: String(t.uploaderUsername || t.artist || '@nestmusic'),
          title: 'New Song on Nest Music',
          body: `Listen to "${t.title}" by ${t.artist || '@nestmusic'} on Nest Music.`,
          status: 'pending',
          requestedAt: serverTimestamp(),
          source: 'approve'
        });
        const result = await sendFcmByRequestId(String(ref.key));
        alert(result.ok
          ? `Track is live. ${formatFcmResult(result)}`
          : `Track is live. ${formatFcmResult(result)}`);
      }
    }
  };
  (window as any).deleteTrack = async (id: string) => {
    if (confirm('Delete this track permanently from Nest Music?')) {
      await db.ref(`tracks/${id}`).remove();
    }
  };
  (window as any).selectTrackForPush = (trackId: string) => {
    switchTab('pushNotifTab');
    const sel = document.getElementById('notifTrackSelect') as HTMLSelectElement | null;
    if (sel) {
      sel.value = trackId;
      sel.dispatchEvent(new Event('change'));
    }
  };

  db.ref('tracks').on('value', (snap: any) => {
    const data = snap.val();
    adminTracks = [];
    if (data) Object.keys(data).forEach(k => adminTracks.push({ id: k, ...data[k] }));
    const count = document.getElementById('countTracks');
    if (count) count.innerText = String(adminTracks.length);
    render(adminTracks);
    onTracksChanged?.(adminTracks);
  });
}

function render(tracks: Track[]) {
  const c = document.getElementById('adminTracksList');
  if (!c) return;
  c.innerHTML = tracks.map(t => `
    <div class="glass p-3.5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs ${t.isPinned ? 'border border-brand/60 shadow-lg shadow-brand/10' : ''}">
      <div class="flex items-center space-x-3 truncate">
        <img src="${t.coverBase64 || 'https://i.postimg.cc/sg287hck/thinkogic-sharpen-image-209299.png'}" class="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
        <div class="truncate">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-bold text-white text-sm">${escapeHtml(t.title)}</h4>
            ${t.isPinned ? '<span class="text-[9px] px-2 py-0.5 rounded font-black uppercase bg-brand text-black">📌 PINNED ON TOP</span>' : ''}
            <span class="text-[9px] px-2 py-0.5 rounded font-bold uppercase ${t.status === 'hold' ? 'bg-amber-500/20 text-amber-400' : 'bg-brand/20 text-brand'}">${t.status || 'approved'}</span>
            <span class="text-[9px] px-2 py-0.5 rounded font-bold bg-white/10 text-brand font-mono">Downloads: ${t.downloadsCount || 0}</span>
            ${t.isExplicit === 'true' || t.isExplicit === true ? '<span class="text-[8px] bg-red-600 font-bold px-1 rounded">18+</span>' : ''}
          </div>
          <p class="text-gray-400 text-[11px]">Artist: ${escapeHtml(t.artist)} | Prod: ${escapeHtml(t.creator)} | Cat: ${escapeHtml(t.category)}</p>
        </div>
      </div>
      <div class="flex items-center space-x-2 self-end md:self-center flex-wrap gap-1">
        <button onclick="togglePinTrack('${t.id}', ${t.isPinned ? 'false' : 'true'})" class="px-3 py-1.5 rounded-xl font-bold transition ${t.isPinned ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-white/10 text-white hover:bg-white/20'}">${t.isPinned ? 'Unpin' : '📌 Pin to Dashboard'}</button>
        <button onclick="selectTrackForPush('${t.id}')" class="px-3 py-1.5 bg-brand/20 border border-brand/40 text-brand font-bold rounded-xl hover:bg-brand hover:text-black transition">🔔 Send Push</button>
        ${t.status === 'hold'
          ? `<button onclick="updateStatus('${t.id}', 'approved')" class="px-3 py-1.5 bg-brand text-black font-bold rounded-xl hover:bg-brand-light transition">Make Live</button>`
          : `<button onclick="updateStatus('${t.id}', 'hold')" class="px-3 py-1.5 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition">Hold</button>`}
        <button onclick="deleteTrack('${t.id}')" class="p-2 bg-red-600/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-600 hover:text-white transition"><i data-lucide="trash-2" class="w-4 h-4 text-white"></i></button>
      </div>
    </div>`).join('') || '<div class="text-center py-6 text-gray-500 text-xs">No tracks found.</div>';
  refreshIcons();
}
