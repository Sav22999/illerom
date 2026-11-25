#!/bin/sh
# PNG icons from icons/favicon.svg, drawn with Chrome.
cd "$(dirname "$0")/.." || exit 1
C="${CHROME:-/Applications/Brave Browser.app/Contents/MacOS/Brave Browser}"
T=$(mktemp -d)
shot() { # size of the image, padding, background, output
  i=$(($1 - 2 * $2))
  echo "<body style='margin:0;background:$3'><img src='file://$PWD/icons/favicon.svg' width=$i height=$i style='display:block;margin:$2px'>" > "$T/i.html"
  "$C" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --user-data-dir="$T/c" --window-size="$1,$1" --screenshot="$T/o.png" "file://$T/i.html" 2>/dev/null
  cp "$T/o.png" "$4"
}
shot 512 0 transparent icons/icon-512.png
shot 512 56 "#6d3bef" icons/icon-maskable-512.png
sips -Z 192 icons/icon-512.png --out icons/icon-192.png >/dev/null
sips -Z 32 icons/icon-512.png --out icons/favicon-32.png >/dev/null
sips -Z 180 icons/icon-maskable-512.png --out icons/apple-touch-icon.png >/dev/null
rm -rf "$T"
