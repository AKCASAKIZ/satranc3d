# Ücretsiz yayın — itch.io + PWA

13 Ağustos 2026. Karar: **para harcanmayacak.** Play Store ($25), App Store
($99/yıl) ve Steam ($100) kayıt ücretleri mağazanın kendi şartı, etrafından
dolaşılamıyor — bu yüzden üçü de bu belgenin dışında.

Ücretsiz kalan yollar: **itch.io** (gerçek mağaza sayfası), **PWA** (telefonda
"ana ekrana ekle", mağaza yok), **GameJolt / Newgrounds** (indie portalları),
**CrazyGames** (11 Ağustos'tan beri incelemede, `crazygames/gonderim.md`).

---

## 1 · itch.io — HTML5 sayfası

Yüklenecek dosya hazır: **`out/itch-kungfu-chess.zip`** (5,3 MB).

`dist/` derlemesinin kendisi, `index.html` arşivin **kökünde** — itch bunu
şart koşuyor, alt klasöre girmiş index.html'i bulamıyor.

Adımlar (hepsi tarayıcıda, elle):

1. itch.io'da hesap aç — ücretsiz, doğrulama yok.
2. **Upload new project**.
3. Alanlar:
   - Title: `Kung-Fu Chess 3D`
   - Short description: `Every capture is a Shaolin duel.`
   - Classification: **Games**
   - Kind of project: **HTML** ← bu seçilmezse tarayıcıda oynanmaz
   - Pricing: **No payments** (ücretsiz)
4. Zip'i yükle, dosyanın yanındaki **"This file will be played in the browser"**
   kutusunu işaretle.
5. Embed options:
   - Viewport: **1280 × 720**
   - **Fullscreen button: açık** ← 3D oyunda şart, iframe'de küçük kalıyor
   - Mobile friendly: açık (dokunma zaten çalışıyor, `pointer*` olayları)
6. Genre `Strategy`, tags: `chess`, `3d`, `kung-fu`, `singleplayer`, `webgl`
7. Görseller — **klip hattından geliyor, yeni iş yok**:
   - Cover 630×500: `tools/shot.sh` ile kare al
   - Ekran görüntüleri: aynı yol
   - Fragman: `out/yeni_sparta/*.mp4` zaten dikey; itch yatay istiyor,
     `out/clips/` dosyaları kullanılabilir ya da YouTube linki verilir
8. **Save & view page** → sonra **Publish**.

### Ölçülmesi gerekenler (yayından sonra)

- itch iframe'de oyun açılıyor mu — `base: "./"` göreli olduğu için açılmalı,
  ama teyit edilmedi.
- **GoatCounter itch'te de yükleniyor.** `index.html`'deki koruma yalnızca
  `crazygames.(com|nl)` için; itch `html.itch.zone` alan adında servis ediyor,
  yani orada üçüncü taraf betik yüklenecek. Portal tarafında bu "dış istek"
  olarak işaretlenebiliyordu (bkz. `crazygames/gonderim.md`), itch'te böyle bir
  şart yok ama ölçüm de anlamsız — iframe'de referrer itch oluyor.
  `portal.js` bu regex hatasının aynısını zaten belgeliyor (ülke alan adları),
  `index.html`'deki kopyası düzeltilmedi.

---

## 2 · PWA — mağazasız "uygulama" (KOD TARAFI BİTTİ)

Telefonda tarayıcıdan "Ana ekrana ekle" → simge, tam ekran, adres çubuğu yok,
ilk ziyaretten sonra çevrimdışı çalışıyor. Ücret yok, inceleme yok, kimlik
doğrulama yok.

Eklenenler:
- `assets/manifest.webmanifest` — ad, simgeler, `display: fullscreen`
- `assets/sw.js` — service worker
- `assets/icon-{192,512}.png` — `kanal/avatar.png`'den üretildi (sips)
- `index.html` — manifest bağlantısı + kayıt betiği

Ölçüldü (13 Ağu, `vite preview` + headless Chrome): üç dosya da 200 dönüyor,
oyun açılıyor, service worker **kaydoldu** (profil veritabanında kapsam `/` ve
betik `sw.js` görünüyor).

### Üç bilerek verilmiş karar

1. **Service worker NETWORK-FIRST, cache-first değil.** Klasik PWA tarifi
   cache-first ve daha hızlı; ama oyun `main`'e her push'ta yeniden
   yayınlanıyor. Cache-first'te bir kez uğrayan ziyaretçi, cache adı elle
   yükseltilene kadar eski sürümde çakılı kalır — ve o numarayı artırmayı
   unutmak kaçınılmaz. Ortaya çıkan hata en kötü türden: bizde düzelmiş,
   kullanıcıda duruyor. Ağ önce deneniyor, cache yalnızca ağ yoksa devreye
   giriyor.
2. **Kurulumda önbellek doldurulmuyor.** 12 MB GLB'yi kurulum anında çekmek
   ilk açılışı yavaşlatır; oyuncu belki hiç çevrimdışı kalmayacak. Ne
   oynandıysa o birikiyor.
3. **iframe'de kayıt YOK.** CrazyGames ve itch oyunu kendi alan adlarında
   iframe içinde servis ediyor; orada worker'ın kapsamı bize ait değil,
   kurulabilir uygulama diye bir şey de yok. `window.top === window` koşulu
   bunu kesiyor. Aynı koşul `file://` ile açılan paketi de koruyor —
   CrazyGames teknik incelemesi oyunu öyle de açıyor ve orada `register()`
   hata fırlatır.

### Telefonda test (henüz yapılmadı)

Yayına girdikten sonra `https://akcasakiz.github.io/satranc3d/`:
- iOS Safari: Paylaş → Ana Ekrana Ekle
- Android Chrome: adres çubuğunda "Uygulamayı yükle" ya da menü → Yükle

Simge `kanal/avatar.png`, açılış tam ekran olmalı. **Uçak moduna alıp tekrar
aç** — çevrimdışı çalışması service worker'ın gerçekten devrede olduğunun
kanıtı.

---

## 3 · GameJolt / Newgrounds

İkisi de ücretsiz ve aynı zip'i alıyor. itch yayına girip iframe'de
çalıştığı **doğrulandıktan sonra** yapılmalı — aynı hatayı üç yere
kopyalamanın anlamı yok.

---

## Açık kalan / temizlik

- `assets/preview_top.png` (1,0 MB) + `assets/preview_side.png` (636 KB)
  `publicDir` içinde ve **her derlemeye giriyor** — çalışma zamanında hiçbir
  yerde kullanılmıyorlar (`src/` ve `index.html` grep'lendi, sıfır sonuç).
  `tools/render_preview.py` çıktıları, yani geliştirme artığı. Toplam 1,7 MB
  ölü yük hem itch zip'inde hem GitHub Pages'te. Taşımak isteniyorsa
  `render_preview.py`'nin yazdığı yol da değişmeli — o yüzden dokunulmadı.
  (Eski savaşçı seti aynı sebeple `publicDir` dışına çıkarılmıştı, 14 MB.)
- **Hiçbir şey commit edilmedi ve push edilmedi.** `main`'e push GitHub
  Actions'ı tetikleyip PWA'yı canlıya alır — bu dışa dönük bir adım, kullanıcı
  kararı bekliyor.
