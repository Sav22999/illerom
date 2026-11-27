#!/bin/sh
# Draws the PNG icons from icons/favicon.svg with Chrome.
cd "$(dirname "$0")/.." || exit 1
C="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
T=$(mktemp -d)
shot() { # name size padding% background
  echo "<body style='margin:0;background:$4'><img src='file://$PWD/icons/favicon.svg' style='display:block;width:$((100 - 2 * $3))vw;height:$((100 - 2 * $3))vw;margin:$3vw'>" > "$T/i.html"
  "$C" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --default-background-color=00000000 --user-data-dir="$T/c" --window-size=$2,$2 --screenshot="$PWD/icons/$1" "file://$T/i.html" 2>/dev/null
}
shot icon-512.png 512 0 transparent
shot icon-maskable-512.png 512 10 '#eef6e0'
for s in 192 64 32; do sips -Z $s icons/icon-512.png --out icons/$([ $s = 32 ] && echo favicon-32.png || echo icon-$s.png) >/dev/null; done
sips -Z 180 icons/icon-maskable-512.png --out icons/apple-touch-icon.png >/dev/null
rm -rf "$T"
