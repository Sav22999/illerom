"""Rebuilds assets/icons.js with the icons the app uses. Usage: python3 tools/build_icons.py <savcomponents>/icons/<version>"""
import sys, os, re, json, glob
src = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
al = json.load(open(src + '/aliases.json'))
names = set()
for f in glob.glob(root + '/assets/*.js'):
    if f.endswith('icons.js'):
        continue
    for m in re.findall(r"'([a-z][a-z0-9]*(?:-[a-z0-9]+)*)'", open(f).read()):
        if os.path.exists(f'{src}/{al.get(m, m)}.svg'):
            names.add(m)
names.add('pipette')  # asked by the colour picker of SavComponents
names.update(['volume-2', 'volume-x', 'repeat', 'captions', 'picture-in-picture-2'])  # asked by the video player of SavComponents (sav-video)
out = {}
for x in sorted(names):
    m = re.search(r'<svg[^>]*>(.*)</svg>', open(f'{src}/{al.get(x, x)}.svg').read(), re.S)
    out[x] = re.sub(r'\s+', ' ', m.group(1)).strip().replace('> <', '><')
open(root + '/assets/icons.js', 'w').write('/* Icons of the interface: Lucide (ISC, see icons/LICENSE-lucide.txt). Made by tools/build_icons.py from the SavComponents set. */\nwindow.SP_ICONS=' + json.dumps(out) + ';\nfor (const k in window.SP_ICONS) if (!window.Sav.icons[k] || k === \'users\') window.Sav.registerIcon(k, window.SP_ICONS[k]);\nwindow.Sav.iconBase = \'icons/\'; // never from another site\n')
print(len(out), 'icons')
