# Satranç Savaşçıları — 6 taş, tam set

Ortaçağ savaşçısı konseptinde, mermer/obsidyen heykel stili satranç taşları. Hepsi iskeletli, animasyonlu, oyun motoruna hazır.

## Dosyalar

`glb/` klasöründe her taşın beyaz ve siyah varyantı:

```
chess_pawn_white.glb     chess_pawn_black.glb
chess_rook_white.glb     chess_rook_black.glb
chess_knight_white.glb   chess_knight_black.glb
chess_bishop_white.glb   chess_bishop_black.glb
chess_queen_white.glb    chess_queen_black.glb
chess_king_white.glb     chess_king_black.glb
```

Ek: `chess_warriors.blend` (kaynak, 42 action ile), `lineup.png`, `combat_sheet.png`, `pawn_animations.gif`.

## Taşlar

| Taş | Karakter | Silah | Saldırı tipi | Tri | Yükseklik |
|---|---|---|---|---|---|
| Piyon | Ayak askeri, çan kask | Mızrak + yuvarlak kalkan | saplama | 3.988 | 1.05 |
| Kale | Kule muhafızı, mazgallı miğfer | Balyoz + kule kalkanı | tepeden vuruş | 3.308 | 1.16 |
| At | Şövalye, at başlı miğfer | Mızrak + damla kalkan | saplama (hücum) | 3.656 | 1.25 |
| Fil | Savaşçı rahip, mitra | Asa + kitap | tepeden vuruş | 4.040 | 1.32 |
| Vezir | Savaş kraliçesi, taç | Çift kılıç | dönerek biçme | 3.348 | 1.22 |
| Şah | Kral, haçlı taç | Pala + yuvarlak kalkan | tepeden vuruş | 3.748 | 1.36 |

Toplam 12 GLB ≈ 7.3 MB.

## Ortak teknik yapı

Altı taşın **hepsi birebir aynı iskeleti ve aynı klip isimlerini** kullanır — motor tarafında tek bir animasyon kontrolcüsü yeter, retarget gerekmez.

- **Kemik:** 21 — `root`, `plinth`, `pelvis`, `spine`, `chest`, `neck`, `head`, `shoulder/upperarm/forearm/hand .L/.R`, `thigh/shin/foot .L/.R`
- **Materyal:** 3 slot — `Marble_White` veya `Obsidian_Black`, `Metal_Dark`, `Bronze_Accent`
- **Skinning:** rigid (heykel görünümü için kasıtlı)
- **Ölçek:** 1 birim = 1 satranç karesi, origin (0,0,0) = karenin merkezi + zemin
- **Yön:** karakter **−Y**'ye bakar, +Z yukarı
- **FPS:** 24

### Kaide (`plinth`)
Kaide ayrı bir kök kemiğe bağlıdır, gövde hareketlerinden etkilenmez. Karakter hamle yapıp devrilirken kaide karesinde sabit kalır. İstersen dövüş sırasında `*_Base` node'unu gizle.

## Animasyon klipleri (her taşta aynı 7 klip)

| Klip | Kare | Döngü | Not |
|---|---|---|---|
| `Idle` | 1–49 | ✅ | Bekleme |
| `Walk` | 1–33 | ✅ | Yürüyüş döngüsü, root ilerlemez — konumu motor sürer |
| `Attack` | 1–37/39/41 | ❌ | Vuruş anı: saplama **k.17**, tepeden vuruş **k.19**, dönerek **k.17** |
| `Guard_Block` | 1–25 | ❌ | Blok, etki anı **k.13** |
| `Hit_React` | 1–25 | ❌ | Darbe yeme |
| `Death` | 1–61 | ❌ | Diz çökme → devrilme, son karede gövde zeminde kalır |
| `Victory` | 1–49 | ❌ | Zafer |

`.blend` içinde klipler `Pawn_Idle`, `King_Attack` gibi ön ekli; GLB içinde sade isimlerle (`Idle`, `Attack`, …).

## Dövüş akışı (motor tarafı)

Kim kimi yiyor bilgisini motor yönetir; 36 ayrı eşleşme animasyonu gerekmez:

```
1. Saldıran:  Walk                → hedef kareye yaklaş
2. Saldıran:  Attack     ┐
   Savunan:   Guard_Block ┘        senkron: vuruş karesi = blok karesi
3. Saldıran:  Attack     ┐
   Savunan:   Hit_React → Death ┘  ikinci vuruş ölümcül
4. Savunan:   Death son karesinde kalır → motor taşı fade/lift ile tahtadan alır
5. Saldıran:  Victory → Idle, hedef karede durur
```

Sadece klip isimlerini ve vuruş karelerini bilmen yeterli — taş tipine göre dallanma gerekmiyor.

## Bilinen sınırlar

- Kale ve şahın kalkan/silah genişliği kare sınırını ~0.02 birim aşıyor; komşu kareyle görsel çakışma olabilirse kalkanı biraz içeri alabilirim.
- `Death` klibinde gövde ~1.0–1.2 birim geriye uzanıyor. Taş zaten tahtadan kaldırılacağı için sorun değil, ama isterseniz daha derli toplu bir "yere yığılma" versiyonu yapılabilir.
- Doku (UV/texture) yok; renkler materyal bazlı. PBR doku istersen ayrıca eklenebilir.

## Parçalanma — ağır taşlar dağılıyor

`src/fx/shatter.js` kurbanın **kendi geometrisini** üçgenlerine ayırıp savuruyor;
jenerik toz bulutu değil, gerçekten o taşın parçaları. Hareketin tamamı vertex
shader'da: tek draw call, mobilde bedava. Rastgelelik sabit tohumlu, yani klip
kaydı kare kare aynı çıkıyor.

**Sadece ağır taşlarda** (`PARCALANAN = q, k, r`). Sebep: bir partide 20-30 yeme
oluyor; her birinde aynı gösteriyi oynatmak beşincide yormaya başlıyor. Taban
değil **tavan** yükseltiliyor — piyon sakince ölüyor, vezir dağılıyor. Nadir
olduğu için etkisini koruyor.

Zamanlama ölüm klibinin **gövde-çarpma anına** bağlı (0,42 sn): önce figür
devriliyor, yere çarpınca patlıyor. Önce patlatmak devrilmeyi anlamsız kılardı.

> !! **Poz pişirilmeden patlatılamaz.** Taşlar `SkinnedMesh` ve geometri BIND
> pozunda duruyor; ham geometriyi patlatırsan parçalar yatmış karakterin değil
> AYAKTA duranın parçaları olur ve ilk karede görünür bir sıçrama çıkar.
> `pozuPisir()` `applyBoneTransform` ile o anki pozu düz geometriye çeviriyor.
> Ucuz çalışıyor çünkü set **rigid skinli** (her tepe noktası tek kemiğe %100),
> yani sonuç yaklaşım değil tam.

> Parçalar oyunun **ölçekli saatinden** besleniyor (`clock`), gerçek zamandan
> değil: yavaş çekimde ve donmada havada asılı kalıyorlar, sahneden kopmuyorlar.

## Mat sahnesi

Şah satrançta **hiç yenmez** — mat, o alınmadan önce oyunu bitirir. Yani yeme
akışındaki öldürüş sahnesi burada çalışmaz; final ayrıca sahneleniyor:
gökten ışın iner → kaybeden şah ışığa yükselir → **kazanan tarafın bütün
taşları zafer duruşuna geçip zıplar** → rövanş perdesi gelir.

Kazananın sevinmesi süsleme değil **tutma aracı**: oyuncu kazandığında ödül,
kaybettiğinde intikam duygusu veriyor; ikisi de rövanşa basmaya itiyor.

Kutlamada zıplamalar küçük gecikmelerle dağıtılıyor — hepsi aynı anda
zıplayınca mekanik duruyor.

> !! **Arka plandaki sekmede `requestAnimationFrame` çalışmıyor.** Sahne
> "donmuş" görünür ama kod doğrudur; Chrome görünmeyen sekmede rAF'ı
> durduruyor. Geliştirmede `__adim(dt, kere)` kancası saati elle ilerletiyor,
> `__mat("w")` sahneyi tetikliyor, `__tani()` şahın yüksekliğini veriyor.
> Üçü de `import.meta.env.DEV` içinde — üretim derlemesine girmiyorlar
> (doğrulandı: `dist` içinde 0 eşleşme).

## Çevreler — tahtanın durduğu yer

Her tema artık bir **çevre** de getiriyor (`src/env.js`): sis, zemin, uzak
silüetler, fenerler. Boşluk · Şaolin avlusu · dağ tepesi · gece tapınağı ·
bambu ormanı · çöl.

**Çevre ayrı bir seçici DEĞİL, bilerek.** İki ayrı seçici bırakılsaydı oyuncu
okunmaz kombinasyonlar kurabilirdi (parlak çevre + düşük kontrastlı tahta).
Tek seçici tasarım kuralını koruyor.

Kural — çevre **atmosferdir, sahne değil**: her şey koyu, düşük kontrastlı,
uzak ve silüet. Tahta her zaman sahnenin en parlak yüzeyi kalmalı. Battle
Chess'i öldüren şey tam olarak buydu.

Sis en ucuz araç: uzağı yutuyor, derinlik veriyor, modelleme istemiyor.
Sis rengi arka planla **aynı** olmalı, yoksa ufukta görünür bir kesik çizgi
oluşuyor.

> Silüetler tohumlu üretiliyor: aynı çevre her açılışta aynı, klip kaydı da
> kare kare sabit kalıyor.

**Neden önemli:** aynı düello farklı çevrede yeni bir klip demek — 30 eşleşme
× 6 çevre = 180 video. Ve CrazyGames'te ödüllü reklamın karşılığı olacak şey
bu: satranç partisi uzun olduğu için reklam gösterimi az; çevre açmak
("reklamı izle, bambu ormanını aç") oyuncuyu rahatsız etmeden gelir üretiyor.

