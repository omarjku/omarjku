#!/usr/bin/env node
// Frame-by-frame renderer for README videos.
//
//   node motion/render.mjs <scene> [--scale 1.5] [--fps 30] [--gif 880] [--gif-fps 24]
//                                  [--card 420] [--out dir] [--still 2.5] [--workers 4]
//
// Every frame is drawn by the scene's draw(ctx, t) on a <canvas> in headless
// Chromium, saved as PNG, then encoded with ffmpeg: an MP4 for sharing and a
// palette-optimised GIF (plus an optional small "card" GIF) for READMEs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const globalRoot = execFileSync('npm', ['root', '-g']).toString().trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      a[k] = v;
    } else a._.push(argv[i]);
  }
  return a;
}

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const kb = (f) => `${(fs.statSync(f).size / 1024).toFixed(0)} KB`;

function gif(frames, fps, srcFps, width, out, lossy) {
  const vf = `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=256:stats_mode=full[p];` +
    `[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
  ff(['-framerate', String(srcFps), '-i', path.join(frames, 'f%05d.png'), '-vf', vf, '-loop', '0', out]);
  try {
    execFileSync('gifsicle', ['-O3', `--lossy=${lossy}`, '--batch', out]);
  } catch { console.warn('  gifsicle not found; GIF left unoptimised'); }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args._[0];
  if (!name) { console.error('usage: render.mjs <scene> [options]'); process.exit(1); }
  const scale = parseFloat(args.scale || '1');
  const outDir = path.resolve(args.out || path.join(here, 'out'));
  const workers = parseInt(args.workers || String(Math.max(1, os.cpus().length)), 10);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve(here);
  const base = `http://127.0.0.1:${server.address().port}/engine/stage.html?render&scene=${name}&scale=${scale}`;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();

  const open = async () => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('  page error:', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('  console:', m.text()));
    await page.goto(base + (args.fps ? `&fps=${args.fps}` : ''));
    await page.waitForFunction('window.ready === true', null, { timeout: 30000 });
    return page;
  };
  const save = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

  // --still t: one PNG at time t, for checking a moment of the scene.
  if (args.still !== undefined) {
    const page = await open();
    const times = String(args.still).split(',').map(Number);
    const meta = await page.evaluate(() => window.meta);
    for (const t of times) {
      const file = path.join(outDir, `${name}@${t}.png`);
      save(await page.evaluate((i) => window.frame(i), Math.round(t * meta.fps)), file);
      console.log(file);
    }
    await browser.close(); server.close();
    return;
  }

  const probe = await open();
  const meta = await probe.evaluate(() => window.meta);
  const total = Math.round(meta.duration * meta.fps);
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), `frames-${name}-`));
  const t0 = Date.now();
  console.log(`${name}: ${meta.width}x${meta.height} ×${scale} · ${meta.duration}s @ ${meta.fps}fps = ${total} frames · ${workers} workers`);

  const pages = [probe, ...(await Promise.all(Array.from({ length: workers - 1 }, open)))];
  let next = 0;
  await Promise.all(pages.map(async (page) => {
    while (next < total) {
      const i = next++;
      save(await page.evaluate((k) => window.frame(k), i), path.join(frames, `f${String(i).padStart(5, '0')}.png`));
    }
  }));
  await browser.close(); server.close();
  console.log(`  frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const mp4 = path.join(outDir, `${name}.mp4`);
  ff(['-framerate', String(meta.fps), '-i', path.join(frames, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', mp4]);
  console.log(`  ${mp4} (${kb(mp4)})`);

  if (args.gif !== 'false') {
    const g = path.join(outDir, `${name}.gif`);
    gif(frames, parseFloat(args['gif-fps'] || '24'), meta.fps, parseInt(args.gif || '880', 10), g, parseInt(args.lossy || '30', 10));
    console.log(`  ${g} (${kb(g)})`);
  }
  if (args.card) {
    const c = path.join(outDir, `${name}-card.gif`);
    gif(frames, parseFloat(args['card-fps'] || '15'), meta.fps, parseInt(args.card, 10), c, parseInt(args['card-lossy'] || '60', 10));
    console.log(`  ${c} (${kb(c)})`);
  }
  if (args.poster !== undefined) {
    const p = path.join(outDir, `${name}-poster.png`);
    fs.copyFileSync(path.join(frames, `f${String(Math.round(parseFloat(args.poster) * meta.fps)).padStart(5, '0')}.png`), p);
    console.log(`  ${p}`);
  }
  if (!args['keep-frames']) fs.rmSync(frames, { recursive: true, force: true });
  else console.log(`  frames kept in ${frames}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
