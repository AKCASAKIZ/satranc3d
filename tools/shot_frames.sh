#!/bin/bash
# Oldurus animasyonlarinin kare kare seridini tek Chrome acilisinda uretir.
#   tools/shot_frames.sh all  -> alti imza hareketi, 6x6 tablo
#   tools/shot_frames.sh qxp  -> tek hareket, 6 kare
SPEC="${1:-all}"
OUT="${2:-/tmp/strip_$SPEC.png}"
CHROME="/Users/whitegum/Desktop/tunç/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF="/tmp/satranc3d-chrome-profile-$$"
ROWS=6; [ "$SPEC" != "all" ] && ROWS=1
H=$((ROWS * 380 + 40))
rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --no-sandbox \
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
  --user-data-dir="$PROF" \
  --window-size=2640,$H --virtual-time-budget=25000 \
  --screenshot="$OUT" "http://127.0.0.1:5180/?demo=${SPEC}" 2>/dev/null
rm -rf "$PROF"
ls -la "$OUT" 2>/dev/null || echo "URETILEMEDI"
