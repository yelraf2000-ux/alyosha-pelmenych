"""Cut the Veo clips to the narration, add subtitles and the logo ending -> ../../alyosha-pelmenych-veo.mp4"""
import json, re, shutil, subprocess, sys, wave
from pathlib import Path

import imageio_ffmpeg

sys.path.insert(0, str(Path(__file__).parent))
from make import NARRATION

HERE = Path(__file__).parent
FILM = HERE.parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
TEMPO, LEAD, TAIL = 1.15, 0.5, 0.5        # narration speed-up, silence before / after the voice in a scene
CLIP = 8.0
SFX_VOL, VOICE_VOL = 0.4, 1.7

old = json.loads((FILM / "timings.json").read_text(encoding="utf-8"))   # the coded film: its last scene is the logo
logo_from = old["scenes"][5]["start"]


def wav_len(p):
    with wave.open(str(p)) as w:
        return w.getnframes() / w.getframerate()


if not (HERE / "font.ttf").exists():
    shutil.copy("C:/Windows/Fonts/arialbd.ttf", HERE / "font.ttf")

inputs, filt, vlabels, alabels, voices, subs = [], [], [], [], [], []
t = 0.0
for i in range(6):
    vd = wav_len(HERE / f"voice_{i}.wav") / TEMPO
    dur = round(max(CLIP if i < 5 else 0, LEAD + vd + TAIL), 3)
    if i < 5:
        k = dur / CLIP                                      # stretch the clip a little when the narration needs more time
        inputs += ["-i", f"s{i + 1}.mp4"]
        filt.append(f"[{i}:v]setpts={k:.4f}*PTS,fps=30,scale=1280:720,format=yuv420p,trim=duration={dur},setpts=PTS-STARTPTS[v{i}]")
        filt.append(f"[{i}:a]atempo={1 / k:.4f},atrim=duration={dur},asetpts=PTS-STARTPTS,volume={SFX_VOL},aformat=sample_rates=44100:channel_layouts=stereo[a{i}]")
        text, total, at = NARRATION[i].replace("\u0301", ""), len(NARRATION[i]), LEAD
        for j, part in enumerate(re.findall(r"[^.!?]+[.!?]", text)):
            d = vd * len(part) / total
            (HERE / f"sub_{i}_{j}.txt").write_text(part.strip(), encoding="utf-8")
            subs.append((f"sub_{i}_{j}.txt", t + at, t + at + d))
            at += d
    else:
        inputs += ["-ss", str(logo_from), "-t", str(dur), "-i", "../video.mp4", "-ss", str(logo_from), "-t", str(dur), "-i", "../bed.wav"]
        filt.append(f"[5:v]fps=30,scale=1280:720,format=yuv420p,setpts=PTS-STARTPTS[v5]")
        filt.append(f"[6:a]apad=whole_dur={dur},aformat=sample_rates=44100:channel_layouts=stereo[a5]")
    vlabels.append(f"[v{i}]"); alabels.append(f"[a{i}]")
    voices.append((i, t + LEAD))
    t += dur
total = t

filt.append("".join(vlabels) + "concat=n=6:v=1:a=0[vcat]")
chain = "[vcat]"
for n, (f, a, b) in enumerate(subs):
    filt.append(f"{chain}drawtext=fontfile=font.ttf:textfile={f}:fontsize=34:fontcolor=white:borderw=3:bordercolor=black@0.75:x=(w-text_w)/2:y=h-78:enable='between(t,{a:.2f},{b + 0.1:.2f})'[d{n}]")
    chain = f"[d{n}]"
filt.append(f"{chain}fade=t=in:st=0:d=0.5[v]")
filt.append("".join(alabels) + "concat=n=6:v=0:a=1[sfx]")
base = 7
for n, (i, at) in enumerate(voices):
    inputs += ["-i", f"voice_{i}.wav"]
    filt.append(f"[{base + n}:a]atempo={TEMPO},adelay={int(at * 1000)}:all=1,volume={VOICE_VOL}[n{n}]")
filt.append("[sfx]" + "".join(f"[n{n}]" for n in range(6)) + "amix=inputs=7:normalize=0,alimiter=limit=0.95,aformat=sample_rates=44100:channel_layouts=stereo[a]")

out = FILM.parent / "alyosha-pelmenych-veo.mp4"
cmd = [FFMPEG, "-y", *inputs, "-filter_complex", ";".join(filt), "-map", "[v]", "-map", "[a]",
       "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart", str(out)]
r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, encoding="utf-8", errors="ignore")
if r.returncode:
    raise SystemExit(r.stderr[-3000:])
print(f"wrote {out}  {total:.1f}s")
