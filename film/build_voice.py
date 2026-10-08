"""Generate the narration (one mp3 per scene) and derive scene timings from its length."""
import asyncio, json, re, subprocess
from pathlib import Path

import edge_tts
import imageio_ffmpeg

HERE = Path(__file__).parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE, RATE, PITCH = "ru-RU-DmitryNeural", "+12%", "-8Hz"

# One entry per scene: narration text and the minimum time the picture needs.
SCENES = [
    ("Однажды ночью на склоне Арарата Алёша нашёл пельмень. Он светился. И был ещё тёплый.", 7.0),
    ("Любой нормальный человек прошёл бы мимо. Алёша его съел.", 5.5),
    ("И увидел всё. Планету Пельмению. И древний рецепт, записанный в звёздах.", 6.5),
    ("Проснулся он дома. Руки лепили сами.", 5.0),
    ("С тех пор каждую ночь он оставляет тарелку на крыше. К утру она пустая.", 6.5),
    ("Алёша Пельменыч. Рецепт не с этой планеты.", 5.0),
]
LEAD = 0.6                              # silence before the voice inside a scene
TAILS = [0.4, 1.6, 0.5, 1.0, 0.9, 1.4]  # picture time after the voice ends, per scene


def duration(path):
    err = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="ignore").stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


async def main():
    t, scenes = 0.0, []
    for i, (text, min_len) in enumerate(SCENES):
        mp3 = HERE / f"voice_{i}.mp3"
        for attempt in range(8):   # the service intermittently returns no audio
            try:
                await edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH).save(str(mp3))
                break
            except edge_tts.exceptions.NoAudioReceived:
                await asyncio.sleep(1.5)
        else:
            raise SystemExit(f"no audio for scene {i}")
        vdur = duration(mp3)
        dur = round(max(min_len, LEAD + vdur + TAILS[i]), 2)
        # subtitles: one sentence at a time, timed by its share of the characters
        parts, at, total = re.findall(r"[^.!?]+[.!?]", text), LEAD, len(text)
        subs = []
        for p in parts:
            d = vdur * len(p) / total
            subs.append({"text": p.strip(), "from": round(at, 2), "to": round(at + d, 2)})
            at += d
        scenes.append({"start": round(t, 2), "dur": dur, "voiceAt": LEAD, "voiceDur": round(vdur, 2), "subs": subs})
        t += dur
    data = {"total": round(t, 2), "scenes": scenes}
    (HERE / "timings.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (HERE / "timings.js").write_text("window.TIMINGS = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(json.dumps([(s["start"], s["dur"], s["voiceDur"]) for s in scenes]), "total", data["total"])


asyncio.run(main())
