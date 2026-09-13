import { db, escapeHtml, type NestUser } from '../lib/firebase';
import { refreshIcons } from '../lib/ui';

let usersData: Record<string, any> = {};

export function mountVerified() {
  const root = document.getElementById('verifiedUsersTab')!;
  root.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-base font-bold flex items-center gap-2 text-white">
          <i data-lucide="badge-check" class="w-5 h-5 text-brand"></i> Verified Green Tick Creators
        </h3>
        <p class="text-xs text-gray-400">Toggle automatic device push notifications when each verified creator uploads a song.</p>
      </div>
      <span id="verifiedCountBadge" class="text-xs font-bold text-brand bg-brand/20 border border-brand/30 px-3 py-1 rounded-full">0 Creators</span>
    </div>
    <div id="verifiedCreatorsList" class="space-y-3 text-xs">
      <div class="text-center py-8 text-gray-500">Loading verified creators...</div>
    </div>`;

  (window as any).toggleCreatorAutoNotify = async (uid: string, state: boolean) => {
    await db.ref(`users/${uid}`).update({ autoNotifyEnabled: state });
  };
  (window as any).removeGreenTick = async (uid: string) => {
    if (confirm('Revoke verified green tick badge from this creator?')) {
      await db.ref(`users/${uid}`).update({ isVerified: false });
    }
  };

  db.ref('users').on('value', (snap: any) => {
    usersData = snap.val() || {};
    render();
  });
}

function render() {
  const verifiedList: NestUser[] = [];
  Object.keys(usersData).forEach(uid => {
    if (usersData[uid].isVerified === true) verifiedList.push({ uid, ...usersData[uid] });
  });
  const count = document.getElementById('countVerified');
  const badge = document.getElementById('verifiedCountBadge');
  if (count) count.innerText = String(verifiedList.length);
  if (badge) badge.innerText = `${verifiedList.length} Creators`;

  const c = document.getElementById('verifiedCreatorsList')!;
  c.innerHTML = verifiedList.map(u => `
    <div class="glass p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
      <div>
        <div class="flex items-center space-x-2">
          <h4 class="font-bold text-white text-sm">${escapeHtml(u.name || u.email)}</h4>
          <span class="text-brand"><i data-lucide="badge-check" class="w-4 h-4 fill-brand text-black"></i></span>
          <span class="text-gray-400 font-mono">@${escapeHtml(u.username || 'creator')}</span>
        </div>
        <p class="text-gray-400 mt-0.5">${escapeHtml(u.email)}</p>
      </div>
      <div class="flex items-center space-x-3">
        <div class="flex items-center space-x-2">
          <span class="text-gray-300 font-semibold text-[11px]">Auto-Push Upload:</span>
          <button onclick="toggleCreatorAutoNotify('${u.uid}', ${u.autoNotifyEnabled === false ? 'true' : 'false'})" class="px-3 py-1.5 rounded-xl font-bold transition ${u.autoNotifyEnabled !== false ? 'bg-brand text-black' : 'bg-neutral-800 text-gray-400 border border-white/10'}">
            ${u.autoNotifyEnabled !== false ? 'ON' : 'OFF'}
          </button>
        </div>
        <button onclick="removeGreenTick('${u.uid}')" class="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-600 hover:text-white transition">Revoke Tick</button>
      </div>
    </div>`).join('') || '<div class="text-center py-8 text-gray-500">No verified creators yet. Approve requests from the queue.</div>';
  refreshIcons();
}
