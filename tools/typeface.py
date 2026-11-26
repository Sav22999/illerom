#!/usr/bin/env python3
"""Builds Illerom Bars and Illerom Bars Mono from data/typeface.json, in assets/fonts/:
- illerom-bars.ttf and .woff: variable, for the web and recent apps;
- illerom-bars.otf (leaned) and illerom-bars-upright.otf: static, for the apps that want one style per file;
- the same four as illerom-bars-mono*: every letter in a cell of the same width (three columns), so that
  ill and m, or i and l side by side, never run together;
- illerom-bars.zip: all of them with the licence, the download of the typeface page.

The rules of the letters: each one is made either only of upright stems or only of horizontal lines, never both.
Stems: at most 3 columns; each is whole, only its top half or only its bottom half (b, k and x of the sketch have both
halves, apart). Lines: at most 3 (top, middle, bottom), all of one length. check() refuses anything else.

A variable font with one axis, LEAN: 0 = the bars stand upright, 100 = leaned as in the mark (the default).
The lean shears each glyph around half the cap height, so the spacing stays the same at every value.
Needs fontTools (pip install fonttools). Run: python3 tools/typeface.py
"""
import json
import os
import zipfile

from fontTools.designspaceLib import AxisDescriptor, DesignSpaceDocument, SourceDescriptor
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import varLib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "data", "typeface.json"), encoding="utf-8"))

UNIT = 7  # one step of the grid in font units: the cap height (100) is 700
CAP = 100 * UNIT
GAP = 27  # between letters, as in the wordmark
SPACE = 50
SHEAR = 0.5  # as matrix(1 0 .5 1) of the wordmark
ACCENT = 15  # grave and acute: a small square above, before or after the middle
CELL = 77  # Mono: the width of three columns; each glyph sits in the middle of it


def check(name, rects):
    """A letter keeps the rules: only stems or only lines; at most 3 stems, whole or half; at most 3 lines, one length."""
    if len(name) != 1:
        return
    upright = [r for r in rects if r[3] > r[2]]
    flat = [r for r in rects if r[2] > r[3]]
    assert not (upright and flat), f"{name}: stems and lines together"
    if upright:
        cols = {r[0] for r in rects}
        assert len(cols) <= 3, f"{name}: more than 3 stems"
        assert all(c in (0, 31, 62) for c in cols), f"{name}: a stem off the 3 columns"
        for c in cols:
            parts = sorted((r[1], r[3]) for r in rects if r[0] == c)
            # whole, top half, bottom half, or the two halves apart
            assert parts in ([(0, 100)], [(0, 50)], [(50, 50)], [(0, 42.5), (57.5, 42.5)]), f"{name}: a stem neither whole nor half"
    else:
        rows = [r[1] for r in rects]
        assert len(rows) == len(set(rows)) <= 3 and set(rows) <= {0, 42.5, 85}, f"{name}: lines split or off the 3 rows"
        assert all(r[0] == 0 and r[2] == 48 for r in rects), f"{name}: a line of another length"


def glyph_set(mono=False):
    """name -> (rects in grid units, advance in grid units). Mono: every glyph centred in a cell as wide as 3 columns."""
    out = {}
    for name, rects in DATA["glyphs"].items():
        check(name, rects)
        right = max(x + w for x, y, w, h in rects)
        if mono:
            dx = (CELL - right) / 2
            rects, right = [[x + dx, y, w, h] for x, y, w, h in rects], CELL
        out[name] = (rects, right + GAP)
    for name, (base, _, kind) in DATA["accents"].items():
        rects, adv = out[base]
        mid = (adv - GAP) / 2
        x = mid - ACCENT - 8 if kind == "grave" else mid + 8
        out[name] = (rects + [[x, -30, ACCENT, ACCENT]], adv)
    return out


def contours(rects, lean):
    """The rects as clockwise contours in font units (y up), sheared when lean."""
    out = []
    for x, y, w, h in rects:
        pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]  # clockwise with y down
        c = [(round((px + (SHEAR * (py - 50) if lean else 0) + GAP / 2) * UNIT), round(CAP - py * UNIT)) for px, py in pts]
        # y flips, so reversing keeps the contour clockwise
        out.append(c[::-1])
    return out


def trace(pen, cs):
    for c in cs:
        pen.moveTo(c[0])
        for p in c[1:]:
            pen.lineTo(p)
        pen.closePath()
    return pen


def draw(rects, lean):
    """A TrueType glyph: outer contours go clockwise."""
    return trace(TTGlyphPen(None), contours(rects, lean)).glyph()


def charstring(rects, lean, width):
    """A CFF glyph: outer contours go counter-clockwise."""
    return trace(T2CharStringPen(width, None), [c[::-1] for c in contours(rects, lean)]).getCharString()


def master(lean, otf=False, mono=False):
    """One style: leaned or upright, proportional or Mono; TrueType outlines (the masters of the variable font) or CFF (otf)."""
    glyphs = glyph_set(mono)
    order = [".notdef", "space"] + list(glyphs)
    fb = FontBuilder(1000, isTTF=not otf)
    fb.setupGlyphOrder(order)
    cmap = {32: "space", 160: "space"}
    for name in glyphs:
        if len(name) == 1:
            cmap[ord(name)] = name
            cmap[ord(name.upper())] = name
    for name, codes in DATA["unicodes"].items():
        for c in codes:
            cmap[c] = name
    for name, (_, code, _) in DATA["accents"].items():
        cmap[code] = name
        cmap[ord(chr(code).upper())] = name
    fb.setupCharacterMap(cmap)
    notdef = [[(CELL - 40) / 2, 0, 40, 100]] if mono else [[0, 0, 40, 100]]
    rects = {".notdef": notdef, "space": []} | {n: r for n, (r, _) in glyphs.items()}
    cell = round((CELL + GAP) * UNIT)
    widths = {".notdef": cell if mono else round((40 + GAP) * UNIT), "space": cell if mono else SPACE * UNIT} | {n: round(a * UNIT) for n, (_, a) in glyphs.items()}
    style = "Regular" if lean else "Upright"
    family = "Illerom Bars Mono" if mono else "Illerom Bars"
    ps = family.replace(" ", "") + "-" + style
    if otf:
        fb.setupCFF(ps, {"FullName": family + " " + style, "isFixedPitch": int(mono)}, {n: charstring(r, lean, widths[n]) for n, r in rects.items()}, {})
    else:
        fb.setupGlyf({n: draw(r, lean) for n, r in rects.items()})
    # the left side bearing is where the glyph starts
    fb.setupHorizontalMetrics({n: (widths[n], min((p[0] for c in contours(r, lean) for p in c), default=0)) for n, r in rects.items()})
    fb.setupHorizontalHeader(ascent=950, descent=-250)
    names = {"familyName": family, "styleName": "Regular"} if lean else {
        "familyName": family + " Upright", "styleName": "Regular", "typographicFamily": family, "typographicSubfamily": "Upright"}
    fb.setupNameTable(names | {
        "uniqueFontIdentifier": ps + "-1.0", "fullName": family + ("" if lean else " Upright"), "psName": ps, "version": "Version 1.000",
        "copyright": "© 2026 Saverio Morelli", "manufacturer": "Saverio Morelli", "designer": "Saverio Morelli",
        "vendorURL": "https://www.illerom.eu/", "description": "The letters of the Illerom mark: bars that lean.",
        "licenseDescription": "MIT License", "licenseInfoURL": "https://github.com/Sav22999/illerom/blob/main/LICENSE",
    })
    fb.setupOS2(sTypoAscender=950, sTypoDescender=-250, sTypoLineGap=0, usWinAscent=1000, usWinDescent=300,
                sCapHeight=CAP, sxHeight=CAP, achVendID="SAVM", fsType=0)
    if mono:
        fb.font["OS/2"].panose.bFamilyType, fb.font["OS/2"].panose.bProportion = 2, 9  # Latin text, monospaced
    fb.setupPost(italicAngle=0, isFixedPitch=int(mono))
    return fb.font


def family(mono):
    """The variable font, its woff and the two static otf of one family."""
    ds = DesignSpaceDocument()
    axis = AxisDescriptor()
    axis.tag, axis.name, axis.minimum, axis.default, axis.maximum = "LEAN", "Lean", 0, 100, 100
    ds.addAxis(axis)
    for lean, value in ((True, 100), (False, 0)):
        s = SourceDescriptor()
        s.font = master(lean, mono=mono)
        s.location = {"Lean": value}
        s.name = f"lean{value}"
        ds.addSource(s)
    font, _, _ = varLib.build(ds)
    base = "illerom-bars-mono" if mono else "illerom-bars"
    out = os.path.join(ROOT, "assets", "fonts", base)
    font.save(out + ".ttf")
    font.flavor = "woff"
    font.save(out + ".woff")
    master(True, otf=True, mono=mono).save(out + ".otf")
    master(False, otf=True, mono=mono).save(out + "-upright.otf")
    return [base + ext for ext in (".otf", "-upright.otf", ".ttf", ".woff")]


def main():
    files = family(False) + family(True)
    # always the same bytes for the same fonts: no new zip at every build
    when = (2026, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(os.path.join(ROOT, "assets", "fonts", "illerom-bars.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        for name in files:
            z.writestr(zipfile.ZipInfo("illerom-bars/" + name, when), open(os.path.join(ROOT, "assets", "fonts", name), "rb").read())
        z.writestr(zipfile.ZipInfo("illerom-bars/LICENSE.txt", when), open(os.path.join(ROOT, "LICENSE"), "rb").read())
    print("built", ", ".join(files), "and illerom-bars.zip")


if __name__ == "__main__":
    main()
