#!/bin/sh
# Draws the images of assets/brand/ (Open Graph banner and icons) with Chrome, from the same wordmark and favicon of the site.
cd "$(dirname "$0")/.." || exit 1
C="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
T=$(mktemp -d); mkdir -p assets/brand
php -r 'define("ROOT", getcwd()); require "include/lib.php"; echo str_replace(["<!--WM-->","../assets"], ["<style>.bar{fill:#7d2359}</style>".wordmark(), "file://".getcwd()."/assets"], file_get_contents("tools/og.html"));' > "$T/og.html"
"$C" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --user-data-dir="$T/c" --window-size=1200,630 --screenshot="$PWD/assets/brand/og.png" "file://$T/og.html" 2>/dev/null
for n in 512 192; do
  echo "<body style='margin:0;background:transparent'><img src='file://$PWD/favicon.svg' width=$n height=$n style='display:block'>" > "$T/i.html"
  "$C" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --user-data-dir="$T/c" --window-size=$n,$n --screenshot="$PWD/assets/brand/icon-$n.png" "file://$T/i.html" 2>/dev/null
done
echo "<body style='margin:0;background:#f4f1f7'><img src='file://$PWD/favicon.svg' width=720 height=720 style='display:block;margin:20px'>" > "$T/i.html"
"$C" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$T/c" --window-size=760,760 --screenshot="$T/a.png" "file://$T/i.html" 2>/dev/null
sips -Z 180 "$T/a.png" --out assets/brand/apple-touch-icon.png >/dev/null
rm -rf "$T"
