// 關於: version, maker credit, release notes (latest from GitHub), downloads
// and the "buy Tony a coffee" link with the confirmed supporter count.
import { parseChangelog, normalizeDonors, loadShared, loadJSON, CREDIT, MAKER, REPO, SITE, APK_URL, DONATE_URL } from '../support.js';
import { isAndroidApp, newerVersion, openExternal } from '../android.js';
import { $, h } from '../ui.js';

let loaded = false;

async function bundledChangelog() {
  try { return await (await fetch('CHANGELOG.md', { cache: 'no-store' })).text(); } catch { return ''; }
}

function localVersion(bundled) {
  if (isAndroidApp) {
    try { return window.TalkBridgeAndroid.versionName(); } catch { /* fall through */ }
  }
  const top = bundled[0];
  return top ? top.version : '';
}

function link(label, href) {
  const a = h('a', { class: 'btn', href, target: '_blank', rel: 'noopener' }, label);
  if (isAndroidApp) a.addEventListener('click', (e) => { e.preventDefault(); openExternal(href); });
  return a;
}

export function initAbout() {
  $('#about-credit').textContent = CREDIT;
  $('#about-links').append(
    link('網頁版', SITE),
    link('下載 Android App', APK_URL),
    link('GitHub 原始碼', REPO),
  );
  const coffee = $('#about-coffee');
  coffee.href = DONATE_URL;
  if (isAndroidApp) coffee.addEventListener('click', (e) => { e.preventDefault(); openExternal(DONATE_URL); });
}

/** Load notes and donor numbers the first time the tab opens. */
export async function enterAbout() {
  if (loaded) return;
  loaded = true;
  const [local, md, d] = await Promise.all([bundledChangelog(), loadShared('CHANGELOG.md'), loadJSON('donors.json', null)]);
  const bundled = parseChangelog(local);
  const remote = parseChangelog(md);
  // Use whichever list is newer (GitHub normally; the bundled one while a release is on its way).
  const releases = remote[0] && (!bundled[0] || newerVersion(remote[0].version, bundled[0].version) || remote[0].version === bundled[0].version) ? remote : bundled;
  const current = localVersion(bundled);
  const latest = releases[0];
  $('#about-version').textContent = current ? `版本 ${current}` : '';
  const upd = $('#about-update');
  if (latest && current && newerVersion(latest.version, current.split('.').slice(0, 3).join('.'))) {
    upd.hidden = false;
    upd.textContent = `GitHub 上有新版本 ${latest.version}（${latest.date}）。`;
  }
  const donors = normalizeDonors(d);
  $('#about-donors').textContent = donors.count
    ? `已有 ${donors.count} 位朋友請 ${MAKER} 喝咖啡，謝謝大家！`
    : `還沒有人請 ${MAKER} 喝咖啡，你可以成為第一位。`;
  const box = $('#about-notes');
  box.textContent = '';
  if (!releases.length) { box.append(h('p', { class: 'muted' }, '暫時讀不到更新說明，請連上網路後再試。')); return; }
  const base = current ? current.split('.').slice(0, 3).join('.') : '';
  for (const r of releases.slice(0, 12)) {
    const tag = r.version === base ? h('span', { class: 'badge ready' }, '目前版本') : newerVersion(r.version, base) && base ? h('span', { class: 'badge busy' }, '新版本') : null;
    box.append(h('article', { class: 'release' },
      h('h3', {}, `v${r.version}`, h('span', { class: 'muted small' }, `　${r.date}`), tag ? ' ' : null, tag),
      h('ul', {}, ...(r.zh.length ? r.zh : r.en).map((x) => h('li', {}, x.replace(/`/g, ''))))));
  }
}
