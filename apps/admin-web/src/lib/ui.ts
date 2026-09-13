declare const lucide: { createIcons: () => void };

export function refreshIcons() {
  try { lucide.createIcons(); } catch { /* ignore */ }
}

export function switchTab(tabId: string) {
  document.querySelectorAll('.admin-tab').forEach((el) => el.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');

  const map: Record<string, string> = {
    tracksAdminTab: 'tabBtnTracks',
    pushNotifTab: 'tabBtnPush',
    verifiedUsersTab: 'tabBtnVerified',
    blueTickAdminTab: 'tabBtnBlue',
    appDistAdminTab: 'tabBtnAppDist',
    reportsAdminTab: 'tabBtnReports'
  };

  Object.values(map).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('bg-brand', 'text-black');
      el.classList.add('glass', 'text-white');
    }
  });

  const active = map[tabId];
  if (active) {
    const el = document.getElementById(active);
    if (el) el.className = 'px-4 py-2 bg-brand text-black font-bold rounded-xl transition';
  }
  refreshIcons();
}

export function shellHtml(): string {
  return `
  <header class="flex items-center justify-between border-b border-white/10 pb-4">
    <div class="flex items-center space-x-3">
      <img src="https://i.postimg.cc/sg287hck/thinkogic-sharpen-image-209299.png" class="w-10 h-10 rounded-2xl object-contain bg-black p-1 border border-brand/40 shadow-lg shadow-brand/20" alt="Logo" />
      <div>
        <h1 class="text-xl font-black tracking-tight text-white">Nest Music Admin Portal</h1>
        <p class="text-xs text-gray-400">Master Catalog, Pin Tracks, Native Push Notifications & Green Tick Management</p>
      </div>
    </div>
    <div class="flex items-center space-x-2 text-xs">
      <span class="px-3 py-1 bg-brand/20 text-brand rounded-full border border-brand/30 font-bold flex items-center gap-1">
        <i data-lucide="activity" class="w-3.5 h-3.5 text-brand"></i> Realtime DB
      </span>
    </div>
  </header>

  <div class="flex space-x-2 border-b border-white/10 pb-3 text-xs font-bold overflow-x-auto">
    <button data-tab="tracksAdminTab" id="tabBtnTracks" class="px-4 py-2 bg-brand text-black rounded-xl transition">Audio Catalog & Pin (<span id="countTracks">0</span>)</button>
    <button data-tab="pushNotifTab" id="tabBtnPush" class="px-4 py-2 glass text-white rounded-xl transition">Send Push Notification</button>
    <button data-tab="verifiedUsersTab" id="tabBtnVerified" class="px-4 py-2 glass text-white rounded-xl transition">Green Tick Creators (<span id="countVerified">0</span>)</button>
    <button data-tab="blueTickAdminTab" id="tabBtnBlue" class="px-4 py-2 glass text-white rounded-xl transition">Verification Queue (<span id="countBlue">0</span>)</button>
    <button data-tab="appDistAdminTab" id="tabBtnAppDist" class="px-4 py-2 glass text-white rounded-xl transition">App Link & Distribution</button>
    <button data-tab="reportsAdminTab" id="tabBtnReports" class="px-4 py-2 glass text-white rounded-xl transition">Reports & Feedback</button>
  </div>

  <section id="tracksAdminTab" class="admin-tab space-y-4"></section>
  <section id="pushNotifTab" class="admin-tab hidden space-y-4"></section>
  <section id="verifiedUsersTab" class="admin-tab hidden space-y-4"></section>
  <section id="blueTickAdminTab" class="admin-tab hidden space-y-4"></section>
  <section id="appDistAdminTab" class="admin-tab hidden space-y-4"></section>
  <section id="reportsAdminTab" class="admin-tab hidden space-y-6"></section>
  `;
}
