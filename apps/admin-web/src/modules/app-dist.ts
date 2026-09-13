import { db, serverTimestamp } from '../lib/firebase';
import { refreshIcons } from '../lib/ui';

export function mountAppDist() {
  const root = document.getElementById('appDistAdminTab')!;
  root.innerHTML = `
    <div class="glass p-6 rounded-3xl space-y-4 text-xs max-w-lg">
      <div class="flex items-center justify-between border-b border-white/10 pb-3">
        <h3 class="text-base font-bold flex items-center gap-2 text-white">
          <i data-lucide="link" class="w-5 h-5 text-brand"></i> App Link & Distribution
        </h3>
        <span class="text-[10px] text-brand font-mono uppercase font-bold">Release Info</span>
      </div>
      <p class="text-gray-300">Publish the public web URL and GitHub release notes. In-app "Download Official App" prompts have been removed from the user UI — deep links <code class="text-brand">?track=</code> open-to-play only.</p>
      <form id="appDistForm" class="space-y-3">
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Public Web URL *</label>
          <input type="url" id="appDistUrl" required placeholder="https://nest-music.vercel.app/" class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none" />
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Latest Release Tag</label>
          <input type="text" id="appDistRelease" placeholder="v1.2.0" class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none" />
        </div>
        <div>
          <label class="block text-gray-300 font-semibold mb-1">Notes (optional)</label>
          <textarea id="appDistNotes" rows="2" placeholder="Release notes for internal tracking" class="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white focus:border-brand outline-none"></textarea>
        </div>
        <button type="submit" class="w-full py-3 bg-brand text-black font-extrabold rounded-xl active:scale-95 transition shadow-lg">Save Distribution Info</button>
      </form>
    </div>`;

  db.ref('app_settings/officialApp').on('value', (snap: any) => {
    const val = snap.val();
    if (val) {
      (document.getElementById('appDistUrl') as HTMLInputElement).value = val.url || 'https://nest-music.vercel.app/';
      (document.getElementById('appDistRelease') as HTMLInputElement).value = val.release || '';
      (document.getElementById('appDistNotes') as HTMLTextAreaElement).value = val.notes || '';
    }
  });

  document.getElementById('appDistForm')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.ref('app_settings/officialApp').set({
      url: (document.getElementById('appDistUrl') as HTMLInputElement).value,
      release: (document.getElementById('appDistRelease') as HTMLInputElement).value,
      notes: (document.getElementById('appDistNotes') as HTMLTextAreaElement).value,
      mode: 'web',
      updatedAt: serverTimestamp()
    });
    alert('Distribution info saved.');
  });

  refreshIcons();
}
