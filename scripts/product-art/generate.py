"""Generates product illustrations with Gemini (the same setup as film/gem.py).

NOT USED YET, AND NEVER RUN SUCCESSFULLY: when this was written the Gemini account had no credit
left, so no picture came back and the prompts are untried. The illustrations on the site are
drawn by draw.mjs instead. This is here for when the account is topped up.

These must stay drawings, on purpose: the shop must not show generated pictures that could pass
for photos of the real food. Real photos uploaded in the admin replace them one by one.

  python scripts/product-art/generate.py <out-dir>            all products
  python scripts/product-art/generate.py <out-dir> <slug>...  only these

The first product in the list is drawn first and then given to every other request as the
style reference, so the set looks like one series. The PNG files it writes still have to be
resized, put into apps/web/public/products, and set as the products' image_path.

Needs GEMINI_API_KEY (environment, or the Windows user environment) and `pip install google-genai`.
"""
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types

IMAGE_MODEL = "gemini-3-pro-image"

STYLE = (
    "A cute flat illustration for an online food shop, drawn like a friendly logo: clean vector look, "
    "soft cel shading, thick warm-brown outlines, dough in pale cream-yellow with soft highlights. "
    "A round white plate seen from above at a slight three-quarter angle, centred, with a soft shadow under it. "
    "Plain {background} background with nothing else on it. "
    "No text, no letters, no labels, no watermark, no hands, no people, no cutlery, no steam. "
    "Clearly a drawn illustration, not a photograph. Landscape 4:3 picture with generous empty margin around the plate."
)

PELMENI = (
    "On the plate: about twelve small pelmeni, Russian dumplings. Each is a small round of dough folded over the "
    "filling and bent so its two ends are pinched together, like a little round ear. They are piled neatly."
)
MANTY = (
    "On the plate: exactly six manty, large steamed dumplings. Each is a plump square pouch of dough whose four "
    "corners are pinched together on top into a cross-shaped seam. Six of them, arranged in a ring."
)
KHINKALI = (
    "On the plate: exactly six khinkali, large Georgian dumplings. Each is a plump round pouch with many fine pleats "
    "gathered into a short twisted knob on top. Six of them, arranged in a ring."
)

CHICKEN = "one small cartoon chicken drumstick"
BEEF = "one small cut of raw red beef with a thin white fat edge and a few black peppercorns"

BLUE, PEACH, LAVENDER = "very light sky-blue", "very light peach", "very light lavender"

# slug -> (what is on the plate, the ingredient hint beside it, background)
PRODUCTS = {
    "pelmeni-govyazhi": (PELMENI, BEEF, BLUE),
    "pelmeni-kurinye-iz-bedra": (PELMENI, CHICKEN, BLUE),
    "pelmeni-kurinye-slivochno-syrnye": (PELMENI, "a small wedge of yellow cheese and a tiny jug of cream", BLUE),
    "pelmeni-kurinye-s-krevetkoy": (PELMENI, "two small pink shrimp", BLUE),
    "pelmeni-govyazhi-s-zelenyu": (PELMENI, BEEF + ", and sprigs of fresh dill and parsley", BLUE),
    "manty-kurinye": (MANTY, CHICKEN, PEACH),
    "manty-govyazhi": (MANTY, BEEF, PEACH),
    "hinkali-govyazhi": (KHINKALI, BEEF, LAVENDER),
    "hinkali-svino-govyazhi": (
        KHINKALI,
        "one small cut of raw pink pork and one small cut of raw red beef, side by side, with a few black peppercorns",
        LAVENDER,
    ),
}
ANCHOR = next(iter(PRODUCTS))


def api_key():
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    import winreg  # set in the user environment after this shell started

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
        return winreg.QueryValueEx(key, "GEMINI_API_KEY")[0]


def prompt_for(slug, with_reference):
    subject, hint, background = PRODUCTS[slug]
    parts = [STYLE.format(background=background), subject, f"Beside the plate, small, as a hint of the filling: {hint}."]
    if with_reference:
        parts.append(
            "Match the attached reference picture exactly in drawing style, outline weight, colours, plate and "
            "camera angle. Change only what is on the plate, the hint beside it and the background colour."
        )
    return " ".join(parts)


def generate(client, slug, out_dir, reference):
    contents = []
    if reference:
        contents.append(types.Part.from_bytes(data=reference.read_bytes(), mime_type="image/png"))
    contents.append(prompt_for(slug, bool(reference)))
    response = client.models.generate_content(
        model=IMAGE_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio="4:3")
        ),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            out = out_dir / f"{slug}.png"
            out.write_bytes(part.inline_data.data)
            print("wrote", out)
            return out
    raise SystemExit(f"no image returned for {slug}: {response}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    wanted = sys.argv[2:] or list(PRODUCTS)
    unknown = [slug for slug in wanted if slug not in PRODUCTS]
    if unknown:
        raise SystemExit(f"unknown products: {', '.join(unknown)}")

    client = genai.Client(api_key=api_key())
    anchor = out_dir / f"{ANCHOR}.png"
    if ANCHOR in wanted or not anchor.exists():
        generate(client, ANCHOR, out_dir, None)
    for slug in wanted:
        if slug != ANCHOR:
            generate(client, slug, out_dir, anchor)


if __name__ == "__main__":
    main()
