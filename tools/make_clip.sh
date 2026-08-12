#!/bin/bash
# Oldurus animasyonlarindan dikey (9:16) Shorts klibi uretir.
#
#   tools/make_clip.sh                 -> qxp, 1080x1920, 30fps
#   tools/make_clip.sh all             -> alti imza hareketi, tek Chrome acilisinda
#   tools/make_clip.sh qxp 540 60      -> hizli onizleme
#
# Dev sunucusu (npm run dev) ayakta olmali. Kareler out/clips/<ad>/ altina
# duser, mp4'ler out/clips/*.mp4 olur.
set -euo pipefail
cd "$(dirname "$0")/.."

SPEC="${1:-qxp}"
W="${2:-1080}"
FPS="${3:-30}"
H=$(( W * 16 / 9 ))
CHROME="/Users/whitegum/Desktop/tunç/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="out/clips"
PROF="/tmp/satranc3d-clip-profile-$$"

command -v ffmpeg >/dev/null || { echo "ffmpeg yok: brew install ffmpeg"; exit 1; }
curl -sf -o /dev/null "http://127.0.0.1:5180/" || { echo "dev sunucusu kapali: npm run dev"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"

URL="http://127.0.0.1:5180/?clip=${SPEC}&w=${W}&fps=${FPS}${EXTRA:-}"
echo "kayit: $URL"

# Yazilim rasterizasyonu: makinede GPU'ya bagli kalmadan ayni sonucu verir.
"$CHROME" --headless=new --disable-gpu --no-sandbox \
  --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
  --user-data-dir="$PROF" --window-size=400,300 \
  --allow-running-insecure-content "$URL" >/dev/null 2>&1 &
CHROME_PID=$!
# Chrome'u her cikista topla -- yoksa arkada calisip CPU yiyor
trap 'kill $CHROME_PID 2>/dev/null || true; wait $CHROME_PID 2>/dev/null || true; rm -rf "$PROF"' EXIT

echo -n "render"
WAITED=0
while [ ! -f "$OUT/FINISHED" ]; do
  sleep 2
  WAITED=$((WAITED + 2))
  echo -n "."
  kill -0 $CHROME_PID 2>/dev/null || { echo; echo "Chrome beklenmedik sekilde kapandi"; exit 1; }
  [ $WAITED -gt 3600 ] && { echo; echo "zaman asimi"; exit 1; }
done
echo " tamam (${WAITED}sn)"

if grep -q '"error"' "$OUT/FINISHED"; then
  echo "tarayici hatasi: $(cat "$OUT/FINISHED")"
  exit 1
fi

for dir in "$OUT"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  [ -f "$dir/meta.json" ] || { echo "$name: meta.json yok, atlandi"; continue; }
  mp4="$OUT/$name.mp4"

  # yuv420p + boyutlarin cifte bolunmesi: Safari ve Instagram aksi halde acmiyor
  ffmpeg -y -loglevel error \
    -framerate "$FPS" -i "$dir/f_%05d.png" \
    -i "$dir/audio.wav" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
    -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
    -c:a aac -b:a 192k -shortest \
    "$mp4"
  echo "$mp4  $(du -h "$mp4" | cut -f1)"
done

echo "bitti -> $OUT"
