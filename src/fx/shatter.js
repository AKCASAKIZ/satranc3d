import * as THREE from "three";

/**
 * Kurban tasin KENDI geometrisini ucgenlerine ayirip savuran efekt.
 * Jenerik toz bulutu degil -- parcalar gercekten o tasin parcalari.
 *
 * Butun hareket vertex shader'da: 114-226 ucgen tek draw call, mobilde bedava.
 * Rastgelelik sabit tohumlu, boylece kare kare dogrulama deterministik kaliyor.
 */

/** Tohumlu rastgele -- ayni tohum ayni patlama. */
function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const VERT = /* glsl */ `
  attribute vec3 aCentroid;
  attribute vec3 aVelocity;
  attribute vec3 aAxis;
  attribute float aSpin;
  attribute float aDelay;

  uniform float uTime;
  uniform float uGravity;

  varying float vFade;
  varying vec3 vNormalW;

  // Rodrigues donme formulu -- parca kendi merkezi etrafinda donsun
  vec3 rotateAround(vec3 v, vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  void main() {
    float t = max(0.0, uTime - aDelay);

    vec3 local = position - aCentroid;
    local = rotateAround(local, normalize(aAxis), aSpin * t);

    vec3 offset = aVelocity * t;
    offset.y -= uGravity * t * t;

    vec3 displaced = aCentroid + local + offset;

    // Tahtanin altina gecen parcalar zeminde kalsin
    displaced.y = max(displaced.y, 0.02);

    vFade = t;
    vNormalW = rotateAround(normal, normalize(aAxis), aSpin * t);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFlashColor;
  uniform float uLife;

  varying float vFade;
  varying vec3 vNormalW;

  void main() {
    float k = clamp(vFade / uLife, 0.0, 1.0);

    // Basit yonlu isik -- sahnedeki ana isikla ayni yonden
    vec3 lightDir = normalize(vec3(0.45, 0.82, 0.35));
    float diffuse = 0.45 + 0.55 * max(dot(normalize(vNormalW), lightDir), 0.0);

    // Carpma aninda parcalar kizgin, sonra kendi rengine soguyor
    vec3 color = mix(uFlashColor, uColor * diffuse, clamp(k * 3.5, 0.0, 1.0));

    // Son ucte sonumleme
    float alpha = 1.0 - smoothstep(0.62, 1.0, k);
    if (alpha <= 0.01) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * Verilen mesh'i patlatan gecici bir mesh uretir.
 * Donen nesnede update(dt) -> bitti mi (bool), ve dispose() var.
 */
/**
 * Iskeletli mesh'in O ANKI pozunu duz geometriye pisirir.
 *
 * Gerekli: taslar artik SkinnedMesh ve geometri BIND pozunda duruyor. Ham
 * geometriyi patlatirsak parcalar yatmis karakterin degil AYAKTA duranin
 * parcalari olur; patlamanin ilk karesinde gorunur bir sicrama cikar.
 *
 * Ucuz calisiyor cunku kung-fu seti RIGID skinli (her tepe noktasi tek kemige
 * %100 bagli) - `applyBoneTransform` tam sonuc veriyor, yaklasim degil.
 */
function pozuPisir(skinned) {
  const geo = (skinned.geometry.index
    ? skinned.geometry.toNonIndexed()
    : skinned.geometry.clone());
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  // toNonIndexed yeni bir tampon uretiyor ama skin agirliklari indeksle
  // eslesmeli; bu yuzden pisirme INDEKSLI orijinal uzerinden yapilip
  // sonra kopyalaniyor.
  const kaynak = skinned.geometry;
  const kaynakPos = kaynak.attributes.position;
  const pismis = new Float32Array(kaynakPos.count * 3);
  for (let i = 0; i < kaynakPos.count; i++) {
    v.fromBufferAttribute(kaynakPos, i);
    skinned.applyBoneTransform(i, v);
    pismis[i * 3] = v.x; pismis[i * 3 + 1] = v.y; pismis[i * 3 + 2] = v.z;
  }
  const pismisAttr = new THREE.BufferAttribute(pismis, 3);
  if (kaynak.index) {
    const idx = kaynak.index;
    for (let i = 0; i < idx.count; i++) {
      const j = idx.getX(i);
      pos.setXYZ(i, pismisAttr.getX(j), pismisAttr.getY(j), pismisAttr.getZ(j));
    }
  } else {
    pos.copyArray(pismis);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * DILIM: govdeyi iki duzlemle dorde ayirip parcalari BUTUN halinde savurur.
 *
 * createShatter'dan tek farki ucgenlerin nasil gruplandigi: orada her ucgen
 * kendi hizini aliyor (toz bulutu), burada bir ceyrekteki butun ucgenler
 * AYNI hizi, AYNI donme eksenini ve AYNI merkezi aliyor -- yani ceyrek kati
 * bir cisim gibi hareket ediyor. "Patladi" ile "kesildi" arasindaki tek
 * gorsel fark bu; ayni shader ikisini de cizebiliyor.
 *
 * Kesik duzlemleri kurbanin YEREL uzayinda: dikey kesik x=0 (gogusten
 * asagi), yatay kesik y = govdenin orta yuksekligi. Kesikler gercek
 * geometri bolmesi DEGIL -- ucgenler merkezlerine gore gruplaniyor, yani
 * kesik yuzeyi kapatilmiyor (icerisi bos gorunur). Hareket hizli oldugu
 * icin ekranda okunmuyor; kapatmak icin gercek duzlem-kesme gerekirdi ve
 * bu, tek karede yapilacak bir is degil.
 */
export function createDilim(sourceMesh, { life = 1.6, power = 1.0, seed = 7331 } = {}) {
  const rand = makeRandom(seed);
  const geo = sourceMesh.isSkinnedMesh
    ? pozuPisir(sourceMesh)
    : sourceMesh.geometry.index
      ? sourceMesh.geometry.toNonIndexed()
      : sourceMesh.geometry.clone();

  const pos = geo.attributes.position;
  const triCount = pos.count / 3;

  // Yatay kesik govdenin ortasindan gecmeli; sinir kutusundan olculuyor
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const kesikY = (bb.min.y + bb.max.y) / 2;
  const kesikX = (bb.min.x + bb.max.x) / 2;

  const centroid = new Float32Array(pos.count * 3);
  const velocity = new Float32Array(pos.count * 3);
  const axis = new Float32Array(pos.count * 3);
  const spin = new Float32Array(pos.count);
  const delay = new Float32Array(pos.count);

  /* Dort ceyregin hareketi. Ust yarilar yana savruluyor (kesigin yonu),
     alt yarilar cokuyor -- ayakta duran bir govde ikiye bolununce ustu
     ucar, alti yigilir. Hepsi ust ust: sol/sag ayrimi kesigin dikey
     duzlemi, ust/alt ayrimi yatay duzlem. */
  const ceyrekler = [
    { ust: true, sol: true, v: [-2.1, 2.0, -0.35], spin: -7.5 },
    { ust: true, sol: false, v: [2.1, 2.2, 0.35], spin: 7.5 },
    { ust: false, sol: true, v: [-1.0, 0.35, -0.2], spin: -2.4 },
    { ust: false, sol: false, v: [1.0, 0.3, 0.2], spin: 2.4 },
  ];
  // Her ceyregin kendi merkezi: donme o noktanin etrafinda olmali
  const toplam = ceyrekler.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const ceyrekNo = new Uint8Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i0 + 1);
    c.fromBufferAttribute(pos, i0 + 2);
    mid.copy(a).add(b).add(c).divideScalar(3);
    const ust = mid.y >= kesikY;
    const sol = mid.x < kesikX;
    const no = ceyrekler.findIndex((q) => q.ust === ust && q.sol === sol);
    ceyrekNo[t] = no;
    const acc = toplam[no];
    acc.x += mid.x; acc.y += mid.y; acc.z += mid.z; acc.n++;
  }
  const merkez = toplam.map((s) => (s.n ? { x: s.x / s.n, y: s.y / s.n, z: s.z / s.n } : { x: 0, y: 0, z: 0 }));

  for (let t = 0; t < triCount; t++) {
    const no = ceyrekNo[t];
    const q = ceyrekler[no];
    const m = merkez[no];
    const i0 = t * 3;
    // Ust ceyrekler once kopsun: kesik yukaridan asagi iniyor
    const d = q.ust ? 0 : 0.06;
    for (let v = 0; v < 3; v++) {
      const i = (i0 + v) * 3;
      centroid[i] = m.x; centroid[i + 1] = m.y; centroid[i + 2] = m.z;
      velocity[i] = q.v[0] * power;
      velocity[i + 1] = q.v[1] * power;
      velocity[i + 2] = q.v[2] * power;
      // Donme ekseni ceyrek basina sabit ama hafif dagilmali; tamamen ayni
      // eksen dort parcayi mekanik gosteriyor
      axis[i] = 0.15 * (rand() - 0.5);
      axis[i + 1] = 0.2 * (rand() - 0.5);
      axis[i + 2] = 1;
      spin[i0 + v] = q.spin * power;
      delay[i0 + v] = d;
    }
  }

  geo.setAttribute("aCentroid", new THREE.BufferAttribute(centroid, 3));
  geo.setAttribute("aVelocity", new THREE.BufferAttribute(velocity, 3));
  geo.setAttribute("aAxis", new THREE.BufferAttribute(axis, 3));
  geo.setAttribute("aSpin", new THREE.BufferAttribute(spin, 1));
  geo.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uGravity: { value: 5.0 },
      uLife: { value: life },
      uColor: { value: new THREE.Color(sourceMesh.material.color) },
      uFlashColor: { value: new THREE.Color(0xfff0c8) },
    },
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(sourceMesh.position);
  mesh.rotation.copy(sourceMesh.rotation);
  mesh.frustumCulled = false;

  let elapsed = 0;
  return {
    mesh,
    update(dt) {
      elapsed += dt;
      material.uniforms.uTime.value = elapsed;
      return elapsed >= life;
    },
    seek(t) { elapsed = t; material.uniforms.uTime.value = t; },
    dispose() { geo.dispose(); material.dispose(); },
  };
}

export function createShatter(sourceMesh, { seed = 1337, life = 1.5, power = 1.0 } = {}) {
  const rand = makeRandom(seed);

  const geo = sourceMesh.isSkinnedMesh
    ? pozuPisir(sourceMesh)
    : sourceMesh.geometry.index
      ? sourceMesh.geometry.toNonIndexed()
      : sourceMesh.geometry.clone();

  const pos = geo.attributes.position;
  const triCount = pos.count / 3;

  const centroid = new Float32Array(pos.count * 3);
  const velocity = new Float32Array(pos.count * 3);
  const axis = new Float32Array(pos.count * 3);
  const spin = new Float32Array(pos.count);
  const delay = new Float32Array(pos.count);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i0 + 1);
    c.fromBufferAttribute(pos, i0 + 2);
    mid.copy(a).add(b).add(c).divideScalar(3);

    // Disari dogru savrulma: merkezden uzaklasma yonu + yukari bilesen
    const outward = new THREE.Vector3(mid.x, 0, mid.z);
    if (outward.lengthSq() < 1e-6) outward.set(rand() - 0.5, 0, rand() - 0.5);
    outward.normalize();

    const speed = (0.9 + rand() * 1.5) * power;
    const lift = (1.5 + rand() * 1.8) * power;

    const vx = outward.x * speed + (rand() - 0.5) * 0.5;
    const vy = lift * (0.35 + mid.y); // ust parcalar daha yukari firlar
    const vz = outward.z * speed + (rand() - 0.5) * 0.5;

    const ax = rand() - 0.5;
    const ay = rand() - 0.5;
    const az = rand() - 0.5;
    const sp = (rand() - 0.5) * 22 * power;

    // Alt parcalar bir tik gec kopsun -- tas asagidan yukari dagiliyor hissi
    const d = (1.0 - Math.min(1, mid.y)) * 0.05 * rand();

    for (let v = 0; v < 3; v++) {
      const i = (i0 + v) * 3;
      centroid[i] = mid.x;
      centroid[i + 1] = mid.y;
      centroid[i + 2] = mid.z;
      velocity[i] = vx;
      velocity[i + 1] = vy;
      velocity[i + 2] = vz;
      axis[i] = ax;
      axis[i + 1] = ay;
      axis[i + 2] = az;
      spin[i0 + v] = sp;
      delay[i0 + v] = d;
    }
  }

  geo.setAttribute("aCentroid", new THREE.BufferAttribute(centroid, 3));
  geo.setAttribute("aVelocity", new THREE.BufferAttribute(velocity, 3));
  geo.setAttribute("aAxis", new THREE.BufferAttribute(axis, 3));
  geo.setAttribute("aSpin", new THREE.BufferAttribute(spin, 1));
  geo.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uGravity: { value: 4.2 },
      uLife: { value: life },
      uColor: { value: new THREE.Color(sourceMesh.material.color) },
      uFlashColor: { value: new THREE.Color(0xffd9a0) },
    },
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(sourceMesh.position);
  mesh.rotation.copy(sourceMesh.rotation);
  mesh.frustumCulled = false;

  let elapsed = 0;

  return {
    mesh,
    /** dt saniye. true donerse efekt bitti, sahneden alinmali. */
    update(dt) {
      elapsed += dt;
      material.uniforms.uTime.value = elapsed;
      return elapsed >= life;
    },
    /** Kare kare dogrulama icin: animasyonu belirli ana dondur. */
    seek(t) {
      elapsed = t;
      material.uniforms.uTime.value = t;
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
