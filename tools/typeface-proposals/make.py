"""Comparison images for Illerom Bars: each proposed letter (now / proposal) and an overview.
python3 proposals.py <repo> <out dir>"""
import html
import json
import os
import subprocess
import sys
import tempfile

ROOT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
DATA = json.load(open(os.path.join(ROOT, "data", "typeface.json"), encoding="utf-8"))
NOW = DATA["glyphs"]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PLUM, YELLOW, BLUE, INK, MUTED, BG = "#7d2359", "#ffd94f", "#84d3ea", "#2a1430", "#6a5873", "#f4f1f7"

F = lambda x: [x, 0, 15, 100]
T = lambda x: [x, 0, 15, 50]
B = lambda x: [x, 50, 15, 50]
ROW = {"top": [0, 0, 48, 15], "mid": [0, 42.5, 48, 15], "bot": [0, 85, 48, 15]}

# letter: (bars, twins today, why, word)
P = {
    "b": ([F(0), B(31), B(62)], "k", "Asta con la pancia larga in basso, come una b minuscola.", "kebab"),
    "c": ([ROW["mid"], ROW["bot"]], "o z", "Righe in mezzo e in basso: una o piccola, come la c minuscola. È l’unica combinazione di righe ancora libera.", "cocco"),
    "g": ([F(0), T(31), B(62)], "r", "Asta, braccio in alto e sperone in basso a destra: il giro della G.", "grigio"),
    "s": ([B(0), T(31)], "e", "Due mezze aste a zig-zag, come la spina della S. La e e la s sono tra le lettere più usate: separarle aiuta più di tutto. Passa dalle righe alle aste.", "stesse"),
    "v": ([T(0), T(31)], "n", "Due mezze aste in alto: la V, aperta sopra. Fa coppia con la y.", "vino"),
    "y": ([T(0), F(31), T(62)], "i l", "Due braccia in alto e l’asta in mezzo: proprio la Y.", "lady"),
}
NEW = dict(NOW, **{k: v[0] for k, v in P.items()})
SPACE, GAP = 50, 27
PUNCT = {"’": "quotesingle", "'": "quotesingle", ",": "comma", ".": "period", "-": "hyphen", "!": "exclam", "?": "question"}


def lean_svg(rects, h, color=PLUM, upright=False, grid=False):
    """One glyph as an SVG `h` px tall (cap height), leaned like the wordmark or upright on its grid."""
    w = max(r[0] + r[2] for r in rects)
    pad = 4
    if grid:
        w = max(w, 77 if any(r[3] > r[2] for r in rects) else 48)
    vw = w + (0 if upright else 50) + pad * 2
    out = [f'<svg viewBox="{-pad} {-pad} {vw} {100 + pad * 2}" height="{h * (100 + pad * 2) / 100:.0f}" style="overflow:visible;display:block">']
    if grid:
        out.append(f'<g fill="none" stroke="{MUTED}" stroke-opacity=".5" stroke-width=".7" stroke-dasharray="2.5 2.5">')
        if all(r[2] > r[3] for r in rects):  # lines: the three rows
            for y in (0, 42.5, 85):
                out.append(f'<rect x="0" y="{y}" width="48" height="15"/>')
        else:  # stems: three columns, each in two halves
            for c in (0, 31, 62):
                out.append(f'<rect x="{c}" y="0" width="15" height="50"/><rect x="{c}" y="50" width="15" height="50"/>')
        out.append('</g>')
    out.append(f'<g fill="{color}"' + ('' if upright else ' transform="matrix(1 0 .5 1 0 0)"') + '>')
    out += [f'<rect x="{x}" y="{y}" width="{rw}" height="{rh}"/>' for x, y, rw, rh in rects]
    out.append('</g></svg>')
    return "".join(out)


def text_svg(text, glyphs, h, color=PLUM):
    """A line of text drawn from the bars, h px cap height."""
    x, parts = 0, []
    for ch in text.lower():
        if ch == " ":
            x += SPACE
            continue
        name = PUNCT.get(ch, ch)
        rects = glyphs.get(name)
        if not rects:
            continue
        parts += [f'<rect x="{x + rx}" y="{ry}" width="{rw}" height="{rh}"/>' for rx, ry, rw, rh in rects]
        x += max(r[0] + r[2] for r in rects) + GAP
    w = x - GAP + 50
    return (f'<svg viewBox="-4 -4 {w + 8} 108" height="{h * 1.08:.0f}" style="overflow:visible;display:block">'
            f'<g fill="{color}" transform="matrix(1 0 .5 1 0 0)">{"".join(parts)}</g></svg>')


FONTS = f"""
@font-face {{ font-family: Display; src: url(file://{ROOT}/assets/fonts/stack-sans-notch.ttf); font-weight: 200 700; }}
@font-face {{ font-family: Inter; src: url(file://{ROOT}/assets/fonts/inter-latin-wght-normal.woff2); font-weight: 100 900; }}
* {{ box-sizing: border-box; margin: 0; }}
body {{ background: {BG}; color: {INK}; font: 400 22px/1.45 Inter, system-ui, sans-serif; }}
h1, h2, .big {{ font-family: Display, system-ui; font-weight: 600; line-height: 1.1; }}
.muted {{ color: {MUTED}; }}
.tag {{ display: inline-block; font: 600 15px/1 Inter; letter-spacing: .08em; text-transform: uppercase; color: {MUTED}; }}
"""


def shot(name, body, w, h):
    with tempfile.TemporaryDirectory() as t:
        page = os.path.join(t, "p.html")
        open(page, "w", encoding="utf-8").write(f"<!doctype html><meta charset=utf-8><style>{FONTS}</style>{body}")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                        f"--user-data-dir={t}/c", f"--window-size={w},{h}", "--force-device-scale-factor=2",
                        f"--screenshot={os.path.join(OUT, name)}", "file://" + page],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def letter_card(c):
    bars, twins, why, word = P[c]
    def panel(title, rects, glyphs, bg, note):
        return f"""<div style="flex:1;background:{bg};padding:34px 38px 30px;position:relative;{'rotate:-.6deg;box-shadow:0 18px 34px -20px rgb(42 20 48/.5)' if bg == YELLOW else 'border:1px solid #ddd4e4'}">
          <span class="tag" style="color:{INK if bg == YELLOW else MUTED}">{title}</span>
          <div style="display:flex;align-items:flex-end;gap:40px;margin:26px 0 22px;height:230px">
            <div>{lean_svg(rects, 200)}</div>
            <div style="padding-bottom:6px">{lean_svg(rects, 82, upright=True, grid=True)}<div style="font-size:14px;margin-top:8px" class="muted">sulla griglia</div></div>
          </div>
          <div style="font-size:16px;margin-bottom:10px;color:{INK if bg == YELLOW else MUTED}">{note}</div>
          <div style="display:flex;align-items:center;gap:18px">{text_svg(word, glyphs, 40)}<span style="font:600 20px/1 Inter;color:{MUTED}">{word}</span></div>
        </div>"""
    now_note = f"Oggi uguale a: <b>{html.escape(twins)}</b>"
    body = f"""<div style="padding:44px 52px">
      <div style="display:flex;align-items:baseline;gap:22px;margin-bottom:6px">
        <h1 style="font-size:64px">{c.upper()} {c}</h1>
        <span class="muted" style="font-size:20px">Illerom Bars · proposta</span>
      </div>
      <p style="max-width:1050px;margin-bottom:30px;font-size:21px">{html.escape(why)}</p>
      <div style="display:flex;gap:36px">
        {panel("Ora", NOW[c], NOW, "#fff", now_note)}
        {panel("Proposta", bars, dict(NOW, **{c: bars}), YELLOW, "Nessuna gemella")}
      </div>
    </div>"""
    shot(f"{c}.png", body, 1200, 760)


def twins(glyphs):
    groups = {}
    for c in "abcdefghijklmnopqrstuvwxyz":
        groups.setdefault(json.dumps(glyphs[c]), []).append(c)
    return [g for g in groups.values() if len(g) > 1]


def overview():
    def row(glyphs, label, mark):
        tiles = []
        for c in "abcdefghijklmnopqrstuvwxyz":
            on = mark and c in P
            tiles.append(f"""<div style="width:58px;height:100px;display:grid;justify-items:center;align-content:center;gap:8px;
                background:{YELLOW if on else '#fff'};border:1px solid {'transparent' if on else '#ddd4e4'};{'rotate:-2deg' if on else ''}">
                {lean_svg(glyphs[c], 40)}<span style="font:600 14px/1 Inter;color:{INK if on else MUTED}">{c}</span></div>""")
        return f'<div style="display:flex;align-items:center;gap:18px;margin-bottom:22px"><span class="tag" style="width:130px;flex:none">{label}</span><div style="display:flex;gap:6px;flex-wrap:nowrap">{"".join(tiles)}</div></div>'

    def groups(glyphs):
        return " · ".join("<b>" + " ".join(g) + "</b>" for g in twins(glyphs))

    sample = "progetti aperti, anche quelli un po’ storti"
    sample2 = "le cose si vedono meglio da storte"
    body = f"""<div style="padding:46px 52px">
      <h1 style="font-size:52px;margin-bottom:8px">Illerom Bars: le proposte</h1>
      <p class="muted" style="font-size:20px;margin-bottom:34px;max-width:1500px">{len(P)} lettere ancora da decidere (d, j e q sono già nel carattere), tutte dentro le regole: solo aste (intere, metà alta o metà bassa) oppure solo righe (in alto, in mezzo, in basso, di una sola misura). In giallo le lettere che cambiano.</p>
      {row(NOW, "Ora", False)}
      {row(NEW, "Proposta", True)}
      <div style="display:grid;gap:30px;margin-top:30px">
        <div style="background:#fff;border:1px solid #ddd4e4;padding:28px 32px">
          <span class="tag">Ora</span>
          <p style="margin:12px 0 20px;font-size:18px">Gemelle: {groups(NOW)}</p>
          {text_svg(sample, NOW, 34)}<div style="height:16px"></div>{text_svg(sample2, NOW, 34)}
        </div>
        <div style="background:{YELLOW};padding:28px 32px;rotate:-.5deg;box-shadow:0 18px 34px -20px rgb(42 20 48/.5)">
          <span class="tag" style="color:{INK}">Proposta</span>
          <p style="margin:12px 0 20px;font-size:18px">Gemelle: {groups(NEW)}</p>
          {text_svg(sample, NEW, 34)}<div style="height:16px"></div>{text_svg(sample2, NEW, 34)}
        </div>
      </div>
      <p class="muted" style="margin-top:28px;font-size:16px">Testo: «{sample}» e «{sample2}». La i e la l restano la stessa barretta, come nel marchio.</p>
    </div>"""
    shot("overview.png", body, 1960, 1110)


if __name__ == "__main__":
    for c in P:
        letter_card(c)
    overview()
    print("written", len(P) + 1, "images to", OUT)
