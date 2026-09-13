import { db, escapeHtml } from '../lib/firebase';
import { refreshIcons } from '../lib/ui';

export function mountReports() {
  const root = document.getElementById('reportsAdminTab')!;
  root.innerHTML = `
    <div>
      <h3 class="text-base font-bold text-red-400 flex items-center gap-2 mb-3">
        <i data-lucide="alert-triangle" class="w-4 h-4 text-red-400"></i> User Complaints & Reports
      </h3>
      <div id="adminReportsList" class="space-y-2 text-xs">
        <div class="text-center py-6 text-gray-500">No active complaints.</div>
      </div>
    </div>
    <div>
      <h3 class="text-base font-bold text-white flex items-center gap-2 mb-3">
        <i data-lucide="message-square" class="w-4 h-4 text-white"></i> General Feedback
      </h3>
      <div id="adminFeedbackList" class="space-y-2 text-xs">
        <div class="text-center py-6 text-gray-500">No feedbacks received yet.</div>
      </div>
    </div>`;

  (window as any).removeReport = async (id: string) => db.ref(`reports/${id}`).remove();
  (window as any).removeFeedback = async (id: string) => db.ref(`feedbacks/${id}`).remove();

  db.ref('reports').on('value', (snap: any) => {
    const data = snap.val();
    const list: any[] = [];
    if (data) Object.keys(data).forEach(k => list.push({ id: k, ...data[k] }));
    const c = document.getElementById('adminReportsList')!;
    c.innerHTML = list.map(r => `
      <div class="glass p-3 rounded-xl flex items-center justify-between border border-red-500/30">
        <div>
          <h5 class="font-bold text-red-400">${escapeHtml(r.reason)}</h5>
          <p class="text-gray-300 text-[11px] mt-0.5">${escapeHtml(r.details || 'No additional note')}</p>
        </div>
        <button onclick="removeReport('${r.id}')" class="text-white hover:text-red-400 p-1"><i data-lucide="trash" class="w-4 h-4 text-white"></i></button>
      </div>`).join('') || '<div class="text-center py-4 text-gray-500">No active complaints.</div>';
    refreshIcons();
  });

  db.ref('feedbacks').on('value', (snap: any) => {
    const data = snap.val();
    const list: any[] = [];
    if (data) Object.keys(data).forEach(k => list.push({ id: k, ...data[k] }));
    const c = document.getElementById('adminFeedbackList')!;
    c.innerHTML = list.map(f => `
      <div class="glass p-3 rounded-xl flex items-center justify-between">
        <div>
          <h5 class="font-bold text-white">${escapeHtml(f.subject)} <span class="text-gray-400 text-[10px]">(${escapeHtml(f.email)})</span></h5>
          <p class="text-gray-300 text-[11px] mt-0.5">${escapeHtml(f.message)}</p>
        </div>
        <button onclick="removeFeedback('${f.id}')" class="text-white hover:text-red-400 p-1"><i data-lucide="trash" class="w-4 h-4 text-white"></i></button>
      </div>`).join('') || '<div class="text-center py-4 text-gray-500">No feedbacks.</div>';
    refreshIcons();
  });
}
