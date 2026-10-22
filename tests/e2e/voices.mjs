// Shared helpers for the real-audio browser tests: synthesize a conversation
// with ffmpeg's flite voices and serve the app.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RATE = 48000;

export function hasFlite() {
  try { return execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).includes('flite'); } catch { return false; }
}

/** Build one WAV of the turns with silence between; returns { path, ends } (seconds). */
export async function conversation(turns, { gap = 1.6, lead = 1.0, tail = 30 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'tb-voices-'));
  const pcm = [new Int16Array(Math.round(RATE * lead))];
  let total = pcm[0].length;
  const ends = [];
  for (const [i, [voice, text]] of turns.entries()) {
    const f = join(dir, `${i}.wav`);
    execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      `flite=text='${text.replace(/'/g, '')}':voice=${voice}`, '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', f]);
    const b = await readFile(f);
    const s = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length));
    pcm.push(s); total += s.length; ends.push(total / RATE);
    const g = new Int16Array(Math.round(RATE * gap)); pcm.push(g); total += g.length;
  }
  const t = new Int16Array(RATE * tail); pcm.push(t); total += t.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + total * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(total * 2, 40);
  const path = join(dir, 'conversation.wav');
  await writeFile(path, Buffer.concat([header, ...pcm.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))]));
  return { path, ends };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
export async function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}/` };
}
