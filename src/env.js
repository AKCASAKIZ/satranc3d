import * as THREE from "three";

/**
 * ÇEVRE: tahtanın durduğu yer.
 *
 * Kural — çevre ATMOSFER'dir, sahne değil. Tahtanın arkasında detaylı bir
 * tapınak olursa taşlar okunmaz; Battle Chess'i öldüren tam olarak buydu ve
 * bu projenin ana tasarım kuralı da aynı şeyi söylüyor (bkz. themes.js).
 * Bu yüzden buradaki her şey:
 *   - KOYU ve düşük kontrastlı (tahta hep en parlak yüzey kalmalı)
 *   - UZAK (yakın hiçbir nesne yok, kamera açısını kapatmasın)
 *   - SİLUET (detay yok, sadece biçim)
 *
 * Sis en ucuz ve en etkili araç: uzağı yutuyor, derinlik veriyor, hiçbir
 * modelleme istemiyor.
 */

const KOK_ADI = "cevre";

/** Silüet halkası: tahtanın etrafında, uzakta, dağınık dikey biçimler. */
function siluetHalkasi(tur, renk, sayi = 26, mesafe = 15) {
  const grup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: renk, fog: true });

  // Tohumlu: aynı çevre her açılışta aynı görünsün, klip kaydı da sabit kalsın
  let s = 20260811;
  const rand = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };

  for (let i = 0; i < sayi; i++) {
    const aci = (i / sayi) * Math.PI * 2 + (rand() - 0.5) * 0.22;
    const uzaklik = mesafe + rand() * 9;
    let geo;
    if (tur === "bambu") {
      geo = new THREE.CylinderGeometry(0.12, 0.15, 7 + rand() * 7, 5);
    } else if (tur === "sutun") {
      geo = new THREE.CylinderGeometry(0.55, 0.62, 5.5 + rand() * 2.5, 7);
    } else if (tur === "zirve") {
      geo = new THREE.ConeGeometry(2.6 + rand() * 2.4, 5 + rand() * 6, 5);
    } else {
      continue;
    }
    const m = new THREE.Mesh(geo, mat);
    const y = geo.parameters.height ?? 6;
    m.position.set(Math.cos(aci) * uzaklik, y / 2 - 0.4, Math.sin(aci) * uzaklik);
    m.rotation.y = rand() * Math.PI;
    grup.add(m);
  }
  return grup;
}

/**
 * Çevreyi kurar. Öncekini temizleyip yenisini ekler; tema değişimi sırasında
 * birikme olmasın.
 */
export function applyEnvironment(scene, env) {
  const eski = scene.getObjectByName(KOK_ADI);
  if (eski) {
    eski.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    scene.remove(eski);
  }
  scene.fog = null;
  if (!env) return;

  const kok = new THREE.Group();
  kok.name = KOK_ADI;

  // Sis: uzağı yutuyor. Rengi arka planla AYNI olmalı, yoksa ufukta
  // görünür bir kesik çizgi oluşuyor.
  if (env.sis) {
    scene.fog = new THREE.Fog(env.sis.renk, env.sis.yakin, env.sis.uzak);
  }

  // Zemin: tahtanın altında ve çok ötesinde. Tahtadan KOYU olmalı ki
  // tahta yüzer gibi dursun ve sınırı belli olsun.
  if (env.zemin != null) {
    const zemin = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ color: env.zemin, roughness: 1, metalness: 0 })
    );
    zemin.rotation.x = -Math.PI / 2;
    zemin.position.y = -0.42;              // tahta çerçevesinin hemen altı
    zemin.receiveShadow = true;
    kok.add(zemin);
  }

  if (env.siluet) {
    kok.add(siluetHalkasi(env.siluet.tur, env.siluet.renk, env.siluet.sayi, env.siluet.mesafe));
  }

  // Fenerler: sıcak nokta ışıklar. Tahtayı aydınlatmıyorlar (menzil kısa),
  // sadece uzakta duruyorlar — amaç ışık değil, derinlik.
  if (env.fener) {
    for (let i = 0; i < env.fener.sayi; i++) {
      const aci = (i / env.fener.sayi) * Math.PI * 2 + 0.3;
      const r = env.fener.mesafe;
      const kure = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 10, 8),
        new THREE.MeshBasicMaterial({ color: env.fener.renk, fog: false })
      );
      kure.position.set(Math.cos(aci) * r, 2.4 + Math.sin(i * 2.3) * 0.8, Math.sin(aci) * r);
      kok.add(kure);
    }
  }

  scene.add(kok);
}
