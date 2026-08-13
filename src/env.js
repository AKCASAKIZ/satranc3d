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

/* ---------- ORTAM HARITASI (IBL) ----------
 *
 * Sahnede uzun sure sadece uc isik vardi: bir yon isigi, bir dolgu, bir de
 * duz ambient. Duz ambient'in sorunu su: her yuzeyi ayni miktarda
 * aydinlatiyor, dolayisiyla YON bilgisi tasimiyor. Golgede kalan her yuzey
 * ayni donuk renge duz oturuyor ve malzemeler "plastik" gorunuyor -- oyunun
 * ucuz durmasinin ana sebebi buydu.
 *
 * Ortam haritasi bunu tek hamlede cozuyor: yukaridan gok, asagidan koyu
 * zemin geliyor, yani yuzeyin baktigi yon rengini degistiriyor. Bedava
 * degil ama neredeyse: 64x32'lik bir gradyan yetiyor, cunku PMREM zaten
 * bulanik hale getiriyor.
 *
 * HDR DOSYASI KULLANILMIYOR, bilerek. Bir .hdr indirmek hem 1-2 MB yuk
 * (oyun su an toplam 7 MB ve CrazyGames yukleme suresine bakiyor) hem de
 * TEK bir isik atmosferi demek. Burada harita TEMADAN tureiyor: gece
 * temasinda mavi, kum temasinda sicak. Alti tema, alti ortam, sifir dosya.
 */

let _renderer = null;
let _pmrem = null;
let _ortamRT = null;

/**
 * Renderer'i kur: golge + tone mapping + PMREM kaydi.
 *
 * !! TEK YERDEN. Sahnede UC renderer var -- oyun (main.js), kare dogrulama
 * (demo.js) ve KLIP KAYDI (record.js). Ucu de ayni ayarlari almazsa klipler
 * oyundan sapar; projenin kurali kliplerin oyunla birebir ayni gorunmesi
 * (ses tarafinda ayni sebeple tek voice kodu kullaniliyor). Once bu ayarlar
 * uc dosyaya elle kopyalanmisti ve tone mapping eklenince yalniz oyun
 * degismisti: klipler eski duz goruntude kaliyordu.
 */
export function renderAyarla(renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // PMREM uretici renderer'a bagli: renderer degisince eskisi cope.
  if (_renderer !== renderer) {
    _pmrem?.dispose();
    _pmrem = null;
    _renderer = renderer;
  }
}

/* Klip ve demo yolunun ortam renkleri: klasik temanin degerleri.
   O modlarda tema uygulanmadigi icin elde tema nesnesi yok. */
export const VARSAYILAN_ORTAM = { bg: 0x151719, zemin: 0x0d0f11 };

/**
 * Ortam haritasini dogrudan kur. Tema uygulanmayan yollar icin (demo ve
 * klip kaydi `createUI`'yi hic cagirmiyor, dolayisiyla `applyTheme` de
 * calismiyor) -- bu cagri olmazsa o modlarda IBL hic devreye girmiyor ve
 * taslar oyundakinden duz gorunuyor.
 */
export function ortamKur(scene, bg, zemin) {
  ortamUygula(scene, bg, zemin);
}

/** Iki sRGB hex'i karistir. */
function karistir(a, b, k) {
  const kanal = (kaydir) => {
    const x = (a >> kaydir) & 255;
    const y = (b >> kaydir) & 255;
    return Math.round(x + (y - x) * k);
  };
  return (kanal(16) << 16) | (kanal(8) << 8) | kanal(0);
}

const hexYazi = (h) => `#${h.toString(16).padStart(6, "0")}`;

/**
 * Tema renklerinden dikey gradyan ortam haritasi uretir.
 *
 * Gok rengi arka planin ACILMIS hali: ham `bg` kullanilsaydi (ornegin
 * klasik temada 0x151719) harita neredeyse siyah olurdu ve hicbir isik
 * katmazdi -- IBL'in anlami kalmazdi. Asagisi `zemin`, yani yerden gelen
 * yansima koyu; yuzeyin ustu ile alti arasindaki bu fark taslara hacim
 * veren sey.
 */
function ortamHaritasi(bg, zemin) {
  /* !! EQUIRECT 2:1 OLMALI (genis ve kisa): yatay eksen 360 derece boylam,
     dikey eksen 180 derece enlem. Ilk denemede 16x64 yazilmisti -- yani
     oran ters cevrilmisti; harita ekranda olculdu ve hicbir isik katmiyordu
     (environmentIntensity 8'e cikarilinca bile sahne kilini kipirdatmadi). */
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0.0, hexYazi(karistir(bg, 0xffffff, 0.62))); // gok
  grad.addColorStop(0.45, hexYazi(karistir(bg, 0xffffff, 0.3))); // ufuk ustu
  grad.addColorStop(0.55, hexYazi(karistir(bg, 0xffffff, 0.12))); // ufuk
  grad.addColorStop(1.0, hexYazi(zemin ?? bg)); // yer
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  _pmrem ??= new THREE.PMREMGenerator(_renderer);
  const rt = _pmrem.fromEquirectangular(tex);
  tex.dispose();
  return rt;
}

/** Temaya gore sahnenin ortam haritasini yenile. Eskisini serbest birakir. */
function ortamUygula(scene, bg, zemin) {
  if (!_renderer) return; // demo/kayit yolu renderer kaydetmemis olabilir
  _ortamRT?.dispose();
  _ortamRT = ortamHaritasi(bg, zemin);
  scene.environment = _ortamRT.texture;
}

/* Rüzgârda salınan çim.
 *
 * "Belli belirsiz" şartı teknik bir kısıt: salınım genliği küçük, hızı
 * düşük ve renk zeminden az farklı. Belirgin yapılırsa tahtadan dikkat
 * çalıyor — çevre kuralının ihlali.
 *
 * Bütün hareket VERTEX SHADER'da: binlerce çim tek draw call, mobilde
 * bedava. CPU'da salınım denenirse her karede binlerce tepe noktası
 * güncellenir ve telefon düşer.
 *
 * Çimler tahtanın ALTINDA kalmıyor: tahtanın kapladığı kare (8x8 birim)
 * atlanıyor, yoksa tahtanın kenarlarından çim fışkırıyor.
 */
const CIM_VERT = /* glsl */ `
  attribute float aFaz;      // her çime ayrı faz: hepsi aynı anda eğilmesin
  attribute float aYukseklik;
  uniform float uZaman;
  uniform float uGuc;
  varying float vY;
  varying float vDerinlik;

  void main() {
    vec3 p = position;
    // Sadece uçlar eğilsin: taban sabit, tepe salınır
    float k = clamp(p.y / max(0.0001, aYukseklik), 0.0, 1.0);
    float dalga = sin(uZaman * 0.9 + aFaz + p.x * 0.35 + p.z * 0.25);
    float esinti = sin(uZaman * 0.27 + p.x * 0.05) * 0.5 + 0.5;  // yavaş nefes
    p.x += dalga * k * k * uGuc * (0.35 + esinti * 0.65);
    p.z += dalga * k * k * uGuc * 0.4;
    vY = k;
    vec4 goz = modelViewMatrix * vec4(p, 1.0);
    vDerinlik = -goz.z;
    gl_Position = projectionMatrix * goz;
  }
`;

/* !! Cim SISE DAHIL EDILMELI. Ozel shader varsayilan olarak sisi almiyor;
   zemin uzakta sise karisip solarken cim sabit renkte kaliyor ve one
   firliyor - cayir degil "dagilmis koyu benekler" gibi duruyor.
   three'nin fog chunk'lari yerine dogrudan hesaplaniyor: uniform sayisi az,
   okumasi acik. */
const CIM_FRAG = /* glsl */ `
  uniform vec3 uDip;
  uniform vec3 uUc;
  uniform vec3 uSisRenk;
  uniform float uSisYakin;
  uniform float uSisUzak;
  varying float vY;
  varying float vDerinlik;
  void main() {
    vec3 renk = mix(uDip, uUc, vY);
    float sis = smoothstep(uSisYakin, uSisUzak, vDerinlik);
    gl_FragColor = vec4(mix(renk, uSisRenk, sis), 1.0);

    /* !! BU IKI SATIR SILINMEZ. Cim ozel shader oldugu icin three'nin
       otomatik ardil islemlerinin DISINDA kaliyor:

       - <tonemapping_fragment> olmazsa: renderer ACESFilmic kullaniyor,
         yani sahnedeki HER SEY tone mapping'den geciyor ama cim gecmiyor.
         Cim tek basina ham parlaklikta kalip zeminden one firliyor.
       - <colorspace_fragment> olmazsa: uniform'lar THREE.Color, ve
         ColorManagement acik oldugu icin setHex sRGB->Linear cevirip
         DOGRUSAL deger tutuyor. Shader bunu ciktiya dogrudan yazinca
         cim olmasi gerekenden koyu ciziliyor -- eski "dagilmis koyu
         benekler" sorununun asil sebebi buydu; renkler o zaman ekranda
         telafi edilerek secilmisti. */
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* !! Cim SIK ve KUCUK olmali - yoksa "cim" degil "konfeti" gibi duruyor.
   Ilk denemede 24 birim yaricapa 5000 cim kondu: bir satranc karesine ~3 tane
   dusuyordu ve ekranda tek tek ucgen okunuyordu. Olcut sudur: bir kareye
   (1x1 birim) EN AZ ~30 cim, ve cim boyu tas boyunun onda birinden kucuk.
   Yaricap genis tutmak yerine dar tutulup sayi artiriliyor: sis zaten 30
   biriminde her seyi yutuyor, oteye cim koymak bedava degil ama gorunmuyor. */
function cimAlani({ dip, uc, sayi = 20000, yaricap = 14, tahtaYari = 4.6 }, sis) {
  let s = 424242;
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };

  const pos = [], faz = [], yuk = [];
  let kondu = 0, deneme = 0;
  while (kondu < sayi && deneme < sayi * 6) {
    deneme++;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * yaricap;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // Tahtanın oturduğu kareyi atla
    if (Math.abs(x) < tahtaYari && Math.abs(z) < tahtaYari) continue;
    const h = 0.07 + rand() * 0.11;
    const g = 0.012 + rand() * 0.013;
    const f = rand() * Math.PI * 2;
    // Tek üçgen: en ucuz çim. Yakından bakılmıyor, yeterli.
    pos.push(x - g, -0.4, z, x + g, -0.4, z, x, -0.4 + h, z);
    for (let i = 0; i < 3; i++) { faz.push(f); yuk.push(h); }
    kondu++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aFaz", new THREE.Float32BufferAttribute(faz, 1));
  geo.setAttribute("aYukseklik", new THREE.Float32BufferAttribute(yuk, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: CIM_VERT,
    fragmentShader: CIM_FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uZaman: { value: 0 },
      uGuc: { value: 0.06 },      // küçük: "belli belirsiz" şartı
      /* !! Renkler zeminin BAZ renginden degil, ISIKLI halinden turetilmeli.
         Zemin MeshStandardMaterial - isik aliyor ve baz renginden ~3 kat
         parlak ciziliyor. Cim ise isiksiz shader, ham rengiyle. Ilk denemede
         renkler kagit ustunde zeminden aciktir diye secilmisti; ekranda
         cayir degil "dagilmis koyu benekler" gibi durdu. */
      uDip: { value: new THREE.Color(dip) },
      uUc: { value: new THREE.Color(uc) },
      uSisRenk: { value: new THREE.Color(sis?.renk ?? 0x000000) },
      uSisYakin: { value: sis?.yakin ?? 9999 },
      uSisUzak: { value: sis?.uzak ?? 10000 },
    },
  });
  return new THREE.Mesh(geo, mat);
}

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
export function applyEnvironment(scene, env, clock, bg = 0x151719) {
  // Ortam haritasi cevre nesnelerinden BAGIMSIZ: `env` bos olsa da
  // (klasik tema neredeyse bos) isik yine gelmeli.
  ortamUygula(scene, bg, env?.zemin);

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

  // Çim: rüzgârda salınıyor. Sadece çimin anlamlı olduğu çevrelerde.
  if (env.cim) {
    const cim = cimAlani(env.cim, env.sis);
    kok.add(cim);
    // Zaman OYUNUN ölçekli saatinden: hit-stop ve yavaş çekimde rüzgâr da
    // yavaşlasın, sahneden kopmasın.
    clock?.add((dt) => {
      if (!cim.parent) return true;              // çevre değişti, kendini sil
      cim.material.uniforms.uZaman.value += dt;
      return false;
    });
  }

  scene.add(kok);
}
