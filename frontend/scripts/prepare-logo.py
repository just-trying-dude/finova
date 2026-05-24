"""Prepare finova logo assets: transparent mark + squircle favicons."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

PUBLIC = Path(__file__).resolve().parents[1] / "public"
SOURCE = PUBLIC / "finova-logo-source.png"
MASTER = PUBLIC / "finova-logo.png"


def strip_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size

    samples = [
        px[0, 0],
        px[w - 1, 0],
        px[0, h - 1],
        px[w - 1, h - 1],
        px[w // 2, 0],
        px[w // 2, h - 1],
    ]
    bg = [sum(c[i] for c in samples) / len(samples) for i in range(3)]

    edge0, edge1 = 16.0, 48.0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            diff = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
            t = max(0.0, min(1.0, (diff - edge0) / (edge1 - edge0)))
            if max(r, g, b) < 22:
                t = 0.0
            px[x, y] = (r, g, b, int(a * t))

    return img


def squircle_mask(size: int, n: float = 4.0) -> Image.Image:
    """Superellipse mask (iOS-style squircle)."""
    mask = Image.new("L", (size, size), 0)
    cx = cy = (size - 1) / 2.0
    a = b = size / 2.0
    px = mask.load()
    for y in range(size):
        for x in range(size):
            nx = (x - cx) / a
            ny = (y - cy) / b
            if abs(nx) ** n + abs(ny) ** n <= 1.0:
                px[x, y] = 255
    return mask


def compose_squircle_icon(logo: Image.Image, size: int) -> Image.Image:
    logo = strip_background(logo)
    mask = squircle_mask(size)

    pad = max(2, int(size * 0.14))
    inner = size - pad * 2
    mark = logo.copy()
    mark.thumbnail((inner, inner), Image.Resampling.LANCZOS)

    plate = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    lx = (size - mark.width) // 2
    ly = (size - mark.height) // 2
    plate.paste(mark, (lx, ly), mark)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(plate, (0, 0), mask)
    return out


def main() -> None:
    src_path = SOURCE if SOURCE.exists() else MASTER
    raw = Image.open(src_path)
    master = strip_background(raw)
    master.save(MASTER)

    for size in (16, 32, 48, 192):
        icon = compose_squircle_icon(raw, size)
        icon.save(PUBLIC / f"favicon-{size}.png")

    print(f"Updated {MASTER} + squircle favicons in {PUBLIC}")


if __name__ == "__main__":
    main()
