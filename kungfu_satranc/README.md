# Kung-Fu Satranç Seti (Şaolin)

Keşiş dövüşçü temalı, tam iskeletli ve animasyonlu satranç taşları. Oyun motoruna hazır glTF/GLB.

## İçerik

```
kungfu_satranc/
├── glb/         12 dosya — 6 taş × beyaz/siyah
├── preview/     referans render'lar
└── README.md    bu dosya
```

Dosya adları: `chess_{pawn|rook|knight|bishop|queen|king}_{white|black}.glb`

## Taşlar

| Taş | Karakter | Silah | Tri | Boy (birim) |
|---|---|---|---|---|
| Piyon | Acemi keşiş, yeşim alın bandı | Kısa bo sopası | 4.256 | 0.99 |
| Kale | Demir muhafız, iri yapılı, topuz saç | Keşiş küreği (monk spade) | 4.852 | 1.15 |
| At | Kaplan stili, hasır konik şapka | Çift kanca kılıç | 4.756 | 1.13 |
| Fil | Yaşlı usta, sakal + topuz | Katlanır yelpaze + tespih | 5.520 | 1.17 |
| Vezir | Turna stili savaşçı, saç tokası | Çift kelebek bıçağı | 4.768 | 1.18 |
| Şah | Başrahip, hale + kaşaya | Guandao (kılıç mızrak) | 5.956 | 1.40 |

Toplam 12 GLB ≈ 12 MB.

## Entegrasyon sözleşmesi

- **Ölçek:** 1 birim = 1 satranç karesi. Tahta 8×8 birim, taş kare merkezine.
- **Origin:** (0,0,0) = karenin merkezi, zemin seviyesi. Ek offset yok.
- **Yön:** karakter **−Y**'ye bakar, +Z yukarı. glTF Y-up yazıldı. Motorunun ileri ekseni +Z ise import'ta Y'de 180° döndür.
- **İskelet:** 21 kemik, altı taşta birebir aynı:
  `root`, `plinth`, `pelvis`, `spine`, `chest`, `neck`, `head`,
  `shoulder/upperarm/forearm/hand` × `.L/.R`, `thigh/shin/foot` × `.L/.R`
- **Node yapısı:** `CW_<Piece>_Rig` (armature) → `CW_<Piece>` (gövde) + `CW_<Piece>_Base` (kaide)
- **Kaide:** ayrı `plinth` kemiğine bağlı, gövde animasyonundan etkilenmez — taş yürürken/devrilirken kaide karesinde sabit kalır. Dövüşte gizlemek istersen `_Base` node'unu kapat.
- **Skinning:** rigid (her parça tek kemiğe %100). Stilize görünüm için kasıtlı.
- **Materyal:** dokusuz düz PBR — `Robe_Saffron`/`Robe_Ink`, `Jade_Green`, `Wood_Dark`, `Marble_White`/`Obsidian_Black`
- **FPS:** 24

## Animasyon klipleri (her taşta aynı 13 klip)

| Klip | Kare | Döngü | Olay karesi / not |
|---|---|---|---|
| `Idle` | 1–53 | ✅ | Dövüş duruşu, nefes |
| `Stance_Ready` | 1–49 | ✅ | Ma bu (at duruşu), alternatif bekleme |
| `Walk` | 1–37 | ✅ | Kedi adımı — root ilerlemez, konumu motor sürer |
| `Attack` | 1–33 | ❌ | Düz yumruk/avuç — **vuruş k.16** |
| `Attack_Kick` | 1–37 | ❌ | Ön şnel tekme — **vuruş k.18** |
| `Attack_Combo` | 1–73 | ❌ | Yumruk–yumruk–dönen arka tekme — **k.16 / k.30 / k.54** |
| `Guard_Block` | 1–25 | ❌ | Çapraz kol bloğu — **etki k.13** |
| `Hit_React` | 1–25 | ❌ | Darbe yeme |
| `Dodge` | 1–29 | ❌ | Geriye kaykılma — **kaçınma k.14** |
| `Backflip` | 1–37 | ❌ | Geri takla — **karakteri ~0.52 birim geri taşır** |
| `Death` | 1–65 | ❌ | Diz çökme → devrilme, son karede kalır |
| `Salute` | 1–53 | ❌ | Bao quan li selamı |
| `Victory` | 1–57 | ❌ | Beyaz turna duruşu |

Klip isimleri taş tipinden bağımsız → tek animasyon kontrolcüsü yeterli, switch/case gerekmez.

## Dövüş akışı

Kim kimi yiyor bilgisini motor yönetir; 36 ayrı eşleşme animasyonu gerekmez. Saldıran ve savunan kendi klibini oynatır, motor sadece zamanlamayı senkronlar.

**Kısa:**
```
Walk (saldıran)  → hedef kareye yaklaş
Attack ∥ Guard_Block            // vuruş karesi = blok karesi
Attack ∥ Hit_React → Death
Death son karesinde bekle → taşı fade/lift ile kaldır
Victory → Idle
```

**Uzun düello:**
```
Salute ∥ Salute
Attack_Combo ∥ Dodge → Backflip
Attack_Kick ∥ Hit_React → Death
Victory
```

## Dikkat

- `Backflip` bitişte karakteri ~0.52 birim geride bırakır; klip bitince transform'u sıfırla ya da hareketi oyun mantığına dahil et.
- `Death` klibinde gövde ~1.0–1.2 birim geriye uzanır, yan karelere taşabilir. Taş zaten kaldırılacağı için genelde sorun değil.
- Doku/UV yok; renkler materyal bazlı.

## Hızlı doğrulama

```bash
python3 - <<'EOF'
import json,struct,glob
for fn in sorted(glob.glob('glb/*.glb')):
    d=open(fn,'rb').read(); off=12; js=None; ln=struct.unpack('<III',d[:12])[2]
    while off<ln:
        cl,ct=struct.unpack('<II',d[off:off+8])
        if ct==0x4E4F534A: js=json.loads(d[off+8:off+8+cl])
        off+=8+cl+((4-cl%4)%4 if cl%4 else 0)
    print(fn, len(js['skins'][0]['joints']),'kemik', len(js.get('animations',[])),'klip')
EOF
```
Beklenen: her dosyada **21 kemik, 13 klip**.
