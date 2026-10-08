"""Veo version of the film.  python make.py pelmen | frames [n..] | videos [n..] | voice"""
import sys, wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import gem
from google.genai import types

HERE = Path(__file__).parent
STYLE = "a single cinematic film still from a modern high-end 3D animated feature film, soft volumetric lighting, shallow depth of field, 16:9. No text, no letters, no watermark."
WHO = "Use the man from the character sheet exactly (same face, peach baseball cap, dark beard and moustache, colourful neck tattoos, black knitted sweater with a white zigzag pattern, blue jeans, white sneakers)."
PELMEN = "The dumpling must look exactly like the pelmeni in the second reference image: a small pale Russian pelmen, a round ear-shaped ring of dough with its two corners pinched together, smooth, no top knot, not a pouch, not a khinkali, about the size of a walnut."
NOVOICE = " No dialogue, no speech, no narration, no on-screen text."

FRAMES = {
    1: f"{WHO} {PELMEN} Create {STYLE} Wide shot, night, a snowy slope with the twin peaks of Mount Ararat (one large snow-capped peak, one smaller) under a deep blue starry sky and a bright moon. On the right, a single tiny pelmen lies in a small crater in the snow, glowing warm golden light and steaming gently, lighting the snow around it. On the left, the man has just stopped mid-step, staring at it in surprise. Gentle snowfall, blue moonlight against the warm glow.",
    2: f"{WHO} {PELMEN} Create {STYLE} Close-up, night, snowy mountain blurred in the background. The man holds one tiny glowing golden pelmen between his thumb and finger in front of his face, studying it with wide curious eyes; the warm golden glow lights his face and beard. Steam rises from the pelmen.",
    3: f"{WHO} {PELMEN} Create {STYLE} Surreal psychedelic outer space, vivid purple, magenta and teal nebulae. A giant planet shaped exactly like a pelmen, with Saturn-like rings, fills the right side. The man floats weightless in the foreground on the left, arms spread, mouth open in awe, his eyes glowing gold. Tiny pelmeni drift around like moons. In the starry sky, bright stars are connected by thin glowing lines into a constellation in the shape of a pelmen.",
    4: f"{WHO} {PELMEN} Create {STYLE} Cozy home kitchen in Armenia, early morning, warm sunlight through a window that shows Mount Ararat. The man stands behind a big wooden table dusted with flour, his eyes softly glowing gold, a calm blissful smile. His hands are folding a pelmen. The table is covered with neat rows of dozens of small raw pelmeni. A rolling pin, a bowl of minced filling, flour in the air.",
    5: f"{WHO} {PELMEN} Create {STYLE} Wide shot, night, a flat rooftop in Yerevan with city lights and the silhouette of Mount Ararat under a starry sky. In the centre of the roof a white plate piled with steaming pelmeni sits on the ground. Directly above it hovers a small cute flying saucer whose hull is shaped like a pelmen, with a glass dome and little coloured lights, shining a soft teal beam of light down onto the plate. The man stands on the left, looking up at it with a friendly smile, one hand raised in a wave.",
}

VIDEOS = {
    1: "3D animated feature film shot, night on a snowy slope of Mount Ararat. The man in the peach cap stares at the tiny glowing golden dumpling steaming in the snow. He walks slowly toward it, crouches down beside it and leans in, eyes wide with wonder, his face lit by its warm pulsing glow. The dumpling stays tiny and keeps its shape. Slow cinematic push-in. Sound: quiet mountain wind, crunching snow steps, a soft magical hum.",
    2: "3D animated feature film shot, close-up. The man studies the tiny glowing dumpling in his fingers, glances left and right to check nobody is watching, shrugs, then pops it into his mouth and chews with his eyes closed in bliss. He swallows. A warm golden glow travels down his throat, then his eyes snap open, shining bright gold, and golden light floods the frame. Comedic timing. Sound: wind, a small gulp, a rising magical shimmer.",
    3: "3D animated feature film shot, surreal psychedelic space. The man tumbles slowly, weightless, staring in awe at the giant ringed dumpling-shaped planet as it rotates. Small dumpling-shaped flying saucers zip past him. The stars pulse and the constellation lines draw themselves brighter. Colours swirl. Slow camera orbit. Sound: dreamy cosmic synth whoosh, twinkles.",
    4: "3D animated feature film shot, cozy kitchen, morning. The man's eyes glow gold. His hands suddenly move at impossible superhuman speed, a blur, folding dumplings; finished dumplings fly out of his hands and land in neat rows on the table, the pile growing fast, flour puffing into the air. He looks down at his own hands with calm, amused surprise while they keep working by themselves. Comedic. Sound: rapid soft patting and popping sounds, flour puffs.",
    5: "3D animated feature film shot, night rooftop, static wide camera. The flying saucer stays hovering high in the air and never lands. Inside its teal tractor beam the white plate of steaming dumplings slowly floats straight up off the roof, rising higher and higher until it disappears inside the bottom of the saucer. The beam switches off. The roof where the plate stood is now empty. The man waves goodbye, smiling. The saucer then shoots away up into the starry sky and vanishes with a tiny sparkle. Sound: low UFO hum, tractor-beam shimmer, a fast whoosh.",
}

NARRATION = [
    "Однажды ночью на склоне Арарата Алёша нашёл пельмень. Он светился. И был ещё тёплый.",
    "Любой нормальный человек прошёл бы мимо. Алёша его съел.",
    "И увидел всё. Планету Пельме́нию. И древний рецепт, записанный в звёздах.",
    "Проснулся он дома. Руки лепили сами.",
    "С тех пор каждую ночь он оставляет тарелку на крыше. К утру она пустая.",
    "Алёша Пельме́ныч. Рецепт не с этой планеты.",
]


def pelmen():
    gem.image(str(HERE / "pelmen.jpg"), "Product photo on a dark slate background: five small raw Russian pelmeni dumplings, classic handmade shape — each is a round ear-shaped ring of pale dough, a half-moon folded around the filling with its two corners pinched together, smooth surface, no top knot. One of them in the centre glows with warm golden light. Soft studio light. No text.", [])


def frame(n):
    gem.image(str(HERE / f"f{n}.jpg"), FRAMES[n], [str(HERE / "character.jpg"), str(HERE / "pelmen.jpg")])


def clip(n):
    for attempt in range(3):
        try:
            return gem.video(str(HERE / f"s{n}.mp4"), VIDEOS[n] + NOVOICE, str(HERE / f"f{n}.jpg"))
        except (Exception, SystemExit) as e:
            print(f"scene {n} attempt {attempt + 1} failed: {str(e)[:300]}")


def voice():
    style = "Read this in Russian as the narrator of an epic movie trailer: deep, slow, mysterious and completely serious, with dramatic pauses between sentences: "
    for i, text in enumerate(NARRATION):
        resp = gem.client.models.generate_content(
            model="gemini-2.5-pro-preview-tts", contents=style + text,
            config=types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")))))
        pcm = resp.candidates[0].content.parts[0].inline_data.data
        with wave.open(str(HERE / f"voice_{i}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
        print(f"voice_{i}.wav {len(pcm) / 48000:.2f}s")


if __name__ == "__main__":
    cmd, nums = sys.argv[1], [int(x) for x in sys.argv[2:]] or [1, 2, 3, 4, 5]
    if cmd == "pelmen":
        pelmen()
    elif cmd == "voice":
        voice()
    else:
        with ThreadPoolExecutor(3) as ex:
            list(ex.map(frame if cmd == "frames" else clip, nums))
