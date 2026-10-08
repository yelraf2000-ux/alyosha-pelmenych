"""Gemini helpers for the cartoon: still images (character sheet, keyframes) and Veo clips.

  python gem.py image <out.png> <prompt.txt> [ref1.png ref2.png ...]
  python gem.py video <out.mp4> <prompt.txt> [first_frame.png]
"""
import os, sys, time, winreg
from pathlib import Path

from google import genai
from google.genai import types

IMAGE_MODEL = "gemini-3-pro-image"
VIDEO_MODEL = os.environ.get("VEO_MODEL", "veo-3.1-fast-generate-preview")
NEGATIVE = "text, subtitles, captions, watermark, logo, letters, speech, dialogue, narration, voice-over, singing"


def api_key():
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:   # set after this shell started
        return winreg.QueryValueEx(k, "GEMINI_API_KEY")[0]


client = genai.Client(api_key=api_key())


def mime(p):
    return {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}[Path(p).suffix[1:].lower()]


def image(out, prompt, refs):
    contents = [types.Part.from_bytes(data=Path(r).read_bytes(), mime_type=mime(r)) for r in refs] + [prompt]
    resp = client.models.generate_content(
        model=IMAGE_MODEL, contents=contents,
        config=types.GenerateContentConfig(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio="16:9")))
    for part in resp.candidates[0].content.parts:
        if part.inline_data:
            Path(out).write_bytes(part.inline_data.data)
            print("wrote", out, part.inline_data.mime_type)
            return
    raise SystemExit(f"no image returned: {resp}")


def video(out, prompt, first_frame):
    kw = {}
    if first_frame:
        kw["image"] = types.Image(image_bytes=Path(first_frame).read_bytes(), mime_type=mime(first_frame))
    op = client.models.generate_videos(
        model=VIDEO_MODEL, prompt=prompt,
        config=types.GenerateVideosConfig(aspect_ratio="16:9", resolution="720p", duration_seconds=8, negative_prompt=NEGATIVE), **kw)
    while not op.done:
        time.sleep(10)
        op = client.operations.get(op)
    if op.error or not op.response or not op.response.generated_videos:
        raise SystemExit(f"video failed: {op.error or op.response}")
    v = op.response.generated_videos[0].video
    client.files.download(file=v)
    v.save(out)
    print("wrote", out, "model", VIDEO_MODEL)


if __name__ == "__main__":
    kind, out, prompt_file, *rest = sys.argv[1:]
    prompt = Path(prompt_file).read_text(encoding="utf-8")
    image(out, prompt, rest) if kind == "image" else video(out, prompt, rest[0] if rest else None)
