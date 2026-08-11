# CrazyGames gönderimi — Kung-Fu Chess 3D

**GÖNDERİLDİ — 11 Ağustos 2026.** Durum: **AWAITING REVIEW**.
Portal bildirimi: "Your game has been sent for review. We will notify you
once the team has reviewed your game."

Faturalandırma da tamamlandı (Tipalti üzerinden, kullanıcı kendi yaptı).

- Oyun: `Kung-Fu Chess 3D` · HTML5 · **Basic Launch** · durum **Draft**
- Yüklü yapı: `5a4bf669` (paket `index-D4sPr0UH.js`)
- Portal URL: developer.crazygames.com/games/1ad63a0f-c4aa-4bb0-8ed9-73548053c2ad

**QA'da bizzat doğrulananlar:**
- Oyun portalda açıldı, hamle oynandı, **motor cevap verdi** (`ai.worker`
  onların sunucusunda çalışıyor - en büyük riskti)
- **Hint butonu çalıştı** (Basic launch düzeltmesi tuttu)
- Açılış 3,8 sn · toplam 12,4 MB · yükleme 3,4 MB · uyarı listesi boş
- Portal SDK'nın dört işlevini de algıladı: Mute audio support,
  Loading Start, Loading Stop, Gameplay Start

**Full Launch SEÇİLEMİYOR.** Üç yolla denendi, buton devre dışı görünmüyor
ama seçim Basic'te kalıyor. Basic yeni oyunlar için zorunlu ilk aşama;
Full oradan terfi.

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


---

# KALAN ADIMLAR (11 Ağustos akşamı itibarıyla)

## 1. QA kontrol listesi

Oyun sayfasında **Go to QA** → önizleme açılır → sağ altta **Continue**.
Açılan listede:

| Madde | Cevap | Neden |
|---|---|---|
| Initial download size <50MB | otomatik ✅ | 12,4 MB |
| First gameplay start | otomatik ✅ | SDK algıladı |
| First gameplay start implemented correctly | **Yes** | oyuncu oynanabilir duruma girince çağrılıyor |
| Complies to Gameplay requirements | **Yes** | dokümana karşı tek tek kontrol edildi (aşağıda) |
| Runs on all CrazyGames domains | **Yes** | CSP/sitelock yok, tüm ülke alan adları destekli |
| Browser checks | **Yes** | Chrome'da kapsamlı test; Edge aynı motor |
| Device checks: Mobile | **Yes** | kullanıcı onayına dayanıyor |
| No external ads | **Yes** | yalnızca CrazyGames SDK |
| Does not offer external login options | **Yes** | giriş yok |
| In-game mention of T&C / Privacy Policy | **N/A** | portalda kişisel veri toplanmıyor |

Sonra alttaki **"I confirm that these results are correct"** kutusunu
işaretle → **Continue**.

### Gameplay requirements neye karşı kontrol edildi

- İngilizce arayüz ✅ · fizik `dt` tabanlı, tazeleme hızından bağımsız ✅
- Özel tam ekran düğmesi yok ✅ · özgün varlıklar ✅ · PEGI 12 ✅
- Dış platform tanıtımı yok ✅ (oyunda YouTube/GitHub linki yok)
- Yeni oyuncu doğrudan oynanabilir tahtaya açılıyor ✅

## 2. Details

Metinler yukarıdaki "Form metinleri" bölümünde hazır, kopyala-yapıştır.

**Kapak görseli:** formun istediği ölçüyü Claude'a söyle, oyunun içinden
render edip Masaüstüne bırakır. Tahminle üretilmedi - yanlış ölçü sık bir
red sebebi.

## 3. Submit

## Kabul gelirse HEMEN

`kanal/yukleme.md` ve `kanal/yeni-dortlu.md` içindeki videoların oyun
linkini CrazyGames adresine çevir. 2-6. videolar planlı ama yayınlanmadı,
açıklamaları hâlâ düzenlenebilir. Portal tıklamayı kendi geliriyle
ödüllendiriyor, GitHub Pages ödemiyor.

## Portalın kendi arızaları (11 Ağustos'ta yaşandı)

Bunlar bizim hatamız değil, tekrar görülürse panik yapma:

- Yükleme sırasında `TypeError: Failed to fetch` (uploadSingleFile) →
  arayüz Save/Delete butonlarını **sonsuza kadar kapalı** bırakıyor ve
  ekrana hiçbir hata yazmıyor. Çözüm: sayfayı tazele, sunucudaki son
  sağlam hâl korunuyor, baştan yükle.
- "Developer Portal is temporarily unavailable" tam sayfa hatası.
- Oyun sayfası doğrudan URL ile `Failed to fetch` verirken **My Games
  listesinden tıklayarak** açılabiliyor.


---

# GÖNDERİM TAMAMLANDI (11 Ağustos 2026)

| Alan | Değer |
|---|---|
| Oyun | Kung-Fu Chess 3D |
| Kategori | Board |
| Etiketler | 1 Player, 3D |
| Akış | Basic Launch (Full seçilemiyor) |
| Durum | AWAITING REVIEW |
| Yapı | `5a4bf669` / `index-D4sPr0UH.js` |

## Yüklenen medya

Hepsi `out/portal/` altında, `tools/make_portal_media.sh` ile üretildi.

| Dosya | Ölçü | Nereye |
|---|---|---|
| `kapak_yatay.png` | 1920×1080 | Landscape 16:9 |
| `kapak_dikey.png` | 800×1200 | Portrait 2:3 |
| `kapak_kare.png` | 800×800 | Square 1:1 |
| `video_yatay.mp4` | 1920×1080, 5,1 sn | Landscape video |
| `video_portre.mp4` | 1080×1920, 5,1 sn | Portrait video |

Kullanılmayan ara ürünler: `kapak_portre.png`, `video_dikey.mp4`.

## Boş bırakılanlar (bilinçli)

Google Play / iOS App Store / Steam linkleri ve Marketing creatives URL
zorunlu değil ve bizim o mağazalarda listemiz yok. Uydurmak yanlış beyan
olurdu, ayrıca "dış platform tanıtımı yok" kuralıyla da çelişirdi.

## SIRADA — kabul gelince

1. **YouTube linklerini çevir.** `kanal/yukleme.md` ve `kanal/yeni-dortlu.md`
   içindeki videolarda oyun linki GitHub Pages'i gösteriyor. 2-6. videolar
   planlı ama YAYINLANMADI (22 Ağustos'a kadar), açıklamaları düzenlenebilir.
   Portal tıklamayı kendi geliriyle ödüllendiriyor, GitHub Pages ödemiyor.

2. **Retention işi.** Basic'ten Full'e terfi üç sayıya bakıyor:
   ortalama oynama süresi 10+ dk, 1. gün geri dönüş %10-15, dönüşüm %80+.
   Bu sayıların tutacağını gösteren hicbir ölçümümüz YOK. Sessiz zorluk
   uyarlaması var ama 10 dakikalık ortalama için yeterli oldugu
   gösterilmedi. Oyun tarafındaki bir sonraki iş bu.
