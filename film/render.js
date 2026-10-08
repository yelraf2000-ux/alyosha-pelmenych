// Renders film.html frame by frame in headless Chrome and pipes the frames into ffmpeg.
// Usage: node render.js            -> full video (video.mp4, no sound)
//        node render.js stills     -> one PNG per check time into ./stills
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const FPS = 30;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const timings = JSON.parse(fs.readFileSync(path.join(__dirname, 'timings.json'), 'utf8'));
const stillsMode = process.argv[2] === 'stills';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await page.goto('file:///' + path.join(__dirname, 'film.html').replace(/\\/g, '/') + '?capture=1');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { renderAt(0); return document.fonts.ready; });

  if (stillsMode) {
    const dir = path.join(__dirname, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const times = process.argv.slice(3).map(Number);
    for (const t of times) {
      await page.evaluate(t => renderAt(t), t);
      await page.screenshot({ path: path.join(dir, `t${t.toFixed(1)}.jpg`), type: 'jpeg', quality: 80 });
    }
    await browser.close();
    return;
  }

  const ffmpeg = execSync('python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"').toString().trim();
  const out = path.join(__dirname, 'video.mp4');
  const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'inherit'] });

  const frames = Math.round(timings.total * FPS);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => renderAt(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('done', out);
})();
