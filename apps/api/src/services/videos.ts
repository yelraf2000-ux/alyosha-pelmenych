import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// Product videos: uploaded in the admin (a clip straight from a phone), converted here to a small
// MP4 every browser plays, and stored under <uploads>/videos next to a poster picture.
//
//   <id>-<width>x<height>.mp4    H.264, at most 720 px on the short side, 30 fps, no sound
//   <id>-<width>x<height>.webp   the poster shown before the buyer presses play
//
// The frame size is in the name so the page can reserve the right space before anything loads.
// Sound is removed on purpose: clips made for social networks often carry music the shop
// has no right to publish.

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_SECONDS = 60;
const SHORT_SIDE = 720;
/** A stuck conversion must not hold the single slot forever. */
const TIMEOUT_MS = 5 * 60 * 1000;
const PUBLIC_PATH = /^\/uploads\/videos\/([a-f0-9]{16}-\d+x\d+)\.mp4$/;

export class InvalidVideoError extends Error {}
export class VideoBusyError extends Error {}

// Converting takes a whole CPU core for up to a minute or two; the shop runs on a one-core server.
let converting = false;

function ffmpeg(args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg is not available on this platform'));
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      // Enough to read the stream description or an error message; never unbounded.
      if (stderr.length < 64_000) stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}

/** What ffmpeg says about a file. Running it with no output prints the description and exits. */
async function describe(file: string): Promise<{ seconds: number; width: number; height: number; hasAudio: boolean } | null> {
  const { stderr } = await ffmpeg(['-i', file]);
  const duration = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const video = /Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(stderr);
  if (!duration || !video) return null;
  return {
    seconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
    width: Number(video[1]),
    height: Number(video[2]),
    hasAudio: /Stream #[^\n]*Audio:/.test(stderr),
  };
}

/**
 * Converts the uploaded file at `inputPath` and returns the public path of the MP4,
 * which is what `products.video_path` stores.
 */
export async function saveProductVideo(uploadsDir: string, inputPath: string): Promise<string> {
  if (converting) throw new VideoBusyError('another video is being converted');
  converting = true;

  const dir = join(uploadsDir, 'videos');
  const id = randomBytes(8).toString('hex');
  const workVideo = join(dir, `${id}.part.mp4`);
  const workFrame = join(dir, `${id}.part.jpg`);

  try {
    // A still picture also "has a video stream"; a real clip lasts a little longer than one frame.
    const source = await describe(inputPath);
    if (!source || source.seconds < 0.3) throw new InvalidVideoError('not a video');

    await mkdir(dir, { recursive: true });

    // Shrink so the short side is at most 720 px, never enlarge, keep both sides even (H.264 needs that).
    const even = (side: string) => `trunc(min(${SHORT_SIDE},${side})/2)*2`;
    const scale = `scale=w='if(gt(iw,ih),-2,${even('iw')})':h='if(gt(iw,ih),${even('ih')},-2)'`;
    const converted = await ffmpeg([
      '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-t', String(MAX_SECONDS),
      '-an',
      '-vf', `fps=30,${scale},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-profile:v', 'main',
      '-movflags', '+faststart',
      workVideo,
    ]);
    if (!converted.ok) throw new InvalidVideoError(`conversion failed: ${converted.stderr.slice(0, 300)}`);

    const result = await describe(workVideo);
    if (!result) throw new InvalidVideoError('conversion produced no video');

    // The poster: a frame from a moment in, because the very first frame is often black or blurred.
    const moment = Math.min(1, result.seconds / 2).toFixed(2);
    const framed = await ffmpeg(['-loglevel', 'error', '-y', '-ss', moment, '-i', workVideo, '-frames:v', '1', '-q:v', '3', workFrame]);
    if (!framed.ok) throw new InvalidVideoError('could not take a poster frame');

    const name = `${id}-${result.width}x${result.height}`;
    // Read into memory first: sharp keeps a file it opened by path locked for a while on Windows.
    await sharp(await readFile(workFrame)).webp({ quality: 78 }).toFile(join(dir, `${name}.webp`));
    await rename(workVideo, join(dir, `${name}.mp4`));
    return `/uploads/videos/${name}.mp4`;
  } finally {
    converting = false;
    await Promise.all([workVideo, workFrame].map((file) => unlink(file).catch(() => undefined)));
  }
}

export async function deleteProductVideo(uploadsDir: string, publicPath: string | null): Promise<void> {
  const match = publicPath ? PUBLIC_PATH.exec(publicPath) : null;
  if (!match) return;
  const dir = join(uploadsDir, 'videos');
  await Promise.all(['mp4', 'webp'].map((ext) => unlink(join(dir, `${match[1]}.${ext}`)).catch(() => undefined)));
}
