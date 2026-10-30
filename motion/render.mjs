#!/usr/bin/env node
// Frame-by-frame renderer for README videos and trailers.
//
//   node motion/render.mjs <scene> [options]
//
//   --scale 1.5          render resolution = scene size × scale (1280x720 → 1920x1080)
//   --fps 60             output frame rate (default: the scene's fps)
//   --shutter 2          motion blur: N sub-frames per output frame, averaged by ffmpeg
//   --video              MP4 mode: JPEG frames, film grain on, soundtrack muxed if the scene has `music`
//   --gif 880            README GIF of this width        (--gif-fps 24, --lossy 30)
//   --webp 960           README animated WebP of this width (--webp-fps 20, --webp-q 70)
//   --from 0 --to 12     time range for the GIF/WebP (default: whole scene)
//   --card 440           small GIF for the profile grid (--card-fps 15)
//   --poster 4.5         also save the frame at this second as PNG
//   --still 2.5,7        only render single PNG frames at these seconds
//   --out dir            output directory (default motion/out)
//
// Every frame is drawn by the scene's draw(ctx, t) on a <canvas> in headless
// Chromium. The soundtrack comes from audio/synth.py and the scene's `music` score.
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
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
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

function trim(from, to) {
  return from !== undefined || to !== undefined ? `trim=start=${from || 0}${to !== undefined ? `:end=${to}` : ''},setpts=PTS-STARTPTS,` : '';
}

// Image sequences need a frame rate; a video file carries its own.
const inputArgs = (input, fps) => (input.endsWith('.mp4') ? ['-i', input] : ['-framerate', String(fps), '-i', input]);

function gif(input, srcFps, fps, width, out, lossy, range) {
  const vf = `${trim(range.from, range.to)}fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
    `[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`;
  ff([...inputArgs(input, srcFps), '-vf', vf, '-loop', '0', out]);
  try { execFileSync('gifsicle', ['-O3', `--lossy=${lossy}`, '--batch', out]); }
  catch { console.warn('  gifsicle not found; GIF left unoptimised'); }
}

function webp(input, srcFps, fps, width, out, q, range) {
  const vf = `${trim(range.from, range.to)}fps=${fps},scale=${width}:-1:flags=lanczos`;
  ff([...inputArgs(input, srcFps), '-vf', vf, '-c:v', 'libwebp_anim', '-lossless', '0',
    '-q:v', String(q), '-compression_level', '6', '-loop', '0', '-preset', 'picture', out]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = args._[0];
  if (!name) { console.error('usage: render.mjs <scene> [options]'); process.exit(1); }
  const scale = parseFloat(args.scale || '1');
  const shutter = parseInt(args.shutter || '1', 10);
  const video = !!args.video;
  const outDir = path.resolve(args.out || path.join(here, 'out'));
  const workers = parseInt(args.workers || String(Math.max(1, os.cpus().length)), 10);
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve(here);
  const port = server.address().port;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();

  const open = async (fps) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('  page error:', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('  console:', m.text()));
    const q = `render&scene=${name}&scale=${scale}${fps ? `&fps=${fps}` : ''}${video ? '&video=1' : ''}`;
    await page.goto(`http://127.0.0.1:${port}/engine/stage.html?${q}`);
    await page.waitForFunction('window.ready === true', null, { timeout: 60000 });
    return page;
  };
  const save = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

  // --still: single PNGs at given seconds.
  if (args.still !== undefined) {
    const page = await open(1000);
    for (const t of String(args.still).split(',').map(Number)) {
      const file = path.join(outDir, `${name}@${t}.png`);
      save(await page.evaluate((i) => window.frame(i), Math.round(t * 1000)), file);
      console.log(file);
    }
    await browser.close(); server.close();
    return;
  }

  const probe = await open();
  const meta0 = await probe.evaluate(() => window.meta);
  await probe.close();
  const fps = parseFloat(args.fps || meta0.fps);
  const renderFps = fps * shutter;
  const total = Math.round(meta0.duration * renderFps);
  const ext = video ? 'jpg' : 'png';
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), `frames-${name}-`));
  const t0 = Date.now();
  console.log(`${name}: ${meta0.width}x${meta0.height} ×${scale} · ${meta0.duration}s @ ${fps}fps` +
    `${shutter > 1 ? ` (×${shutter} sub-frames)` : ''} = ${total} renders · ${workers} workers`);

  const pages = await Promise.all(Array.from({ length: workers }, () => open(renderFps)));
  let next = 0;
  await Promise.all(pages.map(async (page) => {
    while (next < total) {
      const i = next++;
      save(await page.evaluate(([k, ty]) => window.frame(k, ty), [i, video ? 'jpeg' : 'png']),
        path.join(frames, `f${String(i).padStart(5, '0')}.${ext}`));
    }
  }));
  await browser.close(); server.close();
  console.log(`  frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const input = path.join(frames, `f%05d.${ext}`);
  const blur = shutter > 1 ? `tmix=frames=${shutter},fps=${fps},` : '';
  const silent = path.join(frames, 'silent.mp4');
  ff(['-framerate', String(renderFps), '-i', input, '-vf', `${blur}scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
    '-c:v', 'libx264', '-crf', video ? '21' : '18', '-preset', 'slow', '-movflags', '+faststart', silent]);

  const mp4 = path.join(outDir, `${name}.mp4`);
  if (meta0.music && (video || args.music)) {
    const scoreFile = path.join(frames, 'score.json');
    fs.writeFileSync(scoreFile, JSON.stringify({ length: meta0.duration, ...meta0.music }));
    const wav = path.join(outDir, `${name}.wav`);
    const py = process.env.MOTION_PYTHON || 'python3';
    execFileSync(py, [path.join(here, 'audio', 'synth.py'), scoreFile, wav], { stdio: 'inherit' });
    ff(['-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', mp4]);
    console.log(`  ${wav} (${kb(wav)})`);
  } else {
    fs.copyFileSync(silent, mp4);
  }
  console.log(`  ${mp4} (${kb(mp4)})`);

  const range = { from: args.from !== undefined ? parseFloat(args.from) : undefined, to: args.to !== undefined ? parseFloat(args.to) : undefined };
  // README loops come from the motion-blurred MP4, so they get the blur for free.
  if (args.gif) {
    const g = path.join(outDir, `${name}.gif`);
    gif(silent, fps, parseFloat(args['gif-fps'] || '24'), parseInt(args.gif, 10), g, parseInt(args.lossy || '30', 10), range);
    console.log(`  ${g} (${kb(g)})`);
  }
  if (args.webp) {
    const w = path.join(outDir, `${name}.webp`);
    webp(silent, fps, parseFloat(args['webp-fps'] || '20'), parseInt(args.webp, 10), w, parseInt(args['webp-q'] || '70', 10), range);
    console.log(`  ${w} (${kb(w)})`);
  }
  if (args.card) {
    const c = path.join(outDir, `${name}-card.gif`);
    gif(silent, fps, parseFloat(args['card-fps'] || '15'), parseInt(args.card, 10), c, parseInt(args['card-lossy'] || '60', 10), range);
    console.log(`  ${c} (${kb(c)})`);
  }
  if (args['card-webp']) {
    const c = path.join(outDir, `${name}-card.webp`);
    webp(silent, fps, parseFloat(args['card-fps'] || '15'), parseInt(args['card-webp'], 10), c, parseInt(args['webp-q'] || '62', 10), range);
    console.log(`  ${c} (${kb(c)})`);
  }
  if (args.poster !== undefined) {
    const p = path.join(outDir, `${name}-poster.png`);
    ff(['-ss', String(args.poster), '-i', silent, '-frames:v', '1', p]);
    console.log(`  ${p}`);
  }
  if (!args['keep-frames']) fs.rmSync(frames, { recursive: true, force: true });
  else console.log(`  frames kept in ${frames}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
