import { db, escapeHtml, serverTimestamp, type Track } from '../lib/firebase';
import { sendFcmByRequestId, formatFcmResult } from '../lib/fcm';
import { refreshIcons } from '../lib/ui';
import { getAdminTracks, setTracksListener } from './tracks';

const LOGO = 'https://i.postimg.cc/sg287hck/thinkogic-sharpen-image-209299.png';

function trackImageUrl(t?: Track | null): string {
  if (!t) return LOGO;
  const c = (t as any).coverUrl || t.coverBase64 || '';
  if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  return LOGO;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function mountPush() {
  const root = document.getElementById('pushNotifTab')!;
  root.innerHTML = `
    <div class="grid md:grid-cols-2 gap-4">
    <div class="glass p-6 rounded-3xl space-y-4 text-xs">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 class="text-base font-bold flex items-center gap-2 text-white">
          <i data-lucide="bell-ring" class="w-5 h-5 text-brand"></i> Song push
        </h3>
        <span class="text-[10px] text-brand font-mono uppercase font-bold">With cover image</span>
      </div>
      <p class="text-gray-300">Select a song. The system tray notification includes the track cover image.</p>
      <form id="pushForm" class="space-y-3">
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Select Song *</label>
          <select id="notifTrackSelect" required class="w-full bg-neutral-900 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none">
            <option value="" class="bg-neutral-900 text-white">-- Select Track --</option>
          </select>
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Title *</label>
          <input type="text" id="notifTitle" required placeholder="New Song on Nest Music" class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none" />
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Message *</label>
          <textarea id="notifBody" rows="3" required placeholder="Listen to this new song now on Nest Music." class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none"></textarea>
        </div>
        <button type="submit" id="sendNotifBtn" class="w-full py-3.5 bg-brand text-black font-extrabold rounded-xl active:scale-95 transition shadow-lg flex items-center justify-center gap-2">
          <i data-lucide="send" class="w-4 h-4 text-black"></i> SEND SONG PUSH
        </button>
        <p id="pushStatus" class="text-[10px] text-gray-400"></p>
      </form>
    </div>

    <div class="glass p-6 rounded-3xl space-y-4 text-xs">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 class="text-base font-bold flex items-center gap-2 text-white">
          <i data-lucide="message-square" class="w-5 h-5 text-brand"></i> Manual message
        </h3>
        <span class="text-[10px] text-brand font-mono uppercase font-bold">No song required</span>
      </div>
      <p class="text-gray-300">Send a custom push and inbox announcement. Attach an image by URL or upload. Not tied to a track.</p>
      <form id="messageForm" class="space-y-3">
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Title *</label>
          <input type="text" id="msgTitle" required placeholder="Title" class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none" />
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Body *</label>
          <textarea id="msgBody" rows="3" required placeholder="Message" class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none"></textarea>
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Image URL (optional)</label>
          <input type="url" id="msgImageUrl" placeholder="https://..." class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none" />
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Or upload image (optional)</label>
          <input type="file" id="msgImageFile" accept="image/*" class="w-full text-xs text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand file:text-black" />
        </div>
        <button type="submit" id="sendMsgBtn" class="w-full py-3.5 bg-white text-black font-extrabold rounded-xl active:scale-95 transition">
          Send
        </button>
        <p id="msgStatus" class="text-[10px] text-gray-400"></p>
      </form>
    </div>
    </div>`;

  const sel = document.getElementById('notifTrackSelect') as HTMLSelectElement;
  sel.addEventListener('change', () => {
    const track = getAdminTracks().find(t => t.id === sel.value);
    if (track) {
      (document.getElementById('notifTitle') as HTMLInputElement).value = 'New Song on Nest Music';
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
      alert('Please select a song and fill in the title and message.');
      return;
    }
    const selectedSong = getAdminTracks().find(t => t.id === songId);
    sendBtn.disabled = true;
    sendBtn.innerText = 'Sending system-tray push...';
    status.textContent = '';
    try {
      const imageUrl = trackImageUrl(selectedSong);
      const ref = await db.ref('notification_requests').push({
        type: 'song',
        songId: String(songId),
        songTitle: String(selectedSong?.title || 'New Song'),
        artist: String(selectedSong?.artist || selectedSong?.creator || '@nestmusic'),
        uploader: String(selectedSong?.uploaderUsername || selectedSong?.artist || '@nestmusic'),
        title: String(title),
        body: String(body),
        imageUrl,
        coverUrl: imageUrl,
        status: 'pending',
        requestedAt: serverTimestamp(),
        source: 'admin-push'
      });
      const result = await sendFcmByRequestId(String(ref.key));
      const line = formatFcmResult(result);
      status.textContent = line;
      alert(result.ok
        ? `Success. "${selectedSong?.title || songId}" — ${result.sent ?? 0} sent, ${result.failed ?? 0} failed (${result.tokenCount ?? 0} tokens). Cover image attached.`
        : `Queued, but FCM send failed: ${result.error || 'unknown error'}. Drain will retry automatically.`);
      sel.value = '';
      (document.getElementById('notifTitle') as HTMLInputElement).value = '';
      (document.getElementById('notifBody') as HTMLTextAreaElement).value = '';
    } catch (err: any) {
      status.textContent = 'Error: ' + (err?.message || err);
      alert('Error sending push notification: ' + (err?.message || err));
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4 text-black"></i> SEND SONG PUSH`;
      refreshIcons();
    }
  });

  document.getElementById('messageForm')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = (document.getElementById('msgTitle') as HTMLInputElement).value.trim();
    const body = (document.getElementById('msgBody') as HTMLTextAreaElement).value.trim();
    const urlField = (document.getElementById('msgImageUrl') as HTMLInputElement).value.trim();
    const fileEl = document.getElementById('msgImageFile') as HTMLInputElement;
    const sendBtn = document.getElementById('sendMsgBtn') as HTMLButtonElement;
    const status = document.getElementById('msgStatus')!;
    if (!title || !body) {
      alert('Title and body are required.');
      return;
    }
    sendBtn.disabled = true;
    sendBtn.innerText = 'Sending...';
    status.textContent = '';
    try {
      let imageBase64 = '';
      if (fileEl.files && fileEl.files[0]) {
        imageBase64 = await fileToDataUrl(fileEl.files[0]);
      }
      const annRef = db.ref('announcements').push();
      const annId = String(annRef.key);
      const hosted = `https://nest-music.vercel.app/api/announce-image?id=${encodeURIComponent(annId)}`;
      const imageUrl = (urlField && /^https?:\/\//i.test(urlField)) ? urlField : (imageBase64 ? hosted : '');
      await annRef.set({
        type: 'message',
        title,
        body,
        imageUrl: imageUrl || null,
        imageBase64: imageBase64 || null,
        createdAt: Date.now(),
        source: 'admin-message'
      });
      const req = await db.ref('notification_requests').push({
        type: 'message',
        title,
        body,
        imageUrl: imageUrl || null,
        imageBase64: imageBase64 || null,
        announcementId: annId,
        status: 'pending',
        requestedAt: serverTimestamp(),
        source: 'admin-message'
      });
      const result = await sendFcmByRequestId(String(req.key));
      status.textContent = formatFcmResult(result);
      alert(result.ok
        ? `Message sent. ${result.sent ?? 0} devices. ${imageUrl ? 'Image included.' : 'No image.'}`
        : `Queued. ${result.error || 'FCM will retry.'}`);
      (document.getElementById('messageForm') as HTMLFormElement).reset();
    } catch (err: any) {
      status.textContent = 'Error: ' + (err?.message || err);
      alert('Error sending message: ' + (err?.message || err));
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerText = 'Send';
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
