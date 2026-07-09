#!/usr/bin/env python3
"""Generate Al-Haif app icons from the official squircle logo."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "app-icon-source.png"
OUT = ROOT / "public" / "assets"

CURSOR_SRC = Path(
    r"C:\Users\USER\.cursor\projects\c-Users-USER-Desktop-ALHEEF\assets"
    r"\c__Users_USER_AppData_Roaming_Cursor_User_workspaceStorage_903b2233186f19f262e6edb916dd1e14_images"
    r"_______________-7a9bf506-3d05-444a-b642-7833a75c315e.png"
)

NAVY = (30, 42, 56, 255)


def find_source():
    if SRC.exists():
        return SRC
    if CURSOR_SRC.exists():
        return CURSOR_SRC
    raise FileNotFoundError("App icon source not found")


def prepare_icon(img: Image.Image) -> Image.Image:
    """Use the full squircle logo, centered on a square canvas."""
    img = img.convert("RGBA")
    w, h = img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


def resize_icon(icon: Image.Image, size: int) -> Image.Image:
    return icon.resize((size, size), Image.Resampling.LANCZOS)


def maskable_icon(icon: Image.Image, size: int) -> Image.Image:
    """Safe zone ~80% for Android maskable icons."""
    canvas = Image.new("RGBA", (size, size), NAVY)
    inner = int(size * 0.80)
    scaled = resize_icon(icon, inner)
    offset = (size - inner) // 2
    canvas.paste(scaled, (offset, offset), scaled)
    return canvas


def save_sizes(icon: Image.Image):
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {
        "favicon-16.png": 16,
        "favicon-32.png": 32,
        "favicon-48.png": 48,
        "favicon.png": 192,
        "apple-touch-icon.png": 180,
        "favicon-512.png": 512,
        "icon-192.png": 192,
        "icon-512.png": 512,
        "app-icon.png": 128,
    }
    for name, size in sizes.items():
        out = resize_icon(icon, size)
        out.save(OUT / name, optimize=True)
        print(f"  ok {name} ({size}px)")

    maskable = maskable_icon(icon, 512)
    maskable.save(OUT / "icon-maskable-512.png", optimize=True)
    print("  ok icon-maskable-512.png (512px)")

    ico_sizes = [16, 32, 48]
    ico_images = [resize_icon(icon, s) for s in ico_sizes]
    ico_path = OUT / "favicon.ico"
    ico_images[0].save(
        ico_path,
        format="ICO",
        sizes=[(i.width, i.height) for i in ico_images],
        append_images=ico_images[1:],
    )
    print("  ok favicon.ico")


def main():
    source = find_source()
    if not SRC.exists():
        SRC.parent.mkdir(parents=True, exist_ok=True)
        Image.open(source).save(SRC)
        print(f"Copied source -> {SRC}")

    img = Image.open(source)
    print(f"Source: {source} ({img.size[0]}x{img.size[1]})")
    icon = prepare_icon(img)
    print("Generating app icons...")
    save_sizes(icon)
    print(f"Done -> {OUT}")


if __name__ == "__main__":
    main()
