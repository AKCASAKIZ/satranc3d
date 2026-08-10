# Devir notu — satranç 3D varlıkları

Bu klasördeki modeller Blender'da sıfırdan, prosedürel Python ile üretildi. Oyun tarafına geçen kişi/ajan için bilmesi gerekenler:

## Varlıklar
`glb/` — 6 taş × 2 renk = 12 GLB. Her biri kendi içinde tam: mesh + iskelet + 7 animasyon.

| | tri | yükseklik |
|---|---|---|
| pawn | 3988 | 1.05 |
| rook | 3308 | 1.16 |
| knight | 3656 | 1.25 |
| bishop | 4040 | 1.32 |
| queen | 3348 | 1.22 |
| king | 3748 | 1.36 |

## Entegrasyon sözleşmesi
- **Ölçek:** 1 birim = 1 satranç karesi. Tahtayı 8×8 birim yap, taşları kare merkezlerine koy.
- **Origin:** (0,0,0) = karenin merkezi, zemin seviyesi. Ek offset gerekmez.
- **Yön:** Blender'da karakter −Y'ye bakar, +Z yukarı. glTF Y-up olarak yazıldı. Motorunun ileri ekseni +Z ise import'ta Y ekseninde 180° döndür.
- **Node yapısı:** `CW_<Piece>_Rig` (armature) → `CW_<Piece>` (gövde mesh) + `CW_<Piece>_Base` (kaide mesh).
- **Kaide:** ayrı `plinth` kemiğine bağlı, gövde animasyonlarından etkilenmez. Dövüş sırasında gizlemek istersen `_Base` node'unu kapat.
- **Materyal:** 3 slot — `Marble_White` / `Obsidian_Black`, `Metal_Dark`, `Bronze_Accent`. Doku/UV yok, düz PBR renk.
- **Skinning:** rigid (her parça tek kemiğe %100). Heykel görünümü için kasıtlı, yumuşak deformasyon beklenmesin.

## Animasyonlar (6 taşta da aynı isimler, 24 fps)
| klip | kare | döngü | olay karesi |
|---|---|---|---|
| Idle | 1–49 | evet | — |
| Walk | 1–33 | evet | root ilerlemez, konumu motor sürer |
| Attack | 1–37 / 39 / 41 | hayır | **vuruş:** pawn+knight k.17, rook+bishop+king k.19, queen k.17 |
| Guard_Block | 1–25 | hayır | **blok:** k.13 |
| Hit_React | 1–25 | hayır | — |
| Death | 1–61 | hayır | son karede kalır (gövde zeminde) |
| Victory | 1–49 | hayır | — |

Klip isimleri taş tipinden bağımsız → tek animasyon kontrolcüsü yeterli, switch/case gerekmez.

## Önerilen dövüş akışı
```
Walk (saldıran)
→ Attack (saldıran) ∥ Guard_Block (savunan)      // vuruş karesi = blok karesi
→ Attack (saldıran) ∥ Hit_React → Death (savunan)
→ Death son karesinde bekle → taşı fade/lift ile tahtadan kaldır
→ Victory (saldıran) → Idle, hedef karede dur
```

## Bilinen sınırlar / yapılabilecekler
- Rook ve king'in kalkanı kare sınırını ~0.02 birim aşıyor.
- `Death` klibinde gövde ~1.0–1.2 birim geriye uzanıyor (yan karelere taşabilir). Daha derli toplu "yere yığılma" varyantı yapılabilir.
- Doku yok. PBR texture / normal map istenirse eklenebilir.
- Kaynak `blend/chess_warriors.blend` içinde 42 action var (`Pawn_Idle`, `King_Attack` … ön ekli). Modeller prosedürel üretildi; yeniden üretim scripti Blender oturumunda `cw` modülü olarak duruyordu, kalıcı değil — değişiklik gerekirse .blend üzerinden gidin.
