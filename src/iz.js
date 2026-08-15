import * as THREE from "three";
import { squareToWorld } from "./board.js";

/**
 * TAHTANIN YIPRANMASI
 *
 * Oyun ilerledikce tahtada iz birikiyor: taslarin yurudugu hatlar asiniyor,
 * yeme yapilan karelerde koyu leke kaliyor, agir darbelerde catlak
 * aciliyor. Partinin sonunda tahta acilistaki tahta degil -- oyunun kendisi
 * uzerine yazilmis oluyor.
 *
 * NEDEN AYRI BIR DUZLEM, tahtanin materyaline dokunmak yerine:
 * tahtanin 64 karesi IKI materyali paylasiyor (acik/koyu) ve her kare kendi
 * BoxGeometry'sinin 0..1 UV'sini kullaniyor. Tek bir tahta-boyu doku
 * takilsaydi her karede bastan tekrar ederdi; kare basina materyal
 * cogaltmak ise iki materyali 64'e cikarirdi. Ustte duran tek bir saydam
 * duzlem, tek doku, tek draw call -- ve tahtanin mevcut kodu hic
 * degismiyor.
 *
 * Yukseklik sirasi onemli: kareler y=0, izler y=0.006, vurgular y=0.011.
 * Izler vurgularin ALTINDA kalmali, yoksa secili kare halkasi kirleniyor.
 */

const BOYUT = 1024; // doku kenari (px) -- kare basina 128 px
const PX = BOYUT / 8;
/* Iz rengi siyah DEGIL koyu kahve: siyah golge gibi okunuyor, tahtanin
   uzerinde "kir/asinma" hissi vermiyor. */
const IZ_RENK = "22,15,9";

/** Tohumlu rastgele: ayni parti ayni izleri birakmali (klip kaydi deterministik). */
function rastgeleUret(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Dunya koordinati -> doku pikseli. Tahta -4..4 araliginda, kare 128 px. */
function pikse(v) {
  return { x: (v.x + 4) * PX, y: (v.z + 4) * PX };
}

export function createIz() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = BOYUT;
  const ctx = canvas.getContext("2d");

  // Beyaz zemin: carpan karisimda beyaz = "dokunma" demek
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, BOYUT, BOYUT);

  const doku = new THREE.CanvasTexture(canvas);
  doku.colorSpace = THREE.SRGBColorSpace;
  doku.anisotropy = 4;

  /* CARPAN karisim, saydam bindirme DEGIL.
     Once saydam bir katman olarak cizildi ve ekranda olculdu: koyu kahve
     lekeler acik karelerin uzerinde GRI boya gibi duruyordu, cunku alfa
     harmani tahtanin rengini kendi rengiyle degistiriyor. Carpan karisimda
     doku tahtanin rengini BOLUYOR -- acik kare kirli krem, koyu kare kirli
     kahve oluyor, yani her kare kendi tonunda kirleniyor. Bunun kosulu
     dokunun BEYAZ baslamasi: beyaz carpim = degisiklik yok.

     !! THREE.MultiplyBlending KULLANILMIYOR ve bu bir tercih degil olcum:
     bu kurulumda (three 0.185, ACES tone mapping) hazir sabitle duzlem
     tahtanin ustune DUZ BEYAZ basiyor, satranc tahtasi tamamen kayboluyor
     -- ekranda goruldu. Ayni carpani elle kurunca (ZERO, SRC_COLOR)
     dogru calisiyor. Sabiti geri takmadan once tahtanin kaybolup
     kaybolmadigina bak. */
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({
      map: doku,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      depthWrite: false,
      // Tahtayla ayni duzleme cok yakin duruyor; z-kavgasini onler
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  mesh.renderOrder = 1;
  mesh.name = "iz";

  let rast = rastgeleUret(20260816);
  let hamle = 0;

  const kirlet = () => { doku.needsUpdate = true; };

  /**
   * Yuruyus izi: iki kare arasinda asinma serigi + adim lekeleri.
   * Cizgi tek basina yetmiyor -- duz bir sirit "yol" gibi duruyor;
   * adimlar hattin uzerine dagilinca "gecilmis" gorunuyor.
   */
  function yuruyus(fromSquare, toSquare, { agirlik = 1 } = {}) {
    const a = pikse(squareToWorld(fromSquare));
    const b = pikse(squareToWorld(toSquare));
    hamle++;

    ctx.save();
    ctx.strokeStyle = `rgba(${IZ_RENK},${0.035 * agirlik})`;
    ctx.lineWidth = 30 * agirlik;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Adimlar: hat boyunca, iki yana donusumlu kaydirilmis kucuk lekeler
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const uzunluk = Math.hypot(dx, dy);
    const adimSayisi = Math.max(2, Math.round(uzunluk / 34));
    const nx = -dy / (uzunluk || 1);
    const ny = dx / (uzunluk || 1);
    for (let i = 0; i <= adimSayisi; i++) {
      const t = i / adimSayisi;
      const yan = (i % 2 === 0 ? 1 : -1) * (7 + rast() * 3);
      const x = a.x + dx * t + nx * yan;
      const y = a.y + dy * t + ny * yan;
      ctx.fillStyle = `rgba(${IZ_RENK},${(0.03 + rast() * 0.04) * agirlik})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 7 + rast() * 3, 4.5 + rast() * 2, Math.atan2(dy, dx), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    kirlet();
  }

  /** Yeme lekesi: kurbanin dustugu karede kalici koyu iz. */
  function oldurus(square, { guc = 1 } = {}) {
    const p = pikse(squareToWorld(square));
    const r = 34 + 22 * guc;
    ctx.save();
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r);
    g.addColorStop(0, `rgba(${IZ_RENK},${0.34 * guc})`);
    g.addColorStop(0.55, `rgba(${IZ_RENK},${0.16 * guc})`);
    g.addColorStop(1, `rgba(${IZ_RENK},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Sicrama: lekenin cevresine birkac kucuk nokta. Tam daire "leke"
    // degil "golge" gibi duruyordu.
    for (let i = 0; i < 7; i++) {
      const aci = rast() * Math.PI * 2;
      const uz = r * (0.6 + rast() * 0.75);
      ctx.fillStyle = `rgba(${IZ_RENK},${0.12 + rast() * 0.16})`;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(aci) * uz, p.y + Math.sin(aci) * uz, 1.5 + rast() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    kirlet();
  }

  /**
   * Catlak: agir darbelerde (sparta tekmesinin govde carpmasi, vezirin
   * kesigi) merkezden disari kirilan cizgiler.
   */
  function catlak(square, { guc = 1, kol = 5 } = {}) {
    const p = pikse(squareToWorld(square));
    ctx.save();
    ctx.strokeStyle = `rgba(${IZ_RENK},${0.32 * guc})`;
    ctx.lineCap = "round";
    for (let i = 0; i < kol; i++) {
      let aci = rast() * Math.PI * 2;
      let x = p.x;
      let y = p.y;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      // Kirilma duz gitmez: her parcada aci sapiyor ve cizgi inceliyor
      const parca = 3 + Math.floor(rast() * 3);
      for (let j = 0; j < parca; j++) {
        const boy = (16 + rast() * 26) * guc;
        aci += (rast() - 0.5) * 1.1;
        x += Math.cos(aci) * boy;
        y += Math.sin(aci) * boy;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    kirlet();
  }

  /** Yeni parti: tahta temiz baslamali. */
  function sifirla() {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, BOYUT, BOYUT);
    rast = rastgeleUret(20260816);
    hamle = 0;
    kirlet();
  }

  return {
    mesh,
    yuruyus,
    oldurus,
    catlak,
    sifirla,
    /** Kac hamlelik iz birikti -- teshis icin. */
    get hamle() { return hamle; },
  };
}
