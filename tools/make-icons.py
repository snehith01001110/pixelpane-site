#!/usr/bin/env python3
"""Render assets/app-icon.png — the apple-touch-icon for pixelpane.app.

Raster twin of assets/app-icon.svg: aurora field with a dark navy orb. Same
palette, same geometry, same 64-unit coordinate space, so the two cannot
drift. Kept as a script rather than a checked-in
export so the PNG can be rebuilt when the mark changes, the way
tools/make-og.py rebuilds the link-preview card. Needs Pillow only — no SVG
rasterizer is involved, the shapes are drawn directly.

    python3 tools/make-icons.py

tools/make-og.py reads the PNG this writes, so run this one first when both
need refreshing. After regenerating, bump the ?v= on the apple-touch-icon
link in index.html and beta/index.html.
"""
import math
import os
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

# 256 rather than 512: iOS wants 180 on iPhone but 167 and 152 on iPads, so
# this downscales cleanly for all of them without upscaling for any. Grain
# compresses poorly, so every extra pixel costs real bytes here.
SIZE, SS = 256, 4                 # supersample, then downsample for clean edges
UNIT = 64.0                       # the SVG's coordinate space
CORNER = 14.0                     # tile corner radius

# Geometry, in the same 64-unit space as app-icon.svg.
ORB_R = 14.0
VOID = (23, 26, 46)               # the field's floor — a lifted navy, not black

# (cx%, cy%, r%, rgb, peak) — mirrors the radialGradients in the SVG.
BLOBS = [
    (0.14, 0.16, 0.62, (79, 140, 230), 1.00),
    (0.72, 0.06, 0.58, (240, 169, 94), 1.00),
    (0.86, 0.30, 0.40, (198, 220, 85), 0.92),
    (0.97, 0.52, 0.42, (239, 122, 92), 0.95),
    (0.44, 0.98, 0.62, (74, 134, 224), 1.00),
    (0.08, 0.74, 0.50, (231, 158, 208), 0.95),
    (0.04, 0.46, 0.42, (145, 130, 221), 0.92),
    (0.90, 0.90, 0.46, (242, 173, 126), 0.88),
]

ORB_CORE = (42, 55, 104)
ORB_MID = (26, 34, 69)
ORB_RIM = (11, 14, 29)


def field(px):
    """The aurora. Blobs are *screened* onto the floor colour rather than
    pasted over one another — pasting averages every overlap toward mud, which
    turns the reference's distinct blue / orange / lime regions into uniform
    brown. Screening adds light, which is what the CSS aurora does with
    background-blend-mode and what keeps the palette vivid."""
    img = Image.new("RGB", (px, px), VOID)
    for cx, cy, r, rgb, peak in BLOBS:
        # Build the falloff small and upscale — a per-pixel hypot over the full
        # supersampled canvas is needlessly slow for what is a smooth ramp, and
        # the upscale is what gives the reference its soft out-of-focus edges.
        lo = max(24, px // 16)
        mask = Image.new("L", (lo, lo))
        load = mask.load()
        for y in range(lo):
            for x in range(lo):
                d = math.hypot(x / lo - cx, y / lo - cy) / r
                load[x, y] = int(peak * 255 * (1 - d) ** 2) if d < 1 else 0
        mask = mask.resize((px, px), Image.BICUBIC)
        layer = Image.new("RGB", (px, px), (0, 0, 0))
        layer.paste(Image.new("RGB", (px, px), rgb), (0, 0), mask)
        img = ImageChops.screen(img, layer)
    return img


def grain(img, amount=0.30):
    """Monochrome noise over the field, so it reads as printed rather than
    rendered. Overlay rather than a straight blend: blending toward grey
    desaturates everything the screening just worked to keep."""
    px = img.size[0]
    noise = Image.effect_noise((px // 2, px // 2), 38).resize((px, px), Image.BICUBIC)
    noise = noise.filter(ImageFilter.SMOOTH)
    return Image.blend(img, ImageChops.overlay(img, Image.merge("RGB", (noise,) * 3)), amount)


def orb(r):
    """Dark navy sphere: a lit core falling to a near-black rim. The reference
    samples rgb(35,45,91) dead centre and rgb(13,17,34) at the edge, so a flat
    fill reads noticeably deader than the original."""
    d = int(r * 2)
    img = Image.new("RGB", (d, d))
    load = img.load()
    for y in range(d):
        for x in range(d):
            # Highlight sits slightly above centre, as in the reference.
            t = min(1.0, math.hypot(x - d / 2, y - d * 0.45) / (r * 1.28))
            if t < 0.5:
                a, b, k = ORB_CORE, ORB_MID, t / 0.5
            else:
                a, b, k = ORB_MID, ORB_RIM, (t - 0.5) / 0.5
            load[x, y] = tuple(round(p + (q - p) * k) for p, q in zip(a, b))
    mask = Image.new("L", (d, d), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, d - 1, d - 1], fill=255)
    return img, mask


def build(size=SIZE, orb_r=ORB_R, corner=CORNER):
    px = size * SS
    s = px / UNIT

    tile = Image.new("L", (px, px), 0)
    ImageDraw.Draw(tile).rounded_rectangle([0, 0, px - 1, px - 1], radius=corner * s, fill=255)

    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    img.paste(grain(field(px)), (0, 0), tile)

    # Soft contact shadow, offset down-right, then the sphere over it.
    r = orb_r * s
    sh = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([px / 2 - r + s, px / 2 - r + 1.4 * s,
                                px / 2 + r + s, px / 2 + r + 1.4 * s], fill=(5, 6, 13, 128))
    img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(1.6 * s)))

    body, mask = orb(r)
    img.paste(body, (int(px / 2 - r), int(px / 2 - r)), mask)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "assets", "app-icon.png")
    build().save(out, optimize=True)
    print("wrote %s (%.0f KB)" % (out, os.path.getsize(out) / 1024))
