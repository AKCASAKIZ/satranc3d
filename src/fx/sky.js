import * as THREE from "three";

/**
 * Gokyuzu efektleri: YILDIRIM (vezir yenince) ve ISIN (sah mat olunca).
 *
 * Ikisi de kasitli olarak birbirinin zitti:
 *   yildirim  -> asagi vurur, kirik hatli, ani, beyaz-mavi, gok gurultusu
 *   isin      -> yukari kaldirir, duz sutun, yavas, sicak beyaz, yukselen ton
 * Ayni sahnede ikisi de kullanildigi icin bu zitlik onemli; benzer
 * yapilirlarsa iki sahne birbirinin tekrari gibi duruyor.
 *
 * Ikisi de sahneye eklenip her karede `update(dt)` ile suruluyor; `true`
 * donunce omru bitmis demektir, cagri yeri sahneden cikarip `dispose` eder.
 * Zaman OYUNUN olcekli saatinden geliyor (clock), gercek zamandan degil -
 * yavas cekimde ve donmada sahneyle birlikte yavasliyorlar.
 */

/** Tohumlu rastgele: ayni tohum ayni simsek. Klip kaydi deterministik kalsin. */
function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * Kirik hatli bir simsek govdesi uretir: tepeden hedefe inen, her adimda
 * yanlara sapan bir yol. Yol kamera-bagimsiz olsun diye SERIT degil, iki
 * dik duzlemden olusan bir "hac" kesit kullaniliyor - hangi acidan
 * bakilirsa bakilsin kalinligi kayboluyor gibi gorunmuyor.
 */
function boltGeometry(hedef, { seed = 7, yukseklik = 9, adim = 14, sapma = 0.42, kalinlik = 0.12 } = {}) {
  const rand = makeRandom(seed);
  const noktalar = [];
  for (let i = 0; i <= adim; i++) {
    const k = i / adim;
    const y = yukseklik * (1 - k);
    // Sapma asagi indikce azaliyor: ucu hedefe tam otursun
    const s = sapma * (1 - k) * (0.35 + rand());
    noktalar.push(new THREE.Vector3(
      hedef.x + (rand() - 0.5) * 2 * s,
      hedef.y + y,
      hedef.z + (rand() - 0.5) * 2 * s
    ));
  }
  noktalar[noktalar.length - 1].set(hedef.x, hedef.y, hedef.z);

  const pos = [];
  for (let i = 0; i < noktalar.length - 1; i++) {
    const a = noktalar[i], b = noktalar[i + 1];
    // Iki dik duzlem (XY ve ZY): her acidan gorunur kalinlik
    for (const [dx, dz] of [[kalinlik, 0], [0, kalinlik]]) {
      pos.push(
        a.x - dx, a.y, a.z - dz, a.x + dx, a.y, a.z + dz, b.x + dx, b.y, b.z + dz,
        a.x - dx, a.y, a.z - dz, b.x + dx, b.y, b.z + dz, b.x - dx, b.y, b.z - dz
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/**
 * Yildirim. `hedef` dunya koordinati (kurbanin ayagi).
 *
 * Sonme duz degil KIRPISARAK: gercek simsek birkac kez parliyor. Duz fade
 * ile denendiginde "cizgi silindi" gibi duruyordu, kirpisma canlandirdi.
 */
export function createLightning(hedef, { seed = 7, life = 0.55 } = {}) {
  const grup = new THREE.Group();

  const govde = new THREE.Mesh(
    boltGeometry(hedef, { seed }),
    new THREE.MeshBasicMaterial({
      color: 0xdcefff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  grup.add(govde);

  // Ikinci, daha kalin ve sonuk kopya: hale etkisi (bloom olmadan)
  // !! Hale OLCEKLENEREK yapilamaz: geometri dunya koordinatlarinda uretiliyor,
  //    scale onu sahnenin merkezine dogru cekiyor ve simsek hedeften kayiyor.
  //    Onun yerine daha KALIN bir govde uretiliyor.
  const hale = new THREE.Mesh(
    boltGeometry(hedef, { seed: seed + 1, sapma: 0.5, kalinlik: 0.34 }),
    new THREE.MeshBasicMaterial({
      color: 0x6fa8ff, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  grup.add(hale);

  // Carpma noktasinda yere yayilan isik
  const yerIsigi = new THREE.PointLight(0xbcd8ff, 0, 6);
  yerIsigi.position.set(hedef.x, hedef.y + 0.35, hedef.z);
  grup.add(yerIsigi);

  let t = 0;
  return {
    mesh: grup,
    update(dt) {
      t += dt;
      const k = t / life;
      if (k >= 1) return true;
      // Kirpisma: hizli kare dalga + genel sonme
      const kirpis = (Math.sin(t * 62) > -0.35 ? 1 : 0.25) * (1 - k) ** 1.6;
      govde.material.opacity = kirpis;
      hale.material.opacity = 0.45 * kirpis;
      yerIsigi.intensity = 14 * kirpis;
      return false;
    },
    dispose() {
      govde.geometry.dispose(); govde.material.dispose();
      hale.geometry.dispose(); hale.material.dispose();
    },
  };
}

/**
 * Isin sutunu. Sah mat olunca gokten iniyor ve sahi yukari aliyor.
 *
 * Sutun ASAGI dogru inceliyor (konik): boylece kaynagi yukarida, genis ve
 * uzak hissediliyor. Silindir denendi, "tup" gibi duruyordu.
 */
export function createBeam(hedef, { life = 2.6, yukseklik = 11, yaricap = 0.62 } = {}) {
  const grup = new THREE.Group();

  const govde = new THREE.Mesh(
    new THREE.CylinderGeometry(yaricap * 1.7, yaricap * 0.5, yukseklik, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff3d0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  govde.position.set(hedef.x, hedef.y + yukseklik / 2, hedef.z);
  grup.add(govde);

  // Yerdeki halka: isinin tabana degdigi yer
  const halka = new THREE.Mesh(
    new THREE.RingGeometry(yaricap * 0.35, yaricap * 1.25, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfff3d0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  halka.rotation.x = -Math.PI / 2;
  halka.position.set(hedef.x, hedef.y + 0.02, hedef.z);
  grup.add(halka);

  const isik = new THREE.PointLight(0xfff0c8, 0, 8);
  isik.position.set(hedef.x, hedef.y + 1.4, hedef.z);
  grup.add(isik);

  let t = 0;
  return {
    mesh: grup,
    /** 0..1 arasi: sahin yukselmesi buna gore surulsun. */
    get progress() { return Math.min(1, t / life); },
    update(dt) {
      t += dt;
      const k = t / life;
      if (k >= 1) return true;
      // Hizli ac, uzun tut, yavas kapat
      const zarf = k < 0.18 ? k / 0.18 : k > 0.72 ? (1 - k) / 0.28 : 1;
      govde.material.opacity = 0.5 * zarf;
      halka.material.opacity = 0.75 * zarf;
      isik.intensity = 9 * zarf;
      halka.scale.setScalar(1 + k * 0.5);
      return false;
    },
    dispose() {
      govde.geometry.dispose(); govde.material.dispose();
      halka.geometry.dispose(); halka.material.dispose();
    },
  };
}
