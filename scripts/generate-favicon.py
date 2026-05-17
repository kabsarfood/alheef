#!/usr/bin/env python3
"""Generate Al-Haif favicons from logo (symbol only)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "logo-source.png"
OUT = ROOT / "public" / "assets"

# Fallback: Cursor-uploaded asset path
CURSOR_SRC = Path(
    r"C:\Users\USER\.cursor\projects\c-Users-USER-Desktop-ALHEEF\assets"
    r"\c__Users_USER_AppData_Roaming_Cursor_User_workspaceStorage_903b2233186f19f262e6edb916dd1e14_images"
    r"_________________1-b9696d21-faca-498a-ac39-088ac95a739d.png"
)

NAVY = (30, 42, 56, 255)


def find_source():
    if SRC.exists():
        return SRC
    if CURSOR_SRC.exists():
        return CURSOR_SRC
    raise FileNotFoundError("Logo source not found")


def remove_dark_bg(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r < 40 and g < 40 and b < 40:
                pixels[x, y] = (r, g, b, 0)
    return img


def crop_symbol(img: Image.Image) -> Image.Image:
    w, h = img.size
    # الرمز في الثلث العلوي تقريباً
    top = int(h * 0.01)
    bottom = int(h * 0.48)
    cropped = img.crop((0, top, w, bottom))
    cropped = remove_dark_bg(cropped)

    # قص مربع حول المحتوى
    bbox = cropped.getbbox()
    if not bbox:
        return cropped
    symbol = cropped.crop(bbox)
    pad = int(max(symbol.size) * 0.08)
    side = max(symbol.size) + pad * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - symbol.width) // 2
    oy = (side - symbol.height) // 2
    canvas.paste(symbol, (ox, oy), symbol)
    return canvas


def save_sizes(symbol: Image.Image):
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {
        "favicon-16.png": 16,
        "favicon-32.png": 32,
        "favicon-48.png": 48,
        "favicon.png": 192,
        "apple-touch-icon.png": 180,
        "favicon-512.png": 512,
    }
    for name, size in sizes.items():
        out = symbol.resize((size, size), Image.Resampling.LANCZOS)
        # خلفية كحلية خفيفة للمقاسات الصغيرة جداً (وضوح على تبويب فاتح)
        if size <= 32:
            bg = Image.new("RGBA", (size, size), NAVY)
            bg.paste(out, (0, 0), out)
            bg.save(OUT / name, optimize=True)
        else:
            out.save(OUT / name, optimize=True)
        print(f"  ✓ {name} ({size}px)")

    # ICO متعدد الأحجام
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico_images = [symbol.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
    ico_path = OUT / "favicon.ico"
    ico_images[0].save(
        ico_path,
        format="ICO",
        sizes=[(i.width, i.height) for i in ico_images],
        append_images=ico_images[1:],
    )
    print(f"  ✓ favicon.ico")


def main():
    source = find_source()
    if not SRC.exists():
        SRC.parent.mkdir(parents=True, exist_ok=True)
        Image.open(source).save(SRC)
        print(f"Copied source → {SRC}")

    img = Image.open(source)
    print(f"Source: {source} ({img.size[0]}x{img.size[1]})")
    symbol = crop_symbol(img)
    print("Generating favicons...")
    save_sizes(symbol)
    print(f"Done → {OUT}")


if __name__ == "__main__":
    main()
