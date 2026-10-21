// App entry: view switching, service worker, browser support banner.
import { initTalk, leaveTalk } from './views/talk.js';
import { initSubs, leaveSubs } from './views/subs.js';
import { initMeet, meetingBusy } from './views/meet.js';
import { initLearn, leaveLearn } from './views/learn.js';
import { initSettings } from './views/settings.js';
import { canRecognize } from './speech.js';
import { $, $$, toast } from './ui.js';

const VIEWS = ['talk', 'subs', 'meet', 'learn', 'settings'];
const leave = { talk: leaveTalk, subs: leaveSubs, learn: leaveLearn };
let current = 'talk';

function show(name) {
  if (!VIEWS.includes(name)) name = 'talk';
  if (name === current && !$('#view-' + name).hidden) return;
  if (leave[current]) leave[current]();
  if (meetingBusy() && name !== 'meet' && name !== 'settings') {
    toast('會議記錄進行中，語音辨識同時只能用在一個地方；切回「會議」可繼續看逐字稿。', 5000);
  }
  current = name;
  for (const v of VIEWS) $('#view-' + v).hidden = v !== name;
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === name)));
  try { history.replaceState(null, '', '#' + name); } catch { /* sandboxed frame */ }
  $('#main').scrollTop = 0;
}

function boot() {
  initSettings();
  initTalk();
  initSubs();
  initMeet();
  initLearn();
  $$('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));
  const start = (location.hash || '').slice(1);
  current = '';
  show(VIEWS.includes(start) ? start : 'talk');
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));

  if (!canRecognize) {
    const b = $('#support-banner');
    b.hidden = false;
    b.innerHTML = '<b>這個瀏覽器沒有語音辨識。</b> 打字翻譯和練習播放仍可使用；要用口譯、字幕和會議逐字稿，請改用 Chrome 或 Edge（電腦、Android），或 iPhone 的 Safari。';
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('beforeunload', (e) => {
    if (meetingBusy()) { e.preventDefault(); e.returnValue = ''; }
  });
}

boot();
