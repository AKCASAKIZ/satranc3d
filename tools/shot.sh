#!/bin/bash
# Headless Chrome ile oyunun ekran goruntusunu alir (eklenti gerektirmez).
#   tools/shot.sh cikti.png [bekleme_ms]
CHROME="/Users/whitegum/Desktop/tunç/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="${1:-/tmp/shot.png}"
BUDGET="${2:-9000}"
rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --no-sandbox \
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
  --user-data-dir=/tmp/satranc3d-chrome-profile \
  --window-size=1400,900 --virtual-time-budget="$BUDGET" \
  --screenshot="$OUT" "http://127.0.0.1:5180/" 2>/dev/null
ls -la "$OUT" 2>/dev/null || echo "SCREENSHOT ALINAMADI"
