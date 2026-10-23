// Thank-you clip for supporters: a coffee cup with rising steam and confetti,
// the supporter's name and number, drawn on a canvas and recorded with a
// short chime into a video file (WebM, or MP4 where the browser records it).
import { CREDIT, MAKER } from './support.js';

export const SIZE = 720;
export const DURATION = 6; // seconds

const C = { bg: '#f4efe7', ink: '#2b2118', muted: '#7a6a5a', cup: '#ffffff', coffee: '#6b3f22', accent: '#0b7480', band: '#e2d3bf' };
const CONFETTI = ['#0b7480', '#c4632b', '#7a4b9a', '#d9a400', '#2f6db3'];

function seeded(n) {
  let s = n * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** Draw the frame at time t (seconds). Pure drawing: no timers, so it can be tested. */
export function drawThanks(ctx, t, { name, number, confirmed = false }) {
  const S = SIZE;
  ctx.save();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, S, S);

  // Confetti falling from the top after 0.6 s.
  const rnd = seeded(7);
  for (let i = 0; i < 70; i++) {
    const x0 = rnd() * S, speed = 120 + rnd() * 160, delay = 0.6 + rnd() * 1.5, spin = rnd() * 6;
    const y = (t - delay) * speed - 20;
    if (t < delay || y > S + 20) continue;
    ctx.save();
    ctx.translate(x0 + Math.sin(t * 2 + i) * 18, y);
    ctx.rotate(spin + t * 3);
    ctx.fillStyle = CONFETTI[i % CONFETTI.length];
    ctx.fillRect(-6, -3, 12, 6);
    ctx.restore();
  }

  // Cup rises in during the first 0.8 s.
  const rise = ease(t / 0.8);
  const cx = S / 2, cy = 300 + (1 - rise) * 120;
  ctx.globalAlpha = rise;
  ctx.fillStyle = C.band;
  ctx.beginPath(); ctx.ellipse(cx, cy + 118, 150, 26, 0, 0, Math.PI * 2); ctx.fill();      // saucer
  ctx.fillStyle = C.cup;
  ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - 110, cy - 40); ctx.lineTo(cx + 110, cy - 40);
  ctx.quadraticCurveTo(cx + 104, cy + 100, cx, cy + 110);
  ctx.quadraticCurveTo(cx - 104, cy + 100, cx - 110, cy - 40);
  ctx.closePath(); ctx.fill(); ctx.stroke();                                              // cup
  ctx.beginPath(); ctx.arc(cx + 122, cy + 20, 34, -Math.PI / 2, Math.PI / 2); ctx.stroke(); // handle
  ctx.fillStyle = C.coffee;
  ctx.beginPath(); ctx.ellipse(cx, cy - 40, 104, 16, 0, 0, Math.PI * 2); ctx.fill();       // coffee
  ctx.fillStyle = C.accent;
  ctx.font = '700 34px "Noto Sans TC", "WenQuanYi Zen Hei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('♥', cx, cy + 52);

  // Steam: three wavy lines drifting up.
  ctx.strokeStyle = 'rgba(122,106,90,0.55)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    for (let y = 0; y <= 90; y += 6) {
      const x = cx + k * 40 + Math.sin((y / 18) + t * 4 + k) * 9;
      const yy = cy - 70 - y - ((t * 30) % 12);
      if (y === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.globalAlpha = rise * (0.5 + 0.5 * Math.sin(t * 2 + k));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Text appears after the cup.
  const a1 = ease((t - 1.0) / 0.6), a2 = ease((t - 1.8) / 0.6), a3 = ease((t - 2.6) / 0.6);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.ink;
  ctx.globalAlpha = a1;
  ctx.font = '900 54px "Noto Sans TC", "WenQuanYi Zen Hei", sans-serif';
  ctx.fillText(`謝謝你，${name}！`, cx, 520 + (1 - a1) * 20);
  ctx.globalAlpha = a2;
  ctx.fillStyle = C.accent;
  ctx.font = '800 40px "Noto Sans TC", "WenQuanYi Zen Hei", sans-serif';
  ctx.fillText(`你是第 ${number} 位贊助者`, cx, 580 + (1 - a2) * 20);
  ctx.globalAlpha = a3;
  ctx.fillStyle = C.muted;
  ctx.font = '500 22px "Noto Sans TC", "WenQuanYi Zen Hei", sans-serif';
  ctx.fillText(confirmed ? `${MAKER} 已確認收到，謝謝你的支持` : `${MAKER} 確認入帳後，會把你加進贊助名單`, cx, 628);
  ctx.fillText(CREDIT, cx, 676);
  ctx.restore();
}

// A short rising chime (C–E–G–C) for the clip's soundtrack.
function chime(ctx, dest) {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const at = ctx.currentTime + 0.8 + i * 0.22;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.25, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, at + 1.2);
    o.connect(g); g.connect(dest); g.connect(ctx.destination);
    o.start(at); o.stop(at + 1.3);
  });
}

function recorderMime() {
  for (const m of ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

/**
 * Play the clip on `canvas` and record it. Resolves { video, image } Blobs
 * (video is null where the browser cannot record a canvas).
 */
export function recordThanks(canvas, info, { onProgress } = {}) {
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const mime = recorderMime();
  let recorder = null;
  const chunks = [];
  let audio = null;
  if (mime && canvas.captureStream) {
    const stream = canvas.captureStream(30);
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio = new Ctx();
      const dest = audio.createMediaStreamDestination();
      chime(audio, dest);
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    } catch { audio = null; }
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.start(250);
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      drawThanks(ctx, Math.min(t, DURATION), info);
      if (onProgress) onProgress(Math.min(1, t / DURATION));
      if (t < DURATION) { requestAnimationFrame(frame); return; }
      canvas.toBlob((image) => {
        if (!recorder) { resolve({ video: null, image }); return; }
        recorder.onstop = () => {
          if (audio) audio.close();
          resolve({ video: new Blob(chunks, { type: mime.split(';')[0] }), image });
        };
        recorder.stop();
      }, 'image/png');
    };
    requestAnimationFrame(frame);
  });
}
