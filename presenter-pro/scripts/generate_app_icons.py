from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT / "public" / "icons"
ICONSET_DIR = ICONS_DIR / "PresenterPro.iconset"
PNG_PATH = ICONS_DIR / "app-icon.png"
ICO_PATH = ICONS_DIR / "app-icon.ico"
ICNS_PATH = ICONS_DIR / "app-icon.icns"


def lerp(a, b, t):
    return int(a + (b - a) * t)


def gradient_background(size):
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    top = (23, 32, 58)
    bottom = (10, 15, 30)
    for y in range(size):
        t = y / max(1, size - 1)
        color = tuple(lerp(top[i], bottom[i], t) for i in range(3)) + (255,)
        for x in range(size):
            pixels[x, y] = color
    return image


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_icon(size=1024):
    base = gradient_background(size)

    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gloss_draw = ImageDraw.Draw(gloss)
    gloss_draw.ellipse(
        (-size * 0.2, -size * 0.28, size * 1.1, size * 0.7),
        fill=(255, 255, 255, 34),
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(radius=size * 0.03))
    base.alpha_composite(gloss)

    draw = ImageDraw.Draw(base)

    margin = int(size * 0.17)
    screen_top = int(size * 0.2)
    screen_bottom = int(size * 0.63)
    screen_rect = (margin, screen_top, size - margin, screen_bottom)

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (
            screen_rect[0] + int(size * 0.01),
            screen_rect[1] + int(size * 0.02),
            screen_rect[2] + int(size * 0.01),
            screen_rect[3] + int(size * 0.02),
        ),
        radius=int(size * 0.055),
        fill=(0, 0, 0, 90),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.02))
    base.alpha_composite(shadow)

    draw.rounded_rectangle(
        screen_rect,
        radius=int(size * 0.055),
        fill=(245, 248, 255, 255),
        outline=(255, 255, 255, 120),
        width=max(2, int(size * 0.006)),
    )
    draw.rounded_rectangle(
        (
            screen_rect[0] + int(size * 0.025),
            screen_rect[1] + int(size * 0.032),
            screen_rect[2] - int(size * 0.025),
            screen_rect[3] - int(size * 0.032),
        ),
        radius=int(size * 0.04),
        fill=(18, 24, 38, 255),
    )

    accent_rect = (
        screen_rect[0] + int(size * 0.085),
        screen_rect[1] + int(size * 0.11),
        screen_rect[0] + int(size * 0.28),
        screen_rect[3] - int(size * 0.12),
    )
    draw.rounded_rectangle(
        accent_rect,
        radius=int(size * 0.03),
        fill=(82, 128, 255, 255),
    )

    play_left = int(size * 0.43)
    play_top = int(size * 0.315)
    play_bottom = int(size * 0.515)
    play_width = int(size * 0.16)
    draw.polygon(
        [
            (play_left, play_top),
            (play_left, play_bottom),
            (play_left + play_width, (play_top + play_bottom) // 2),
        ],
        fill=(112, 84, 255, 255),
    )

    draw.rounded_rectangle(
        (
            int(size * 0.445),
            int(size * 0.565),
            int(size * 0.73),
            int(size * 0.595),
        ),
        radius=int(size * 0.015),
        fill=(255, 255, 255, 190),
    )

    stand = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    stand_draw = ImageDraw.Draw(stand)
    stand_draw.rounded_rectangle(
        (
            int(size * 0.475),
            int(size * 0.64),
            int(size * 0.525),
            int(size * 0.78),
        ),
        radius=int(size * 0.016),
        fill=(209, 218, 235, 255),
    )
    stand_draw.rounded_rectangle(
        (
            int(size * 0.33),
            int(size * 0.765),
            int(size * 0.67),
            int(size * 0.83),
        ),
        radius=int(size * 0.03),
        fill=(235, 239, 248, 255),
    )
    stand = stand.filter(ImageFilter.GaussianBlur(radius=size * 0.002))
    base.alpha_composite(stand)

    outline = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    outline_draw = ImageDraw.Draw(outline)
    outline_draw.rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=int(size * 0.22),
        outline=(255, 255, 255, 24),
        width=max(2, int(size * 0.004)),
    )
    base.alpha_composite(outline)

    mask = rounded_mask(size, int(size * 0.22))
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final.paste(base, (0, 0), mask)
    return final


def ensure_dirs():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    if ICONSET_DIR.exists():
        shutil.rmtree(ICONSET_DIR)
    ICONSET_DIR.mkdir(parents=True, exist_ok=True)


def save_variants(image):
    image.save(PNG_PATH)
    image.save(
        ICO_PATH,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    icon_sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }

    for filename, size in icon_sizes.items():
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(ICONSET_DIR / filename)


def build_icns():
    subprocess.run(
        ["iconutil", "-c", "icns", str(ICONSET_DIR), "-o", str(ICNS_PATH)],
        check=True,
    )


def main():
    ensure_dirs()
    image = draw_icon()
    save_variants(image)
    build_icns()
    shutil.rmtree(ICONSET_DIR, ignore_errors=True)
    print(f"generated {PNG_PATH}")
    print(f"generated {ICO_PATH}")
    print(f"generated {ICNS_PATH}")


if __name__ == "__main__":
    main()
