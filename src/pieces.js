import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { squareToWorld } from "./board.js";

/**
 * Taslar artik Blender'da uretilmis, iskeletli savasci karakterler.
 * `assets/glb/` altinda 6 tas x 2 renk = 12 GLB var; her biri kendi icinde tam
 * (mesh + iskelet + 7 klip). Klip isimleri alti tasta da ayni oldugu icin
 * animasyon kontrolcusu tek -- tas tipine gore dallanma yok.
 *
 * Sozlesme HANDOFF.md'den: 1 birim = 1 kare, origin karenin merkezi,
 * karakter Blender'da -Y'ye bakiyor -> glTF Y-up cevriminden sonra +Z'ye bakiyor.
 */

const FILE_NAME = { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" };
const COLOR_NAME = { w: "white", b: "black" };

export const CLIP = {
  IDLE: "Idle",
  WALK: "Walk",
  ATTACK: "Attack",
  BLOCK: "Guard_Block",
  HIT: "Hit_React",
  DEATH: "Death",
  VICTORY: "Victory",
};

/**
 * Kung-fu setiyle gelen EK klipler (10-08-2026). Ayri tutuluyorlar cunku
 * CLIP'in kendisi yukleme dogrulamasinda "olmazsa olmaz" listesi olarak
 * kullaniliyor (`missing`); buraya konsalardi eski savasci setini yuklemek
 * imkansiz hale gelirdi. Bunlar VARSA kullaniliyor.
 */
export const CLIP_EK = {
  STANCE: "Stance_Ready",
  KICK: "Attack_Kick",
  COMBO: "Attack_Combo",
  DODGE: "Dodge",
  BACKFLIP: "Backflip",
  SALUTE: "Salute",
};

const FPS = 24;
/** Blender kare numarasi -> saniye (klipler 1. kareden basliyor). */
const at = (frame) => (frame - 1) / FPS;

/**
 * Vurusun gercekten degdigi an. Ses, sarsinti ve kurbanin tepkisi buna
 * gore hizalaniyor -- yoksa darbe ile ses arasinda gorunur gecikme oluyor.
 */
// Kung-fu setinde alti tasin klipleri BIREBIR ayni (olculdu 10-08-2026:
// GLB'den okunan sureler alti taste de ayni cikti). Eski savasci setinde
// Attack tasa gore 38/40/42 kareydi; bu tablo o yuzden vardi ve artik tek
// degere iniyor. Tablo yine de tas bazli birakiliyor: set degisirse tek
// yerden ayrilabilsin.
export const ATTACK_IMPACT = {
  p: at(16),
  n: at(16),
  q: at(16),
  r: at(16),
  b: at(16),
  k: at(16),
};
export const BLOCK_IMPACT = at(13);

/** Ek saldiri kliplerinin vurus kareleri (kung-fu seti). */
export const KICK_IMPACT = at(18);
export const COMBO_IMPACTS = [at(16), at(30), at(54)];
export const DODGE_EVADE = at(14);
/** Backflip karakteri ~0.52 birim GERI birakiyor; klip bitince telafi sart. */
export const BACKFLIP_SHIFT = 0.52;

/**
 * Klip uzunluklari (saniye). Attack disinda alti tasta da ayni.
 * Burada yazili olmasinin sebebi: klip kaydi (record.js) aktorler daha
 * kurulmadan once video suresini ve kamera dalisini hesaplamak zorunda.
 * Yukleme sirasinda GLB ile karsilastiriliyor, sapma olursa hata veriyor.
 */
// Degerler GLB'den OLCULDU (10-08-2026), README'den kopyalanmadi: README
// klip araligini 1-53 diye veriyor ama dosyadaki son anahtar karesi 53. karede,
// yani sure at(54). Ikisini karistirmak yukleme dogrulamasini patlatiyor.
export const CLIP_LENGTH = {
  [CLIP.IDLE]: at(54),
  [CLIP.WALK]: at(38),
  [CLIP.BLOCK]: at(26),
  [CLIP.HIT]: at(26),
  [CLIP.DEATH]: at(66),
  [CLIP.VICTORY]: at(58),
};
export const ATTACK_LENGTH = { p: at(34), n: at(34), r: at(34), b: at(34), k: at(34), q: at(34) };
/** Ek kliplerin sureleri (yalnizca kung-fu setinde var). */
export const EK_LENGTH = {
  [CLIP_EK.STANCE]: at(50),
  [CLIP_EK.KICK]: at(38),
  [CLIP_EK.COMBO]: at(74),
  [CLIP_EK.DODGE]: at(30),
  [CLIP_EK.BACKFLIP]: at(38),
  [CLIP_EK.SALUTE]: at(54),
};

/**
 * Kaide (`_Base`) KAPALI (11-08-2026 karari).
 *
 * Once acikti: gerekce "figurler satranc tasi olarak okunsun, yoksa tahta
 * minyatur asker dizisine doner" idi. Kung-fu seti gelince bu gerekce
 * gecersizlesti - karakterlerin eklemleri var, kendileri yuruyor ve
 * doguuyorlar; kaide artik onlari tasiyan disk degil, ayaklarinin altindaki
 * gereksiz bir pasta. Kapatinca tahta "savas alani" gibi okunuyor ve zaten
 * projenin ayirt edici yani bu.
 *
 * Kapatmanin bedeli olculdu, ucu de sorun cikarmadi:
 *   - Govde kaidenin ustunde duruyordu, ~0.11 birim havada kalirdi;
 *     groundOffset yukleme aninda olcup telafi ediyor (olculdu: altY = 0.000).
 *   - Tema rengi kaideyi de boyuyordu; ten/bas/el uzerinde hala 19.060
 *     ucgen kaliyor, tema degisimi gorunur (olculdu).
 *   - Tiklama hedefi kaideye BAGLI DEGIL: isin tasi iskalarsa altindaki
 *     kareye dusuyor (bkz. secimYap, main.js).
 *
 * Geri acilirsa yukaridakilerin hicbiri bozulmaz, tek degisen gorunum.
 */
const SHOW_PLINTH = false;

/**
 * Kaide mesh'i mi? GLTFLoader cok primitifli mesh'i `CW_Pawn_Base_0`,
 * `CW_Pawn_Base_1` diye parcaliyor; sadece dugum adina bakmak yetmiyor,
 * ust gruba kadar cikmak gerekiyor.
 */
function isPlinth(object) {
  for (let o = object; o; o = o.parent) {
    if (/_Base(_\d+)?$/.test(o.name)) return true;
    if (/_Rig$/.test(o.name)) return false;
  }
  return false;
}

/**
 * Tas govde renkleri. Tema degisince buradan guncelleniyor ve yasayan
 * butun aktorlere yayiliyor -- GLB'nin kendi `Marble_White` / `Obsidian_Black`
 * rengi baslangic degeri, tema onun ustune yaziyor.
 */
export const PIECE_TINT = { w: new THREE.Color(0xf2ece0), b: new THREE.Color(0x33302b) };

/** Sahnede yasayan butun aktorler -- mixer surme ve tema yayma icin. */
const liveActors = new Set();

/** Idle fazlarini dagitmak icin sayac; bkz. PieceActor kurucusu. */
let idleSeed = 0;

/** Klip kaydi ve demo tekrar edilebilir olsun diye sayaci sifirlar. */
export function resetIdlePhase() {
  idleSeed = 0;
}

/**
 * Butun aktorlerin mixer'ini ilerletir. Tek noktadan surulmesi sart:
 * hit-stop ancak animasyonlar da oyunun olcekli saatinden beslenirse
 * calisiyor, yoksa carpma aninda kamera donuyor ama taslar oynamaya
 * devam ediyor.
 */
export function updateActors(dt) {
  for (const actor of liveActors) actor.update(dt);
}

/** Aktor saatini bir Clock'a bagla. Canli oyun, demo ve klip kaydi ayni cagriyi yapiyor. */
export function attachActorClock(clock) {
  const tick = (dt) => {
    updateActors(dt);
    return false;
  };
  clock.add(tick);
  return tick;
}

/** Tema renklerini yasayan taslara uygula. */
export function applyPieceColors(white, black) {
  PIECE_TINT.w.setHex(white);
  PIECE_TINT.b.setHex(black);
  for (const actor of liveActors) actor.applyTint();
}

/**
 * 12 GLB'yi paralel yukler. Donen nesne prototip -- her tas ondan
 * SkeletonUtils.clone ile kopyalaniyor, GLB tekrar parse edilmiyor.
 */
/* Varsayilan yol `/glb` DEGIL, `<BASE_URL>glb`. GitHub Pages'te oyun alt
   dizinde duruyor (ornegin /satranc3d/); mutlak `/glb` orada site kokune
   gider ve 12 GLB'nin hepsi 404 verir - oyun bos tahtayla acilir. */
const GLB_KOK = `${import.meta.env.BASE_URL}glb`;

export async function loadWarriors(base = GLB_KOK, onProgress) {
  const loader = new GLTFLoader();
  const jobs = [];
  for (const type of Object.keys(FILE_NAME)) {
    for (const color of Object.keys(COLOR_NAME)) {
      jobs.push({ type, color, url: `${base}/chess_${FILE_NAME[type]}_${COLOR_NAME[color]}.glb` });
    }
  }

  let done = 0;
  const assets = {};
  await Promise.all(
    jobs.map(async ({ type, color, url }) => {
      const gltf = await loader.loadAsync(url);
      (assets[type] ??= {})[color] = prepare(gltf, type, color);
      onProgress?.(++done, jobs.length);
    })
  );
  return assets;
}

/** Yuklenen GLB'yi olcup klonlanmaya hazir hale getirir. */
function prepare(gltf, type, color) {
  const root = gltf.scene;

  // Kaide gizlenince govdenin en alt noktasi zeminden yukarida kaliyor;
  // farki olcup klonlarda asagi cekiyoruz. Tas basina sabit sayi yazmak
  // yerine olcmek, model guncellenince bozulmasin diye.
  let groundOffset = 0;
  if (!SHOW_PLINTH) {
    let minY = Infinity;
    root.traverse((o) => {
      if (!o.isMesh || isPlinth(o)) return;
      o.geometry.computeBoundingBox();
      minY = Math.min(minY, o.geometry.boundingBox.min.y);
    });
    if (Number.isFinite(minY)) groundOffset = -minY;
  }

  const clips = {};
  for (const clip of gltf.animations) clips[clip.name] = clip;

  const who = `${FILE_NAME[type]}_${COLOR_NAME[color]}`;
  const missing = Object.values(CLIP).filter((n) => !clips[n]);
  if (missing.length) throw new Error(`${who}: eksik klip ${missing.join(", ")}`);

  // Sureler dovus zaman cizelgesinde de yazili; modeller yeniden uretilip
  // klip boylari degisirse sessizce kaymasin, burada patlasin.
  const expected = { ...CLIP_LENGTH, [CLIP.ATTACK]: ATTACK_LENGTH[type] };
  for (const [name, want] of Object.entries(expected)) {
    if (Math.abs(clips[name].duration - want) > 1 / FPS) {
      throw new Error(
        `${who}: ${name} suresi ${clips[name].duration.toFixed(3)}s, beklenen ${want.toFixed(3)}s`
      );
    }
  }

  return { root, animations: gltf.animations, groundOffset };
}

/**
 * Tahtadaki tek bir savasci.
 *
 * Group'tan tureiyor, boylece cagri yerleri (konum, donus, raycast) eskisi
 * gibi tek bir Object3D ile calisiyor; iskelet ve klip yonetimi iceride.
 * `position` her zaman karenin merkezi, zemin seviyesi -- zemine indirme
 * offseti icteki model grubunda duruyor.
 */
export class PieceActor extends THREE.Group {
  constructor(asset, type, color) {
    super();
    this.name = `piece_${color}${type}`;
    this.userData.type = type;
    this.userData.color = color;
    this.userData.actor = this;

    const model = cloneSkinned(asset.root);
    model.position.y = asset.groundOffset;

    // SkeletonUtils.clone materyalleri paylastiriyor. Olurken tek bir tasin
    // saydamlasmasi gerektigi icin her aktor kendi kopyasini tutuyor.
    this.bodyMaterials = [];
    this.materials = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (isPlinth(o)) {
        o.visible = SHOW_PLINTH;
        if (!SHOW_PLINTH) return;
      }
      o.castShadow = true;
      o.receiveShadow = true;
      const cloned = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => m.clone());
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
      for (const m of cloned) {
        this.materials.push(m);
        // Govde mermer/obsidyen; bronz ve koyu metal aksesuar olarak kaliyor,
        // yoksa tema degisince silah da tas rengine boyaniyor ve siluet kayboluyor.
        // Govde mermer/obsidyen; bronz, koyu metal, yesim ve ahsap aksesuar
        // olarak kaliyor, yoksa tema degisince silah da tas rengine boyaniyor
        // ve siluet kayboluyor.
        //
        // !! CUBBEYI (`Robe_Saffron`/`Robe_Ink`) BURAYA EKLEME. Kung-fu seti
        //    gelince "govde artik cubbe, eklenmezse taslar renksiz kalir" diye
        //    eklendi (10-08-2026) - YANLISTI, ekranda olculdu: tema rengi
        //    safranin uzerine yaziyor ve beyaz taraf krem bir kutleye
        //    donusuyor, karakterler siliniyor. Set iki tarafi zaten cubbe
        //    rengiyle ayiriyor (safran / murekkep); tema yalnizca ten ve
        //    kaideyi boyayinca hem ayrim hem karakter duruyor.
        if (/Marble|Obsidian/.test(m.name)) this.bodyMaterials.push(m);
      }
    });

    this.add(model);
    this.model = model;

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of asset.animations) {
      const action = this.mixer.clipAction(clip);
      this.actions[clip.name] = action;
    }
    this.current = null;

    this.applyTint();
    liveActors.add(this);

    // Butun taslar ayni Idle karesinde olursa tahta bir metronom gibi
    // gorunuyor. Kaydirma sayacli, rastgele degil -- klip kaydinin ayni URL'de
    // ayni videoyu vermesi buna bagli.
    const clip = this.actions[CLIP.IDLE].getClip();
    this.play(CLIP.IDLE, { loop: true, fade: 0, offset: (idleSeed++ * 0.37) % clip.duration });
  }

  applyTint() {
    const tint = PIECE_TINT[this.userData.color];
    for (const m of this.bodyMaterials) m.color.copy(tint);
  }

  /**
   * Klip oynat. Donguselse sonsuz, degilse son karede kalir (LoopOnce + clamp)
   * -- ozellikle Death icin sart, yoksa olen tas ayaga kalkip tekrar oluyor.
   * Donen deger klibin bu hizdaki suresi (saniye).
   */
  play(name, { loop = false, fade = 0.18, speed = 1, offset = 0 } = {}) {
    const action = this.actions[name];
    if (!action) return 0;

    action.enabled = true;
    action.setEffectiveTimeScale(speed);
    action.setEffectiveWeight(1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.reset();
    action.time = offset;

    if (this.current && this.current !== action && fade > 0) {
      this.current.crossFadeTo(action, fade, false);
      action.play();
    } else {
      if (this.current && this.current !== action) this.current.stop();
      action.play();
    }
    this.current = action;
    return action.getClip().duration / speed;
  }

  /** Idle'a yumusak donus -- dovus bitisinde her yerden buraya donuluyor. */
  idle(fade = 0.3, offset = 0) {
    return this.play(CLIP.IDLE, { loop: true, fade, offset });
  }

  /** Model +Z'ye bakiyor; yon vektorunden yaw uretir. */
  static yawTowards(dir) {
    return Math.atan2(dir.x, dir.z);
  }

  /** Tasin tahtadaki varsayilan bakisi: beyaz -Z'ye, siyah +Z'ye. */
  get homeYaw() {
    return this.userData.color === "w" ? Math.PI : 0;
  }

  faceHome() {
    this.rotation.y = this.homeYaw;
  }

  /** Bir dunya noktasina don. */
  faceTowards(point) {
    const dir = point.clone().sub(this.position).setY(0);
    if (dir.lengthSq() < 1e-6) return;
    this.rotation.y = PieceActor.yawTowards(dir.normalize());
  }

  /** 0 = tamamen saydam. Olen tasi tahtadan silerken kullaniliyor. */
  setOpacity(value) {
    const opaque = value >= 0.999;
    for (const m of this.materials) {
      m.transparent = !opaque;
      m.opacity = value;
      m.depthWrite = opaque;
    }
    this.visible = value > 0.001;
  }

  update(dt) {
    this.mixer.update(dt);
  }

  dispose() {
    liveActors.delete(this);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const m of this.materials) m.dispose();
    this.removeFromParent();
  }
}

export function createPiece(assets, type, color) {
  const asset = assets[type]?.[color];
  if (!asset) throw new Error(`model yok: ${type}/${color}`);
  const actor = new PieceActor(asset, type, color);
  actor.faceHome();
  return actor;
}

/**
 * Tahtadaki taslari chess.js durumuyla senkron tutar.
 *
 * Eski surumde her hamleden sonra 32 mesh sifirdan kuruluyordu; artik taslar
 * iskeletli ve animasyon durumu tasiyor, o yuzden sync ARTIMLI: yerinde duran
 * tas korunuyor, yer degistiren tas yeniden kullaniliyor (en yakin eslesme),
 * sadece gercekten tahtadan kalkan tas yok ediliyor. Boylece hamle sonrasi
 * Idle dongusu kesilmiyor ve her hamlede 32 iskelet klonlanmiyor.
 */
export class PieceSet {
  constructor(assets) {
    this.assets = assets;
    this.group = new THREE.Group();
    this.group.name = "pieces";
    this.bySquare = new Map();
  }

  sync(board) {
    const wanted = [];
    for (const row of board) {
      for (const cell of row) {
        if (cell) wanted.push(cell);
      }
    }

    const leftover = new Map(this.bySquare);
    this.bySquare.clear();

    // 1) Karesinde duran ve tipi/rengi degismeyen taslar oldugu gibi kaliyor
    const unresolved = [];
    for (const cell of wanted) {
      const sitting = leftover.get(cell.square);
      if (sitting && sitting.userData.type === cell.type && sitting.userData.color === cell.color) {
        leftover.delete(cell.square);
        this.place(sitting, cell.square);
      } else {
        unresolved.push(cell);
      }
    }

    // 2) Kalanlar: ayni tip+renkten en yakin bostaki tas tasiniyor. Hamle
    //    animasyonu tasi zaten hedefe getirdigi icin "en yakin" hep dogru tasi
    //    buluyor; rokta iki tas ayni anda yer degistirse bile karismiyor.
    for (const cell of unresolved) {
      const target = squareToWorld(cell.square);
      let best = null;
      let bestKey = null;
      let bestDist = Infinity;
      for (const [square, actor] of leftover) {
        if (actor.userData.type !== cell.type || actor.userData.color !== cell.color) continue;
        const d = actor.position.distanceToSquared(target);
        if (d < bestDist) {
          bestDist = d;
          best = actor;
          bestKey = square;
        }
      }
      if (best) {
        leftover.delete(bestKey);
        this.place(best, cell.square);
      } else {
        // Yeni tas: oyun basi, terfi ya da sifirlama
        const actor = createPiece(this.assets, cell.type, cell.color);
        this.group.add(actor);
        this.place(actor, cell.square);
      }
    }

    // 3) Artakalan her sey tahtadan kalkti
    for (const actor of leftover.values()) actor.dispose();
  }

  place(actor, square) {
    actor.position.copy(squareToWorld(square));
    actor.faceHome();
    actor.userData.square = square;
    if (!actor.parent) this.group.add(actor);
    this.bySquare.set(square, actor);
  }

  at(square) {
    return this.bySquare.get(square) ?? null;
  }

  /** Raycast alt mesh'i buluyor; oyunun ilgilendigi ust seviye aktore cikar. */
  static actorOf(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData?.actor) return o.userData.actor;
    }
    return null;
  }

  dispose() {
    for (const actor of this.bySquare.values()) actor.dispose();
    this.bySquare.clear();
  }
}
