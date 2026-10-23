// donate.html: payment details, the confirmed donor count and wall, and a
// thank-you clip for each supporter.
import './android.js';
import { loadJSON, normalizeDonate, normalizeDonors, nextDonorNumber, notifyText, CREDIT, MAKER } from './support.js';
import { recordThanks } from './thanks.js';
import { $, h, toast, copyText, download, shareFiles, lineShareUrl, fileStamp } from './ui.js';

let cfg = normalizeDonate(null);
let donors = { count: 0, donors: [] };
let amount = null;
let result = null;

function renderDonors() {
  $('#d-count').textContent = donors.count;
  $('#d-next').textContent = `你會是第 ${donors.count + 1} 位。名單只列出 ${MAKER} 確認收到款項的朋友。`;
  const wall = $('#d-wall');
  wall.textContent = '';
  if (!donors.count) {
    wall.append(h('li', { class: 'muted small' }, '還沒有人上榜，你可以成為第一位！'));
    return;
  }
  for (const d of [...donors.donors].reverse().slice(0, 60)) {
    wall.append(h('li', { title: d.message || '' }, h('span', { class: 'n' }, `#${d.n}`), d.name));
  }
}

function renderAmounts() {
  const box = $('#d-amounts');
  box.textContent = '';
  const chips = [...cfg.amounts.map((a) => ({ v: a, label: `NT$${a}`, sub: a === cfg.amounts[0] ? '一杯咖啡' : a === cfg.amounts[1] ? '咖啡＋點心' : '請整個團隊' })), { v: 'custom', label: '自訂', sub: '' }];
  for (const c of chips) {
    const b = h('button', { class: 'amount', type: 'button', 'aria-pressed': String(amount === c.v) }, h('b', {}, c.label), c.sub ? h('small', {}, c.sub) : null);
    b.addEventListener('click', () => {
      amount = c.v;
      $('#d-custom-wrap').hidden = c.v !== 'custom';
      renderAmounts();
    });
    box.append(b);
  }
}

function copyRow(label, value) {
  return [h('dt', {}, label), h('dd', {}, h('span', { class: 'mono' }, value),
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => copyText(value) }, '複製'))];
}

function renderPayments() {
  const b = cfg.bank;
  const info = $('#d-bank-info');
  info.textContent = '';
  if (cfg.bankReady) {
    info.append(...copyRow('銀行', `${b.name} (${b.code})`), ...copyRow('帳號', b.account));
    if (b.holder) info.append(...copyRow('戶名', b.holder));
  }
  $('#d-bank-missing').hidden = cfg.bankReady;
  const l = cfg.linePay;
  const li = $('#d-line-info');
  li.textContent = '';
  if (l.url) li.append(h('a', { class: 'btn primary', href: l.url, target: '_blank', rel: 'noopener' }, '開啟 LINE Pay 付款'));
  if (l.qr) li.append(h('img', { class: 'qr', src: l.qr, alt: 'LINE Pay 收款 QR 碼' }));
  if (l.id) li.append(h('dl', { class: 'kv' }, ...copyRow('LINE ID', l.id)));
  $('#d-line-missing').hidden = cfg.lineReady;
}

function chosenAmount() {
  if (amount === 'custom') {
    const v = parseInt($('#d-custom').value.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  return amount;
}

async function submit(e) {
  e.preventDefault();
  const name = $('#d-name').value.trim();
  if (!name) { toast('請輸入暱稱'); return; }
  const info = {
    name,
    amount: chosenAmount(),
    method: $('#d-method').value,
    last5: $('#d-last5').value.replace(/[^\d]/g, '').slice(-5),
    message: $('#d-message').value.trim(),
    number: nextDonorNumber(donors),
  };
  $('#d-submit').disabled = true;
  $('#d-thanks').hidden = false;
  $('#d-thanks-title').textContent = `謝謝你，${name}！`;
  $('#d-thanks-text').textContent = `你是第 ${info.number} 位請 ${MAKER} 喝咖啡的朋友。這杯咖啡會變成下一次的更新與修正，${MAKER} 確認收到後會把你的名字加進贊助名單。`;
  const text = notifyText(info);
  $('#d-notify').textContent = text;
  $('#d-notify-line').href = lineShareUrl(text);
  $('#d-thanks').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const canvas = $('#d-canvas');
  canvas.hidden = false;
  $('#d-video').hidden = true;
  $('#d-actions').hidden = true;
  result = await recordThanks(canvas, { name, number: info.number }, {
    onProgress: (p) => { $('#d-progress').textContent = `正在製作你的感謝影片… ${Math.round(p * 100)}%`; },
  });
  result.info = info;
  if (result.video) {
    const v = $('#d-video');
    if (result.image) v.poster = URL.createObjectURL(result.image); // last frame, shown until it plays
    v.src = URL.createObjectURL(result.video);
    v.hidden = false;
    canvas.hidden = true;
    $('#d-progress').textContent = '你的感謝影片做好了，可以下載或分享。';
  } else {
    $('#d-progress').textContent = '這個瀏覽器無法錄製影片，已為你保留感謝圖片。';
  }
  $('#d-dl-video').hidden = !result.video;
  $('#d-actions').hidden = false;
  $('#d-submit').disabled = false;
}

function videoFile() {
  const ext = result.video.type.includes('mp4') ? 'mp4' : 'webm';
  return new File([result.video], `${fileStamp()}_thanks.${ext}`, { type: result.video.type });
}

async function init() {
  $('#d-credit').textContent = CREDIT;
  const [c, d] = await Promise.all([loadJSON('donate.json', null), loadJSON('donors.json', null)]);
  cfg = normalizeDonate(c);
  donors = normalizeDonors(d);
  amount = cfg.amounts[0];
  $('#d-title').textContent = cfg.title;
  $('#d-note').textContent = cfg.note;
  renderDonors();
  renderAmounts();
  renderPayments();
  $('#d-method').addEventListener('change', (e) => { $('#d-last5-wrap').hidden = e.target.value !== 'bank'; });
  $('#d-form').addEventListener('submit', submit);
  $('#d-dl-video').addEventListener('click', () => { if (result && result.video) { const f = videoFile(); download(f, f.name); } });
  $('#d-dl-image').addEventListener('click', () => result && download(result.image, `${fileStamp()}_thanks.png`));
  $('#d-share').addEventListener('click', async () => {
    if (!result) return;
    const files = result.video ? [videoFile()] : [new File([result.image], `${fileStamp()}_thanks.png`, { type: 'image/png' })];
    const r = await shareFiles({ title: '我請 Tony 喝了一杯咖啡', text: `我是第 ${result.info.number} 位支持 Tony 的 App 的朋友 ☕`, files });
    if (r === 'unsupported') toast('這個瀏覽器不能直接分享檔案，請先下載再傳送。', 5000);
  });
  $('#d-notify-copy').addEventListener('click', () => copyText($('#d-notify').textContent));
}

init();
