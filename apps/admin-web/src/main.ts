import './styles/admin.css';
import { shellHtml, switchTab, refreshIcons } from './lib/ui';
import { mountTracks } from './modules/tracks';
import { mountPush } from './modules/push';
import { mountVerified } from './modules/verified';
import { mountQueue } from './modules/queue';
import { mountAppDist } from './modules/app-dist';
import { mountReports } from './modules/reports';

const app = document.getElementById('app')!;
app.innerHTML = shellHtml();

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = (btn as HTMLElement).dataset.tab!;
    switchTab(tab);
  });
});

mountTracks();
mountPush();
mountVerified();
mountQueue();
mountAppDist();
mountReports();
refreshIcons();

// Apply saved Nest theme token (shared key with user app)
try {
  const t = localStorage.getItem('nest_theme') || 'midnight';
  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-theme', t);
} catch (_) {}
