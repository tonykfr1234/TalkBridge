// Release notes for GitHub Releases: the newest CHANGELOG.md section in
// Traditional Chinese and English, the maker credit and the coffee link.
// Usage: node scripts/release_notes.mjs [signing]   (signing: release | debug)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseChangelog, CREDIT, DONATE_URL, SITE } from '../js/support.js';

const md = readFileSync(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)), 'utf8');
const [r] = parseChangelog(md);
const signing = process.argv[2] || 'release';
const lines = [
  `## TalkBridge ${r.version}（${r.date}）`,
  '',
  '### 更新內容',
  ...r.zh.map((x) => `- ${x}`),
  '',
  '### What\'s new',
  ...r.en.map((x) => `- ${x}`),
  '',
  '### 安裝',
  '- 下載下方的 **TalkBridge.apk**，在手機上點開安裝（Android 8.0 以上）；App 開啟時會自動提示更新。',
  `- 網頁版：${SITE}`,
];
if (signing === 'debug') lines.push('- ⚠️ 這一版是暫時簽章：更新前需先解除安裝舊版（設定簽章密鑰後就不需要，見 docs/ANDROID.zh-TW.md）。');
lines.push('', '---', '', `**${CREDIT}**`, '', `☕ 喜歡這個 App？[請 Tony 喝一杯咖啡](${DONATE_URL})（銀行轉帳或 LINE Pay）`);
console.log(lines.join('\n'));
