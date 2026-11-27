#!/bin/sh
# Draws the pictures of a shared link with Chrome, from tools/og.php: Illerom (assets/brand/og-it.png, og-en.png) and
# SavOffice (savoffice/og-it.png, og-en.png). og.png in both places is the English one, for links shared before.
cd "$(dirname "$0")/.." || exit 1
C="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
T=$(mktemp -d)
for w in illerom savoffice; do
  [ "$w" = illerom ] && d=assets/brand || d=savoffice
  for l in it en; do
    php tools/og.php "$w" "$l" > "$T/$w-$l.html" || exit 1
    "$C" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --allow-file-access-from-files --user-data-dir="$T/c" \
      --window-size=1200,630 --virtual-time-budget=3000 --screenshot="$PWD/$d/og-$l.png" "file://$T/$w-$l.html" 2>/dev/null
  done
  cp "$d/og-en.png" "$d/og.png"
done
rm -rf "$T"
