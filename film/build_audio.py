"""Synthesize music + sound effects, mix with the narration and mux onto video.mp4."""
import json, subprocess, wave
from pathlib import Path

import numpy as np
import imageio_ffmpeg

HERE = Path(__file__).parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
T = json.loads((HERE / "timings.json").read_text(encoding="utf-8"))
total = T["total"]
buf = np.zeros(int((total + 1) * SR))
rng = np.random.default_rng(4)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def add(at, sig, vol=1.0):
    i = int(at * SR)
    if i >= len(buf) or i < 0:
        return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig)] += sig * vol


def fade(sig, a=0.02, r=0.05):
    n = len(sig)
    env = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    env[:na] = np.linspace(0, 1, na)
    env[n - nr:] *= np.linspace(1, 0, nr)
    return sig * env


def gliss(f0, f1, dur):
    t = tt(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def bell(f, dur=1.6):
    t = tt(dur)
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t)) * np.exp(-t * 3.2 / dur * 2)


def noise(dur, smooth=30):
    n = rng.standard_normal(int(dur * SR) + smooth)
    return np.convolve(n, np.ones(smooth) / smooth, mode="valid")[: int(dur * SR)] * 3


def pad(freqs, dur):
    t = tt(dur)
    sig = sum(np.sin(2 * np.pi * f * t + i) * (0.6 + 0.4 * np.sin(2 * np.pi * (0.13 + 0.05 * i) * t + i)) / (1 + i * 0.35) for i, f in enumerate(freqs))
    return fade(sig, 0.7, 0.7)


S = T["scenes"]
PADS = [
    [110, 164.8, 220, 261.6, 329.6],      # night on the mountain
    [98, 146.8, 196, 246.9, 293.7],       # temptation
    [116.5, 174.6, 233.1, 293.7, 349.2],  # the vision
    [130.8, 196, 261.6, 329.6, 392],      # kitchen
    [110, 164.8, 220, 277.2, 329.6],      # the roof
    [130.8, 196, 261.6, 329.6, 392],      # logo
]
for sc, freqs in zip(S, PADS):
    add(sc["start"] - 0.3, pad(freqs, sc["dur"] + 0.6), 0.035)

# 1: falling star, thud, the "!" moment
s, D = S[0]["start"], S[0]["dur"]
add(s + 0.5, fade(gliss(1900, 520, 1.2) * np.linspace(0.2, 1, int(1.2 * SR)), 0.05, 0.03), 0.10)
add(s + 1.7, gliss(110, 45, 0.5) * np.exp(-tt(0.5) * 7), 0.5)
add(s + 1.7, fade(noise(0.5, 60), 0.005, 0.4), 0.12)
for k, f in enumerate([1568, 2093, 1760]):
    add(s + 2.2 + k * 0.5, bell(f, 1.2), 0.03)
add(s + min(D - 2.6, 5.4), bell(1318.5, 0.9), 0.10)

# 2: gulp, then the riser into the vision
s, D = S[1]["start"], S[1]["dur"]
e = min(0.66, max(0.4, (S[1]["subs"][1]["from"] + 0.35) / D)) * D
add(s + e, fade(gliss(420, 170, 0.14), 0.005, 0.03), 0.35)
for k in range(5):
    add(s + e + 0.25 + k * 0.21, fade(noise(0.05, 12), 0.003, 0.03), 0.10)
rd = D - 0.84 * D
add(s + 0.84 * D, fade(gliss(180, 1400, rd) * np.linspace(0, 1, int(rd * SR)) ** 2, 0.05, 0.02), 0.14)
add(s + 0.84 * D, fade(noise(rd, 8) * np.linspace(0, 1, int(rd * SR)) ** 2, 0.05, 0.02), 0.10)

# 3: trippy arpeggio
s, D = S[2]["start"], S[2]["dur"]
scale = [466.2, 523.3, 587.3, 698.5, 784, 932.3, 1046.5, 1174.7]
step = 0.125
for k in range(int((D - 0.4) / step)):
    f = scale[(k * 3 + (k // 8) * 2) % len(scale)] * (2 if k % 5 == 4 else 1)
    note = fade(np.sin(2 * np.pi * f * tt(0.22)) * np.exp(-tt(0.22) * 12), 0.004, 0.02)
    add(s + 0.2 + k * step, note, 0.055)
    add(s + 0.2 + k * step + 0.19, note, 0.022)        # echo
add(s, fade(noise(0.9, 20) * np.linspace(1, 0, int(0.9 * SR)), 0.01, 0.3), 0.12)

# 4: wake-up ding, bouncy bass, one pop per pelmen
s, D = S[3]["start"], S[3]["dur"]
add(s + 0.5, bell(1046.5, 1.0), 0.09)
for k in range(int((D - 0.9) / 0.2)):
    f = [130.8, 196, 164.8, 196][k % 4]
    add(s + 0.9 + k * 0.2, fade(np.sin(2 * np.pi * f * tt(0.16)) * np.exp(-tt(0.16) * 14), 0.004, 0.02), 0.12)
N, span = 36, D - 2.1
for i in range(N):
    born = 0.9 + span * (i / N) ** 0.75
    add(s + born + 0.28, fade(gliss(500 + i * 22, 900 + i * 30, 0.06), 0.003, 0.02), 0.07)

# 5: saucer hum, beam shimmer, zip away
s, D = S[4]["start"], S[4]["dur"]
tz = D - 1.5
hd = tz - 0.5
t = tt(hd)
hum = np.sin(2 * np.pi * 150 * t + 4 * np.sin(2 * np.pi * 7 * t)) + 0.5 * np.sin(2 * np.pi * 301 * t + 3 * np.sin(2 * np.pi * 7 * t))
add(s + 0.5, fade(hum, 0.8, 0.2), 0.045)
bd = tz - 0.45 - 1.7
t = tt(bd)
add(s + 1.7, fade(np.sin(2 * np.pi * 880 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) + np.sin(2 * np.pi * 1320 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * t)), 0.3, 0.3), 0.022)
add(s + tz, fade(gliss(300, 3200, 0.4), 0.01, 0.05), 0.12)
add(s + tz + 0.45, bell(2093, 1.0), 0.06)

# 6: logo chord
s = S[5]["start"]
for k, f in enumerate([261.6, 392, 523.3, 659.3, 784, 1046.5]):
    add(s + 0.15 + k * 0.07, bell(f, 3.2), 0.085 - k * 0.006)
add(s + 0.1, gliss(120, 40, 0.8) * np.exp(-tt(0.8) * 4), 0.35)

buf = buf[: int(total * SR)]
buf[-int(0.6 * SR):] *= np.linspace(1, 0, int(0.6 * SR))
buf = np.tanh(buf * 1.6) * 0.8
with wave.open(str(HERE / "bed.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((buf * 32767).astype(np.int16).tobytes())

# mix narration over the bed and mux with the picture
cmd = [FFMPEG, "-y", "-i", str(HERE / "video.mp4"), "-i", str(HERE / "bed.wav")]
filt = []
for i, sc in enumerate(S):
    cmd += ["-i", str(HERE / f"voice_{i}.mp3")]
    ms = int((sc["start"] + sc["voiceAt"]) * 1000)
    filt.append(f"[{i + 2}:a]adelay={ms}:all=1,volume=1.5[v{i}]")
filt.append("[1:a]volume=0.9[bed]")
filt.append("[bed]" + "".join(f"[v{i}]" for i in range(len(S))) + f"amix=inputs={len(S) + 1}:normalize=0,alimiter=limit=0.95,aformat=sample_rates=44100:channel_layouts=stereo[a]")
out = HERE.parent / "alyosha-pelmenych.mp4"
cmd += ["-filter_complex", ";".join(filt), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", str(total), "-movflags", "+faststart", str(out)]
subprocess.run(cmd, check=True, capture_output=True)
print("wrote", out)
