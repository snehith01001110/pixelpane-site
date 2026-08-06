#!/usr/bin/env python3
"""Render assets/grain.png — the film-grain tile laid over the aurora.

This used to be an inline `feTurbulence` SVG in a data URI. Two problems with
that: the browser rasterises the filter itself, so how much light the layer
adds varies between loads and between display scales, and the filter produced a
solid mid-grey plane whose opacity lifted the page's blacks toward grey. Baking
the noise to a PNG fixes both — the bytes are identical on every load, and the
noise lives in the alpha channel over white, so black stays black and only the
speckles brighten.

    python3 tools/make-grain.py

Per-pixel noise with no structure, so the tile repeats seamlessly at any size.
After regenerating, bump the ?v= on styles.css — the tile is referenced there.
"""
import os
import random
import sys
from PIL import Image

SIZE = 160        # large enough that the repeat is not legible at 180px
PEAK = 34         # max alpha; keeps the average lift near 5% so blacks hold
SEED = 20260806   # fixed, so re-running does not churn the committed file


def build(size=SIZE, peak=PEAK, seed=SEED):
    rnd = random.Random(seed)
    # White pixels, noise carried entirely in alpha. Compositing that over a
    # dark page adds speckle without the uniform grey veil a solid layer gives.
    alpha = Image.new("L", (size, size))
    alpha.putdata([max(0, min(peak, int(rnd.gauss(peak * 0.42, peak * 0.30))))
                   for _ in range(size * size)])
    img = Image.new("LA", (size, size), (255, 0))
    img.putalpha(alpha)
    return img


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "assets", "grain.png")
    img = build()
    img.save(out, optimize=True)
    stat = img.getchannel("A").getextrema()
    print("wrote %s (%.0f KB, alpha %d-%d)"
          % (out, os.path.getsize(out) / 1024, stat[0], stat[1]))
