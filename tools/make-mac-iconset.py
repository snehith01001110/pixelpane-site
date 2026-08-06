#!/usr/bin/env python3
"""Render the macOS AppIcon.appiconset for the PixelPane app.

Draws the same mark as make-icons.py — it imports build() from there rather
than restating the geometry, so the app icon and the site's apple-touch-icon
cannot drift apart. The app icon drifted twice already; a merge resolution
silently repointed Contents.json at an older family of PNGs and the app
shipped a mark two rebrands stale. Regenerating from one source is the fix.

    python3 tools/make-mac-iconset.py ../pixel-pane/PixelPane/PixelPane/Assets.xcassets/AppIcon.appiconset

Unlike the web icon, macOS does not mask the artwork: the rounded tile is
inset inside a transparent canvas at Apple's 824/1024 proportion, so the mark
sits the same size in the Dock as every other app. Insets below match what
was already checked in, and 16 and 128 keep their hand-tuned values — 16
needs the extra pixel to read at all, and 104 divides evenly.

Filenames come from Contents.json, which is left alone. Canvases that appear
twice (icon_256.png and icon_128@2x.png are both 256) are rendered once and
copied, so duplicates stay byte-identical the way they were before.
"""
import importlib.util
import os
import shutil
import sys

# make-icons.py has a hyphen, so it cannot be imported by name.
_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("make_icons", os.path.join(_HERE, "make-icons.py"))
_make_icons = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_make_icons)
build = _make_icons.build

# canvas -> (tile, [filenames]). Tile is round(canvas * 824/1024) except at
# 16 and 128, which keep the values already in the asset catalog.
LADDER = {
    16: (14, ["icon_16.png"]),
    32: (26, ["icon_16@2x.png", "icon_32.png"]),
    64: (52, ["icon_32@2x.png"]),
    128: (104, ["icon_128.png"]),
    256: (206, ["icon_128@2x.png", "icon_256.png"]),
    512: (412, ["icon_256@2x.png", "icon_512.png"]),
    1024: (824, ["icon_512@2x.png"]),
}


def tile_on_canvas(canvas, tile):
    """The mark at `tile` px, centred on a transparent `canvas` px square."""
    from PIL import Image

    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    art = build(size=tile)
    off = (canvas - tile) // 2
    img.paste(art, (off, off), art)
    return img


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: make-mac-iconset.py <path to AppIcon.appiconset>")
    out = os.path.abspath(sys.argv[1])
    if not os.path.isdir(out):
        sys.exit("not a directory: %s" % out)

    for canvas in sorted(LADDER):
        tile, names = LADDER[canvas]
        first = os.path.join(out, names[0])
        tile_on_canvas(canvas, tile).save(first, optimize=True)
        for dup in names[1:]:
            shutil.copyfile(first, os.path.join(out, dup))
        print("%5dpx tile %-4d -> %s" % (canvas, tile, ", ".join(names)))


if __name__ == "__main__":
    main()
