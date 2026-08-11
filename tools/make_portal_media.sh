#!/bin/bash
# CrazyGames gonderimi icin gereken medyayi uretir.
#
# Portal DORT sey istiyor ve olculeri sabit:
#   kapak  yatay   1920x1080   (16:9)
#   kapak  dikey    800x1200   (2:3)
#   kapak  kare     800x800    (1:1)
#   video  yatay + video dikey, MP4/MOV, en fazla 20 sn
#
# Hepsi ayni oldurus sahnesinden uretiliyor (varsayilan pxq: piyon veziri
# aliyor, gokten yildirim dusuyor) - portalin kendi tavsiyesi "make it
# appealing", duz bir baslangic tahtasi degil.
#
# !! ALT YAZI KAPALI (label=0). Kliplerdeki "Kung-Fu Chess 3D - link in
#    profile" satiri YouTube profiline isaret ediyor; CrazyGames'te hem
#    anlamsiz hem de "dis platform tanitimi" olarak okunabilir.
set -euo pipefail
cd "$(dirname "$0")/.."

SPEC="${1:-pxq}"
FPS=30
CHROME="/Users/whitegum/Desktop/tunç/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="out/clips"
HEDEF="out/portal"

command -v ffmpeg >/dev/null || { echo "ffmpeg yok"; exit 1; }
curl -sf -o /dev/null "http://127.0.0.1:5180/" || { echo "dev sunucusu kapali: npm run dev"; exit 1; }

mkdir -p "$HEDEF"

uret() {   # ad genislik yukseklik
  local ad="$1" W="$2" H="$3"
  echo "--- $ad  ${W}x${H} ---"
  rm -rf "$OUT"; mkdir -p "$OUT"
  local PROF="/tmp/satranc3d-portal-$$-$ad"
  local URL="http://127.0.0.1:5180/?clip=${SPEC}&w=${W}&h=${H}&fps=${FPS}&label=0"

  "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader \
    --user-data-dir="$PROF" --window-size=400,300 \
    --allow-running-insecure-content "$URL" >/dev/null 2>&1 &
  local PID=$!
  local BEKLENEN=0
  while [ ! -f "$OUT/FINISHED" ]; do
    sleep 2; BEKLENEN=$((BEKLENEN+2)); printf "."
    kill -0 $PID 2>/dev/null || { echo; echo "Chrome kapandi"; return 1; }
    [ $BEKLENEN -gt 900 ] && { echo; echo "zaman asimi"; return 1; }
  done
  kill $PID 2>/dev/null || true; wait $PID 2>/dev/null || true; rm -rf "$PROF"
  echo " ${BEKLENEN}sn"

  grep -q '"error"' "$OUT/FINISHED" && { echo "hata: $(cat $OUT/FINISHED)"; return 1; }

  local dir="$OUT/$SPEC"
  # Video (yalnizca istenen olculerde)
  if [ "$ad" = "yatay" ] || [ "$ad" = "dikey" ]; then
    ffmpeg -y -loglevel error -framerate $FPS -i "$dir/f_%05d.png" -i "$dir/audio.wav" \
      -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
      -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:a aac -b:a 192k -shortest \
      "$HEDEF/video_${ad}.mp4"
    echo "  -> $HEDEF/video_${ad}.mp4"
  fi
  # Kapak: YILDIRIMIN CAKTIGI an.
  #
  # !! Oran tahminle secilmemeli. Ilk denemede 0.60 yazilmisti; o an
  #    parcalanmanin SONRASI cikiyordu - vezir çoktan dagilmis, karede
  #    tahtaya dagilmis siyah kiriklar ve minicik bir figur kaliyordu.
  #    "Kung fu satranc" degil "satranc tahtasina dokulmus konfeti" gibi
  #    duruyordu. Videodan zaman cizelgesi cikarilip bakildi (11-08-2026):
  #      0.5s uzakta duruyorlar - 1.4s yaklasiyor - 1.8s kapisiyor
  #      2.1s YILDIRIM (en iyi) - 2.7s patlama - 3.0s karanlik kiriklar
  #    2.1 / 5.067 = 0.414
  local kare
  kare=$(python3 -c "
import json
d=json.load(open('$dir/meta.json'))
i=int(d['frames']*0.414)
print(max(1,min(d['frames'],i)))
")
  cp "$dir/$(printf 'f_%05d.png' "$kare")" "$HEDEF/kapak_${ad}.png"
  echo "  -> $HEDEF/kapak_${ad}.png (kare $kare)"
}

uret yatay 1920 1080
uret dikey  800 1200
uret kare   800  800
uret portre 1080 1920

# portre videosu "dikey" adiyla degil, tam 9:16 olandan gelmeli
if [ -f "$HEDEF/kapak_portre.png" ]; then
  ffmpeg -y -loglevel error -framerate $FPS -i "$OUT/$SPEC/f_%05d.png" -i "$OUT/$SPEC/audio.wav" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
    -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:a aac -b:a 192k -shortest \
    "$HEDEF/video_portre.mp4"
  echo "-> $HEDEF/video_portre.mp4"
fi

echo; echo "=== uretilenler ==="
ls -lh "$HEDEF" | awk '{print $5, $9}'
