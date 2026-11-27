"""Rebuilds assets/icons.js with the icons the app uses (names between quotes in assets/*.js that exist in the set).
Usage: python3 tools/build_icons.py <savcomponents>/icons/<version>"""
import sys, os, re, json, glob
src = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
al = json.load(open(src + '/aliases.json')) if os.path.exists(src + '/aliases.json') else {}
names = set()
for f in glob.glob(root + '/assets/*.js'):
    if f.endswith('icons.js'):
        continue
    for m in re.findall(r"'([a-z][a-z0-9]*(?:-[a-z0-9]+)*)'", open(f).read()):
        if os.path.exists(f'{src}/{al.get(m, m)}.svg'):
            names.add(m)
# asked by SavComponents themselves (colour picker, dialogs, menus, zoom, tabs…)
names.update(['pipette', 'x', 'check', 'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right', 'search', 'minus', 'plus', 'grip', 'eye', 'eye-off', 'circle-alert', 'info', 'triangle-alert', 'circle-check', 'star', 'sun', 'moon', 'monitor', 'menu', 'zoom-in', 'zoom-out', 'languages', 'ellipsis-vertical'])
out = {}
for x in sorted(names):
    p = f'{src}/{al.get(x, x)}.svg'
    if not os.path.exists(p):
        continue
    m = re.search(r'<svg[^>]*>(.*)</svg>', open(p).read(), re.S)
    out[x] = re.sub(r'\s+', ' ', m.group(1)).strip().replace('> <', '><')
body = ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v)}' for k, v in out.items())
open(root + '/assets/icons.js', 'w').write('/** Icons drawn in the page (Lucide, ISC licence: see assets/LICENSE-lucide.txt), from SavComponents. Made by tools/build_icons.py. */\nconst ICONS = {\n' + body + '\n};\n\nexport const svg = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || \'\'}</svg>`;\n\n/** The same drawings for the SavComponents controls, so nothing is asked to another site. */\nexport function registerIcons() {\n  for (const [k, v] of Object.entries(ICONS)) window.Sav?.registerIcon(k, v);\n}\n')
print(len(out), 'icons')
