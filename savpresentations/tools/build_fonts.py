"""Builds fonts/<family>-<style>.woff (Latin, no hinting) from TTF files. Usage: python3 tools/build_fonts.py <folder of the sources>
Sources: the OFL typefaces of MyCurriculum (fonts/) plus Fredoka, JetBrains Mono and Niconne."""
import sys, os
from fontTools import subset
from fontTools.ttLib import TTFont
MC, EXTRA, NIC = sys.argv[1], sys.argv[2], sys.argv[3]
out = os.path.join(os.path.dirname(__file__), '..', 'fonts')
U = list(range(0x20, 0x180)) + list(range(0x218, 0x21C)) + [0x2BC, 0x2C6, 0x2C7, 0x2D8, 0x2D9, 0x2DA, 0x2DB, 0x2DC, 0x2DD] + list(range(0x2010, 0x2028)) + [0x202F, 0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044, 0x20AC, 0x2116, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2248, 0x2260, 0x2264, 0x2265, 0x25CF, 0x2713]
jobs = []
for fam in 'inter poppins montserrat opensans sourcesans lora merriweather playfair baskerville garamond'.split():
    for st in 'regular bold italic bolditalic'.split():
        jobs.append((f'{MC}/{fam}/{st}.ttf', f'{fam}-{st}'))
for st, n in (('regular', 'Regular'), ('bold', 'Bold'), ('italic', 'Italic'), ('bolditalic', 'BoldItalic')):
    jobs.append((f'{MC}/PT_Serif-Web-{n}.ttf', f'ptserif-{st}'))
jobs += [(f'{EXTRA}/Fredoka-SemiBold.ttf', 'fredoka-regular'), (f'{EXTRA}/JetBrainsMono-Medium.ttf', 'mono-regular'), (NIC, 'niconne-regular')]
for src, name in jobs:
    f = TTFont(src)
    if 'fvar' in f: print('variable!', src)
    o = subset.Options(); o.hinting = False; o.layout_features = ['kern', 'liga', 'mark', 'mkmk', 'ccmp', 'locl']; o.name_IDs = [0, 1, 2, 4, 5, 6, 13, 14]; o.notdef_outline = True; o.flavor = 'woff'
    s = subset.Subsetter(o); s.populate(unicodes=U); s.subset(f)
    f.flavor = 'woff'; f.save(f'{out}/{name}.woff')
    print(name, os.path.getsize(f'{out}/{name}.woff') // 1024, 'KB', 'glyf' in f, f['head'].unitsPerEm)
