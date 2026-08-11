# CrazyGames gönderimi — Kung-Fu Chess 3D

**Durum (11 Ağustos 2026):** paket hazır, **yüklenmedi**. Yükleme
developer.crazygames.com üzerinden ve hesap girişiyle yapılıyor.

**Paket:** `kungfu-chess-crazygames.zip` — 3,4 MB sıkışık / 12 MB açılmış /
18 dosya / `index.html` kökte.

## Ölçülen teknik uygunluk

| Şart | Sınır | Bizde | Durum |
|---|---|---|---|
| Toplam paket | ≤250 MB | 12 MB | ✅ |
| Dosya sayısı | ≤1500 | 18 | ✅ |
| İlk indirme (mobil ana sayfa) | ≤20 MB | 12 MB | ✅ |
| Yalnızca göreli yol | zorunlu | `base: "./"` | ✅ |
| `Gameplay start` olayı | zorunlu | var | ✅ |
| Mobilde metin seçimi kapalı | zorunlu | `user-select: none` | ✅ |

Paket sunucudan servis edilip doğrulandı: 12 GLB'nin 12'si ve giriş JS'i
200 dönüyor. (Bu kontrol boşuna değil — daha önce mutlak `/glb` yolu
yüzünden GitHub Pages'te 12 GLB'nin hepsi 404 vermişti.)

## Pakete ÖZEL iki değişiklik

1. **GoatCounter portalda yüklenmiyor.** Oyun CrazyGames'in alan adında
   çalışıyor; orada üçüncü taraf analitik hem gereksiz (portalın kendi
   ölçümü var) hem de teknik incelemede "dış istek" olarak işaretlenebiliyor.
   Kendi sitemizde çalışmaya devam ediyor.
2. **Ölü ağırlık çıkarıldı** — `pieces.glb` (eski taş seti),
   `preview_top.png`, `preview_side.png`. 1,8 MB, oyun hiçbirini
   kullanmıyor, sadece Blender araçları referans veriyor.

## Form metinleri

**Başlık:** `Kung-Fu Chess 3D`

**Kısa açıklama (bir cümle):**
```
Chess where every capture is a Shaolin duel.
```

**Uzun açıklama:**
```
Chess pieces that actually fight. Every capture is a Shaolin duel — hook
swords, monk spades, butterfly knives, and a guandao for the king.

Heavy pieces don't just disappear. Take a queen and lightning splits the
sky. Deliver checkmate and a column of light lifts the king off the board.
The fallen piece's own side turns to look at where it dropped.

Three difficulty levels, six boards, six environments. No install, no
account, plays in the browser.
```

**Kontroller:**
```
Click or tap a piece, then click the square you want. Drag to rotate the
camera, pinch or scroll to zoom. The buttons at the bottom right snap the
camera to either side or straight down.
```

**Etiketler:** `chess`, `3d`, `board`, `strategy`, `kung fu`, `singleplayer`

**Tür:** Board / Strategy

**Mobil:** evet (dokunma destekli, 12 MB ilk indirme)

## Yükleme sırası

1. developer.crazygames.com → giriş (**hesap ve şifre kullanıcıya ait,
   bu adımı Claude yapmaz**)
2. Yeni oyun → zip yükle
3. Yukarıdaki metinleri gir
4. Kapak görseli iste — formun kendi belirttiği ölçüye göre üretilecek,
   tahminle hazırlanmadı (yanlış ölçü sık bir red sebebi)
5. Gönder → inceleme

## Kabul gelirse HEMEN yapılacak

`kanal/yukleme.md` içindeki 2–6. videolar **planlı ama yayınlanmadı**
(22 Ağustos'a kadar). Açıklamalarındaki oyun linki hâlâ düzenlenebilir.
Kabul gelir gelmez linkleri CrazyGames adresine çevir: portal tıklamayı
kendi geliriyle ödüllendiriyor, GitHub Pages ödemiyor. Videolar eski
linkle yayınlanırsa o trafik gelir getirmez.
