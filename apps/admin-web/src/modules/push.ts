import { db, escapeHtml, serverTimestamp, type Track } from '../lib/firebase';
import { refreshIcons } from '../lib/ui';
import { getAdminTracks, setTracksListener } from './tracks';

export function mountPush() {
  const root = document.getElementById('pushNotifTab')!;
  root.innerHTML = `
    <div class="glass p-6 rounded-3xl space-y-4 text-xs max-w-lg">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 class="text-base font-bold flex items-center gap-2 text-white">
          <i data-lucide="bell-ring" class="w-5 h-5 text-brand"></i> Send Song Push Notification
        </h3>
        <span class="text-[10px] text-brand font-mono uppercase font-bold">Native FCM Broadcast</span>
      </div>
      <p class="text-gray-300">Select any uploaded song and queue a real FCM push to all registered Android devices. Delivery uses the Nest Music FCM sender API + device_tokens.</p>
      <form id="pushForm" class="space-y-3">
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Select Song *</label>
          <select id="notifTrackSelect" required class="w-full bg-neutral-900 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none">
            <option value="" class="bg-neutral-900 text-white">-- Select Track --</option>
          </select>
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Notification Title *</label>
          <input type="text" id="notifTitle" required placeholder="🎵 New Song on Nest Music" class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none" />
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Notification Message *</label>
          <textarea id="notifBody" rows="3" required placeholder="Listen to this new song now on Nest Music." class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none"></textarea>
        </div>
        <button type="submit" id="sendNotifBtn" class="w-full py-3.5 bg-brand text-black font-extrabold rounded-xl active:scale-95 transition shadow-lg flex items-center justify-center gap-2">
          <i data-lucide="send" class="w-4 h-4 text-black"></i> SEND NOTIFICATION
        </button>
        <p id="pushStatus" class="text-[10px] text-gray-400"></p>
      </form>
    </div>`;

  const sel = document.getElementById('notifTrackSelect') as HTMLSelectElement;
  sel.addEventListener('change', () => {
    const track = getAdminTracks().find(t => t.id === sel.value);
    if (track) {
      (document.getElementById('notifTitle') as HTMLInputElement).value = '🎵 New Song on Nest Music';
      (document.getElementById('notifBody') as HTMLTextAreaElement).value =
        `Listen to "${track.title}" by ${track.artist || '@nestmusic'} on Nest Music.`;
    }
  });

  setTracksListener((tracks) => populate(tracks));

  document.getElementById('pushForm')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const songId = sel.value;
    const title = (document.getElementById('notifTitle') as HTMLInputElement).value.trim();
    const body = (document.getElementById('notifBody') as HTMLTextAreaElement).value.trim();
    const sendBtn = document.getElementById('sendNotifBtn') as HTMLButtonElement;
    const status = document.getElementById('pushStatus')!;
    if (!songId || !title || !body) {
      alert('Please select a song and fill title and message.');
      return;
    }
    const selectedSong = getAdminTracks().find(t => t.id === songId);
    sendBtn.disabled = true;
    sendBtn.innerText = 'Dispatching Push Notification...';
    status.textContent = '';
    try {
      const ref = await db.ref('notification_requests').push({
        type: 'song',
        songId: String(songId),
        songTitle: String(selectedSong?.title || 'New Song'),
        artist: String(selectedSong?.artist || selectedSong?.creator || '@nestmusic'),
        uploader: String(selectedSong?.uploaderUsername || selectedSong?.artist || '@nestmusic'),
        title: String(title),
        body: String(body),
        requestedAt: serverTimestamp()
      });
      // Best-effort kick the Vercel FCM sender (works once FIREBASE_SERVICE_ACCOUNT is set)
      try {
        const res = await fetch('/api/fcm-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: ref.key })
        });
        const j = await res.json().catch(() => ({}));
        status.textContent = res.ok
          ? `Queued + sender: ${j.sent ?? 0} delivered, ${j.failed ?? 0} failed.`
          : `Queued in RTDB. Sender note: ${j.error || res.statusText}. Add FIREBASE_SERVICE_ACCOUNT if needed.`;
      } catch {
        status.textContent = 'Queued in notification_requests. FCM sender will process when credentials are configured.';
      }
      alert(`✅ Push notification queued for "${selectedSong?.title || songId}"!`);
      sel.value = '';
      (document.getElementById('notifTitle') as HTMLInputElement).value = '';
      (document.getElementById('notifBody') as HTMLTextAreaElement).value = '';
    } catch (err: any) {
      alert('Error sending push notification: ' + (err?.message || err));
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4 text-black"></i> SEND NOTIFICATION`;
      refreshIcons();
    }
  });

  refreshIcons();
}

function populate(tracks: Track[]) {
  const sel = document.getElementById('notifTrackSelect') as HTMLSelectElement | null;
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="" class="bg-neutral-900 text-white">-- Select Track --</option>' +
    tracks.map(t => `<option value="${t.id}" class="bg-neutral-900 text-white">${escapeHtml(t.title)} — ${escapeHtml(t.artist)}</option>`).join('');
  if (cur) sel.value = cur;
}
