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
