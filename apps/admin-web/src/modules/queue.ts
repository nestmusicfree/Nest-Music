import { db, escapeHtml } from '../lib/firebase';
import { refreshIcons } from '../lib/ui';

export function mountQueue() {
  const root = document.getElementById('blueTickAdminTab')!;
  root.innerHTML = `
    <h3 class="text-base font-bold flex items-center gap-2 text-white">
      <i data-lucide="user-check" class="w-4 h-4 text-brand"></i> Green Tick Verification Queue
    </h3>
    <div id="adminBlueTickList" class="space-y-3">
      <div class="text-center py-8 text-gray-500 text-xs">No pending requests.</div>
    </div>`;

  (window as any).grantBlueTick = async (uid: string, reqId: string) => {
    await db.ref(`users/${uid}`).update({ isVerified: true, autoNotifyEnabled: true });
    await db.ref(`blue_tick_requests/${reqId}`).remove();
    alert('Verified Green Tick Badge granted with Auto-Notification enabled!');
  };

  db.ref('blue_tick_requests').on('value', (snap: any) => {
    const data = snap.val();
    const list: any[] = [];
    if (data) Object.keys(data).forEach(k => list.push({ id: k, ...data[k] }));
    const count = document.getElementById('countBlue');
    if (count) count.innerText = String(list.length);
    const c = document.getElementById('adminBlueTickList')!;
    c.innerHTML = list.map(req => `
      <div class="glass p-4 rounded-2xl flex items-center justify-between gap-3 text-xs">
        <div>
          <h4 class="font-bold text-white text-sm flex items-center gap-1.5">${escapeHtml(req.artistName)} <span class="text-gray-400 text-xs">(${escapeHtml(req.email)})</span></h4>
          <p class="text-gray-300 mt-1"><strong>Reason:</strong> ${escapeHtml(req.reason)}</p>
          <a href="${escapeHtml(req.proofLink)}" target="_blank" class="text-brand text-[11px] hover:underline mt-1 inline-block">Proof Link ↗</a>
        </div>
        <div class="flex items-center space-x-2">
          <button onclick="grantBlueTick('${req.uid}', '${req.id}')" class="px-3 py-1.5 bg-brand text-black font-bold rounded-xl hover:bg-brand-light transition">Approve Green Tick</button>
          <button onclick="dbRemoveBlue('${req.id}')" class="px-3 py-1.5 bg-neutral-800 text-white rounded-xl hover:bg-neutral-700 transition">Dismiss</button>
        </div>
      </div>`).join('') || '<div class="text-center py-6 text-gray-500 text-xs">No pending requests.</div>';
    refreshIcons();
  });

  (window as any).dbRemoveBlue = async (id: string) => {
    await db.ref(`blue_tick_requests/${id}`).remove();
  };
}
