import * as THREE from "three";
import { squareToWorld } from "./board.js";
import { flash, rampaEkSure } from "./fx/impact.js";
import { createShatter } from "./fx/shatter.js";
import { createLightning } from "./fx/sky.js";
import { play } from "./fx/audio.js";
import { skorGiris, skorVurus, skorCarpma } from "./fx/score.js";
import {
  CLIP,
  CLIP_EK,
  ATTACK_IMPACT,
  ATTACK_LENGTH,
  BLOCK_IMPACT,
  CLIP_LENGTH,
  EK_LENGTH,
  KICK_IMPACT,
  POZ,
  kalabalikBaksin,
} from "./pieces.js";

/**
 * Efekt kanali. Canli oyunda ekrana/hoparlore gider; klip kaydinda ayni
 * cagrilar bir olay listesine yazilir ve sonradan video/ses olarak render
 * edilir. Tek kanal oldugu icin klip ile oyunun hissi ayrisamaz.
 */
export const LIVE_FX = {
  flash,
  sound: (type, opts, delay = 0) => play(type, opts, delay),
};

/**
 * Yeme sahnesi.
 *
 * Onemli degisiklik: taslar artik kati cisim degil, iskeletli karakterler.
 * Hareketin karakteri Blender kliplerinden geliyor (Walk / Attack /
 * Guard_Block / Hit_React / Death / Victory), bu dosya sadece ZAMANLAMAYI
 * ve tahta uzerindeki KONUMU suruyor. Klip isimleri alti tasta da ayni
 * oldugu icin tas tipine gore dallanma yok -- tek fark vurusun degdigi kare.
 *
 * Cizelge tamamen zaman surumlu (promise zinciri degil): demo ve klip kaydi
 * saati elle adim adim ilerletiyor, arada await olsaydi hicbiri ilerlemezdi.
 */

const easeInOutQuad = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);

/** Klip oynatma hizlari. Ham klipler sinematik tempoda; oyun icin sikilastirildi. */
/* walk burada YOK: yurume hizi artik yer hizindan turetiliyor (yuruHizi). */
const SPEED = { attack: 1.3, block: 1.3, hit: 1.3, death: 1.35, victory: 1.35, kick: 1.12 };

/* Tahtada yurume hizi (kare/sn).
   2.6 idi; kaide disklerini kaldirinca ayaklar ortaya cikti ve taslar
   "yuruyen" degil "suzulen" gorundu. Asagidaki olcumle birlikte dusuruldu. */
const MOVE_SPEED = 1.6;

/* Klibin KENDI yurume hizi -- olculdu (11-08-2026, tarayicida footL/footR'nin
   pelvise gore ilerleme ekseni gezinmesi):
     Walk klibi 1.542 sn, adim boyu 0.283 kare, dongude 2 adim = 0.566 kare
     => 1x hizda saniyede 0.566 / 1.542 = ~0.367 kare.
   Klip bunun disinda bir yer hiziyla oynatilirsa ayaklar kayiyor. Eskiden
   klip SABIT 1.0 hizla oynuyordu, taslar ise 2.6 kare/sn suzuluyordu:
   ayaklar yer hizinin YEDIDE BIRI kadar adiliyordu. */
const WALK_KARE_SN = 0.566 / 1.542;

/**
 * Yer hizina karsilik gelen klip oynatma hizi.
 *
 * Kirpma sart: uzun hamlelerde (kale bir ucdan digerine) tam esleme 7x'e
 * cikiyor ve bacaklar dikis makinesine donuyor. Kirpilinca uzun hamlelerde
 * bir miktar kayma kaliyor - bilincli takas, kisa hamleler dogru gorunuyor
 * ve hamlelerin cogu kisa.
 */
function yuruHizi(kareSn) {
  // Tavan 4.0: klip 1.542 sn, 4x'te dongu 0.39 sn = saniyede ~2.6 adim.
  // Bu kosu temposu, hala insani. Daha yukarisi dikis makinesi gibi duruyor.
  return THREE.MathUtils.clamp(kareSn / WALK_KARE_SN, 1, 4.0);
}
const STANDOFF = 0.8; // kurbanin karesine bu kadar yaklasip duruyor
const ADVANCE = 0.42; // olduruksen sonra hedef kareye adim suresi
const DEATH_HOLD = 0.8; // olum klibinin oynatilan kismi
const FADE = 0.55; // sonra govdenin silinme suresi
const TURN_RATE = 9.0; // radyan/sn -- kurbanin saldirgana donusu

/**
 * Darbenin agirligi: flas, sarsinti ve hit-stop siddetini belirliyor.
 * Klipler ayni oldugu icin taslar arasindaki fark burada tasiniyor.
 */
const POWER = { p: 0.75, r: 1.25, n: 1.15, b: 1.0, q: 1.3, k: 1.45 };

/* ---------------------------------------------------------------------------
 * SPARTA TEKMESI
 *
 * Son darbe kesici bir alet degil TEKME (kung-fu setinin kullanilmayan
 * `Attack_Kick` klibi) ve kurban yerinde cokmuyor: tahtanin uzerinden
 * geriye savruluyor, takla atiyor, yere caliyor. "300" filmindeki kuyu
 * tekmesinin isleyisi bu -- vurusun kendisinden cok, vurustan SONRAKI
 * yolculuk agirlik veriyor.
 *
 * Sayilar kare (satranc karesi) / saniye cinsinden ve OYUN saatinde;
 * yavas cekim rampasi ayri katman (bkz. SPARTA_RAMPA).
 * ------------------------------------------------------------------------- */
const SPARTA = {
  hiz: 2.4, // yatay firlama hizi (kare/sn)
  yukselme: 3.3, // dikey firlama hizi
  yercekimi: 11.5,
  takla: 6.6, // rad/sn -- govde ucarken kendi ekseninde donuyor
  surtunme: 5.5, // yere carptiktan sonra kaymanin sonumu
  merkezY: 0.62, // ayakta duran govdenin merkez yuksekligi
  yatmaY: 0.18, // yatan govdenin merkez yuksekligi
  sekme: 0.22, // yere carpinca kalan dikey hizin orani
};
const SPARTA_HOLD = 0.5; // govde yerde yatarken bekleme (fade oncesi)

/** Firlama hizlari guce gore olcekleniyor: sah tekmesi piyonunkinden agir. */
const spartaHiz = (guc) => 0.85 + 0.2 * guc;

/** Kurbanin havada kalma suresi (oyun saniyesi). Plan bunu onceden bilmeli. */
function ucusSuresi(guc) {
  const vy = SPARTA.yukselme * spartaHiz(guc);
  const dus = SPARTA.merkezY - SPARTA.yatmaY;
  return (vy + Math.sqrt(vy * vy + 2 * SPARTA.yercekimi * dus)) / SPARTA.yercekimi;
}

/**
 * Tekmenin hiz rampasi (GERCEK milisaniye, oyun saniyesi degil).
 * Yavas -> DUR -> firlama patlamasi -> havada agir cekim -> normal.
 */
const SPARTA_RAMPA = [
  { to: 0.05, ms: 110 }, // deg-di: hit-stop
  { to: 1.45, ms: 110, ramp: true }, // govde bir anda firliyor -- KISA olmali
  { to: 0.28, ms: 170, ramp: true }, // hemen agir cekime dus
  { to: 0.28, ms: 760 }, // ucusun govdesi burada: imza an
  { to: 1.0, ms: 420, ramp: true },
];
/* Ilk denemede hizli bolum 220 ms + yavaslama 900 ms RAMPA idi; olculdu
   (meta.json'daki ses zamanlari): govde yere 0,70 sn'de iniyordu, yani
   ucusun TAMAMI hizli bolumde bitiyor, yavas cekim carpmadan SONRA
   geliyordu. Hizlanma kisa bir tekme olmali, yavaslama ise DUZ tutulmali
   (rampa degil), yoksa ucus ortasinda hiz surekli degisiyor. */
/** Yere carpmadaki kisa ikinci donma. */
const SPARTA_CARPMA_RAMPA = [
  { to: 0.08, ms: 90 },
  { to: 1.0, ms: 260, ramp: true },
];

/* Tekmeden sonraki BITIS DURUSLARI (12 Agu 2026 karari):
     du li bu (tek ayak) -> ban ma bu (yarim at duruşu) -> Idle.
   Eskiden burada Victory klibinin yarisi oynayip Idle'a geciliyordu.

   ban ma bu = `Stance_Ready` klibi. du li bu ise sette YOK: README Victory'i
   "beyaz turna duruşu" diye veriyor ama ekranda olculdu, klip boyunca iki
   ayak da yerde. Bu yuzden du li bu klip degil, kemik pozu (POZ.DULI_BU) --
   Idle'in uzerine biniyor, nefes duruyor. */
const DULI_GIRIS = 0.35; // Idle'dan tek ayaga gecis
const DULI_LEN = 1.15; // du li bu'da gecen sure (giris dahil)
const MABU_LEN = 0.95; // ban ma bu'da gecen sure (klip dongusel)

/** Dovus uzunlugu ayari. UI'da "Oldurus" basligi altinda. */
export const DUEL_MODES = {
  sparta: "Sparta tekmesi",
  tam: "Tam dovus",
  kisa: "Tek darbe",
  kapali: "Kapali",
};

const duelMode = (settings) => (settings?.duel in DUEL_MODES ? settings.duel : "kisa");

/**
 * Sahnenin zaman cizelgesini kurar. Saf fonksiyon: aktor gerektirmiyor,
 * boylece klip kaydi video suresini ve kamera dalisini taslar sahneye
 * girmeden once hesaplayabiliyor.
 *
 * @param {string} type saldiran tas kodu
 * @param {string} mode "tam" | "kisa" | "kapali"
 * @param {number} dist saldiran ile kurban arasindaki kare mesafesi
 */
export function planFinisher(type, mode = "kisa", dist = 1) {
  const power = POWER[type] ?? 1;

  if (mode === "kapali") {
    // Dovus yok: saldiran kayarak geliyor, kurban ayni anda cokuyor.
    const slide = THREE.MathUtils.clamp(dist / (MOVE_SPEED * 1.7), 0.22, 0.5);
    return {
      mode,
      power,
      walkEnd: slide,
      yaklasmaKareSn: dist / slide,
      ilerlemeKareSn: 0,
      lethal: slide * 0.72,
      fadeStart: slide * 0.72,
      total: slide + FADE * 0.7,
    };
  }

  const approach = Math.max(0, dist - STANDOFF);
  const walkEnd = THREE.MathUtils.clamp(approach / MOVE_SPEED, 0.25, 0.95);

  const attackLen = ATTACK_LENGTH[type] / SPEED.attack;
  const attackHit = ATTACK_IMPACT[type] / SPEED.attack;

  if (mode === "sparta") {
    // Once bloklanan bir savurma (dovus oldugu anlasilsin), sonra tekme.
    const firstSwing = walkEnd;
    const blocked = firstSwing + attackHit;
    const kickStart = firstSwing + attackLen * 0.72;
    const lethal = kickStart + KICK_IMPACT / SPEED.kick;
    const ucus = ucusSuresi(power);
    const carpma = lethal + ucus;
    // Govde yerde surunurken saldiran kareye yuruyor: iki hareket ust uste
    // binmezse arada olu an oluyor.
    const advanceStart = carpma;
    const advanceEnd = advanceStart + ADVANCE;
    // Bitis: du li bu (poz) -> ban ma bu (Stance_Ready) -> Idle.
    const duliStart = advanceEnd;
    const duliEnd = duliStart + DULI_LEN;
    const mabuStart = duliEnd;
    const mabuEnd = mabuStart + MABU_LEN;
    const fadeStart = carpma + SPARTA_HOLD;

    return {
      mode,
      power,
      attackHit,
      walkEnd,
      yaklasmaKareSn: approach / walkEnd,
      ilerlemeKareSn: STANDOFF / ADVANCE,
      firstSwing,
      blockStart: blocked - BLOCK_IMPACT / SPEED.block,
      blocked,
      kickStart,
      lethalSwing: kickStart,
      lethal,
      ucus,
      carpma,
      deathStart: lethal,
      fadeStart,
      advanceStart,
      advanceEnd,
      duliStart,
      duliEnd,
      mabuStart,
      mabuEnd,
      total: Math.max(fadeStart + FADE, mabuEnd),
    };
  }

  // Tam dovuste ilk vurus bloklaniyor, oldurucu olan ikincisi. Ikinci
  // savurma birincinin toparlanmasiyla ortusuyor, yoksa arada olu an oluyor.
  const firstSwing = walkEnd;
  const lethalSwing = mode === "tam" ? firstSwing + attackLen * 0.82 : firstSwing;
  const blocked = mode === "tam" ? firstSwing + attackHit : null;
  const blockStart = mode === "tam" ? blocked - BLOCK_IMPACT / SPEED.block : null;

  const lethal = lethalSwing + attackHit;
  const deathStart = lethal + 0.14;
  const fadeStart = deathStart + DEATH_HOLD;
  const advanceStart = lethal + 0.5;
  const advanceEnd = advanceStart + ADVANCE;
  const victoryStart = mode === "tam" ? advanceEnd : null;
  // Victory 1.5 sn; tamamini beklemek oyunu yavaslatiyor, tepe noktasindan
  // sonra Idle'a geciliyor.
  const victoryEnd = victoryStart != null ? victoryStart + CLIP_LENGTH[CLIP.VICTORY] / SPEED.victory * 0.62 : null;

  return {
    mode,
    power,
    attackHit,
    walkEnd,
    // Klip hizi bunlara baglaniyor (bkz. yuruHizi)
    yaklasmaKareSn: approach / walkEnd,
    ilerlemeKareSn: STANDOFF / ADVANCE,
    firstSwing,
    lethalSwing,
    blockStart,
    blocked,
    lethal,
    deathStart,
    fadeStart,
    advanceStart,
    advanceEnd,
    victoryStart,
    victoryEnd,
    total: Math.max(fadeStart + FADE, victoryEnd ?? advanceEnd + 0.2),
  };
}

/**
 * Klip kaydi ve demo bu ozeti okuyor. Sureler iki yerde yazili olsaydi
 * dovusu her ayarlayista video kadraji kayardi.
 */
export function finisherTiming(type, mode = "kisa", dist = 1) {
  const p = planFinisher(type, mode, dist);
  // Yavas cekim sahne saatini degil GERCEK sureyi uzatiyor; klip kaydi
  // videoyu buna gore uzatmazsa dovus bitmeden kesiliyor.
  const rampa = mode === "sparta" ? rampaEkSure(SPARTA_RAMPA) + rampaEkSure(SPARTA_CARPMA_RAMPA) : 0;
  return {
    duration: p.total,
    impactAt: p.lethal / p.total,
    power: p.power,
    arc: 0,
    rampa,
    ucus: p.ucus ?? 0,
    carpma: p.carpma ?? null,
  };
}

/** Bir kere gecilen zaman noktasi -- cizelgeyi okunur tutuyor. */
function cueRunner(cues) {
  let next = 0;
  const sorted = cues.filter((c) => c && Number.isFinite(c.t)).sort((a, b) => a.t - b.t);
  return (t) => {
    while (next < sorted.length && t >= sorted[next].t) sorted[next++].run();
  };
}

/**
 * Bir yeme sahnesini bastan sona oynatir.
 * Cozulmesi animasyon bitince olur; main.js bu sure boyunca girdiyi kilitliyor.
 */
/** Parcalanan taslar: agir olanlar. Piyon/at/fil sakince oluyor. */
const PARCALANAN = new Set(["q", "k", "r"]);
/** Yildirim SADECE vezirde. Kale de dagiliyor ama gok gurlemiyor - iki
 *  seviye: kale "agir", vezir "olay". Ikisine de yildirim dusseydi vezirin
 *  ozelligi kalmazdi. */
const YILDIRIMLI = new Set(["q"]);

export function runFinisher({
  scene,
  attacker,
  victim,
  fromSquare,
  toSquare,
  victimSquare,
  rig,
  timeScale,
  settings,
  clock,
  fx = LIVE_FX,
}) {
  const type = attacker.userData.type;
  const from = squareToWorld(fromSquare);
  const to = squareToWorld(toSquare);
  // En passant'ta kurban hedef karede DEGIL; saldiran kurbana donup vuruyor,
  // sonra hedef kareye adim atiyor.
  const victimPos = squareToWorld(victimSquare ?? toSquare);

  const plan = planFinisher(type, duelMode(settings), from.distanceTo(victimPos));

  // Kurbanin karesine girmeden onunde duruluyor -- ust uste binen iki
  // karakter yerine karsi karsiya gelen iki figur.
  const standoff = victimPos
    .clone()
    .add(from.clone().sub(victimPos).setY(0).normalize().multiplyScalar(STANDOFF));

  const attackerYaw = Math.atan2(victimPos.x - from.x, victimPos.z - from.z);
  const victimYaw = Math.atan2(standoff.x - victimPos.x, standoff.z - victimPos.z);
  const victimYaw0 = victim ? victim.rotation.y : 0;

  const cinematic = settings.cinematic !== false;
  const intro = cinematic
    ? rig.focus(victimPos.clone().setY(0.55), { duration: 300 })
    : Promise.resolve();

  return intro.then(
    () =>
      new Promise((resolve) => {
        const p = plan.power;

        // Savurma sesi vurustan biraz once dusmeli -- darbenin "geldigini"
        // haber veren sey bu, carpma sesinin kendisi kadar agirlik katiyor.
        const swing = () => fx.sound("whoosh", { power: p }, Math.max(0, plan.attackHit - 0.14));

        const strike = (lethal) => {
          fx.flash({ strength: (lethal ? 0.16 : 0.08) + 0.14 * p, ms: lethal ? 200 : 130 });
          rig.shake?.fire((lethal ? 0.16 : 0.07) * p, lethal ? 0.4 : 0.22);
          timeScale.freeze((lethal ? 60 : 28) + 30 * p);
          if (lethal) {
            fx.sound("impact", { pitch: 70 + 40 / p, power: p });
            fx.sound("dust", { power: p }, 0.09);
          } else {
            fx.sound("clash", { power: p });
          }
        };

        const cues = [];

        if (plan.mode === "kapali") {
          cues.push({ t: 0, run: () => attacker.play(CLIP.WALK, { loop: true, speed: yuruHizi(plan.yaklasmaKareSn) }) });
          cues.push({
            t: plan.lethal,
            run: () => {
              strike(true);
              victim?.play(CLIP.DEATH, { loop: false, speed: SPEED.death * 1.4, fade: 0.08 });
            },
          });
          cues.push({ t: plan.walkEnd, run: () => attacker.idle(0.22) });
        } else if (plan.mode === "sparta") {
          cues.push({
            t: 0,
            run: () => {
              attacker.rotation.y = attackerYaw;
              attacker.play(CLIP.WALK, { loop: true, speed: yuruHizi(plan.yaklasmaKareSn) });
              fx.sound("step", { power: 0.6 * p });
              // Muzik gercek saniyede yasar; tekmeye kadar olan kismi
              // simdiden programlaniyor (bkz. score.js).
              skorGiris(fx, plan.lethal, p);
            },
          });
          cues.push({ t: plan.walkEnd * 0.55, run: () => fx.sound("step", { power: 0.6 * p }) });

          // 1) Bloklanan savurma: tekmenin oncesinde bir alisveris olmali,
          //    yoksa tekme "dovus" degil "sürpriz" gibi okunuyor.
          cues.push({
            t: plan.firstSwing,
            run: () => {
              attacker.play(CLIP.ATTACK, { loop: false, speed: SPEED.attack });
              swing();
            },
          });
          cues.push({
            t: plan.blockStart,
            run: () => victim?.play(CLIP.BLOCK, { loop: false, speed: SPEED.block }),
          });
          cues.push({ t: plan.blocked, run: () => strike(false) });

          // 2) Tekme. Eski savasci setinde Attack_Kick yok; play() 0 donerse
          //    normal savurmaya duselim (iki kare kayar, sahne durmaz).
          cues.push({
            t: plan.kickStart,
            run: () => {
              const sure = attacker.play(CLIP_EK.KICK, { loop: false, speed: SPEED.kick, fade: 0.1 });
              if (!sure) attacker.play(CLIP.ATTACK, { loop: false, speed: SPEED.attack, fade: 0.1 });
              fx.sound("whoosh", { power: p * 1.15 }, Math.max(0, KICK_IMPACT / SPEED.kick - 0.16));
            },
          });

          // 3) Temas: her sey durur, sonra govde firlar.
          cues.push({
            t: plan.lethal,
            run: () => {
              fx.flash({ strength: 0.26 + 0.16 * p, ms: 260 });
              rig.shake?.fire(0.22 * p, 0.5);
              timeScale.sequence(SPARTA_RAMPA);
              fx.sound("impact", { pitch: 54 + 30 / p, power: p * 1.2 });
              fx.sound("kirilma", { power: p });
              // Ucusun GERCEK suresi = sahne suresi + rampanin uzattigi kadar
              skorVurus(fx, p, plan.ucus + rampaEkSure(SPARTA_RAMPA));
              victim?.play(CLIP.HIT, { loop: false, speed: SPEED.hit * 0.7, fade: 0.05 });
              if (victim) savur(victim, victimPos.clone().sub(standoff).setY(0).normalize(), p);
            },
          });

          cues.push({
            t: plan.advanceStart,
            run: () => attacker.play(CLIP.WALK, { loop: true, speed: yuruHizi(plan.ilerlemeKareSn) }),
          });
          // 4) Bitis duruslari: du li bu -> ban ma bu -> Idle.
          cues.push({
            t: plan.advanceEnd,
            run: () => {
              fx.sound("place");
              // Poz Idle'in uzerine biniyor; klip degil (bkz. POZ.DULI_BU).
              attacker.idle(0.25);
              // Poz ma bu klibi devralana kadar duruyor; cozulmesi o gecisle ortusuyor,
              // yoksa iki durus arasinda notr bir an olusuyor.
              attacker.poz?.(POZ.DULI_BU, { gir: DULI_GIRIS, sure: DULI_LEN, cik: 0.32 });
              fx.sound("victory", { power: p }, 0.18);
            },
          });
          cues.push({
            t: plan.mabuStart,
            run: () => {
              // Ayak yere basarken ma bu'ya oturuyor; pozun cikisi bu gecise
              // denk geliyor. Eski savasci setinde Stance_Ready yok -> Idle.
              const sure = attacker.play(CLIP_EK.STANCE, { loop: true, fade: 0.32 });
              if (!sure) attacker.idle(0.3);
              else fx.sound("step", { power: 0.45 * p });
            },
          });
          cues.push({ t: plan.mabuEnd, run: () => attacker.idle(0.4) });
        } else {
          cues.push({
            t: 0,
            run: () => {
              attacker.rotation.y = attackerYaw;
              attacker.play(CLIP.WALK, { loop: true, speed: yuruHizi(plan.yaklasmaKareSn) });
              fx.sound("step", { power: 0.6 * p });
            },
          });
          cues.push({ t: plan.walkEnd * 0.55, run: () => fx.sound("step", { power: 0.6 * p }) });

          if (plan.mode === "tam") {
            cues.push({
              t: plan.firstSwing,
              run: () => {
                attacker.play(CLIP.ATTACK, { loop: false, speed: SPEED.attack });
                swing();
              },
            });
            cues.push({
              t: plan.blockStart,
              run: () => victim?.play(CLIP.BLOCK, { loop: false, speed: SPEED.block }),
            });
            cues.push({ t: plan.blocked, run: () => strike(false) });
          }

          cues.push({
            t: plan.lethalSwing,
            run: () => {
              attacker.play(CLIP.ATTACK, { loop: false, speed: SPEED.attack, fade: 0.1 });
              swing();
            },
          });
          cues.push({
            t: plan.lethal,
            run: () => {
              strike(true);
              victim?.play(CLIP.HIT, { loop: false, speed: SPEED.hit, fade: 0.06 });
            },
          });
          cues.push({
            t: plan.deathStart,
            run: () => {
              victim?.play(CLIP.DEATH, { loop: false, speed: SPEED.death, fade: 0.12 });
              // Govdenin tahtaya carpmasi olum klibinin ortasinda; ses de orada
              fx.sound("death", { power: p }, 0.42);
              fx.sound("shatter", { power: p * 0.7 }, 0.5);
            },
          });
          /* --- BUYUK TASLARDA PARCALANMA --- *
           *
           *  Her yemede ayni gosteriyi oynatmak yormanin en hizli yolu: bir
           *  partide 20-30 yeme oluyor. Bu yuzden TABAN degil TAVAN
           *  yukseltiliyor - piyon sakince oluyor, vezir/sah/kale dagiliyor.
           *  Nadir oldugu icin etkisini koruyor.
           *
           *  Zamanlama olum klibinin govde-carpma anina (0,42 sn) bagli:
           *  once figur devriliyor, YERE CARPINCA patliyor. Once patlatmak
           *  devrilmeyi anlamsiz kilardi. */
          // Kurbanin ARKADASLARI dustugu yere baksin. Olum klibi basladiktan
          // hemen sonra: once dusen gorulsun, sonra tepki gelsin.
          if (victim) {
            cues.push({
              t: plan.deathStart + 0.12,
              run: () => kalabalikBaksin(victimPos, {
                renk: victim.userData?.color,
                haric: [victim, attacker],
              }),
            });
          }

          const parcaAni = plan.deathStart + 0.42 / SPEED.death;
          if (victim && YILDIRIMLI.has(victim.userData?.type)) {
            // Yildirim parcalanmadan ONCE dusuyor: once vurus, sonra dagilma.
            // Ters sirada "dagildi, sonra bir sey carpti" gibi okunuyor.
            // Ara genis tutuluyor: 0,22 sn ile denendiginde parcalar simsegi
            // ortuyordu ve simsek hic okunmuyordu.
            cues.push({ t: parcaAni - 0.5, run: () => yildirimDusur(victim) });
          }
          if (victim && PARCALANAN.has(victim.userData?.type)) {
            cues.push({ t: parcaAni, run: () => parcala(victim, p) });
          }
          cues.push({
            t: plan.advanceStart,
            run: () => attacker.play(CLIP.WALK, { loop: true, speed: yuruHizi(plan.ilerlemeKareSn) }),
          });
          cues.push({
            t: plan.advanceEnd,
            run: () => {
              fx.sound("place");
              if (plan.mode === "tam") {
                attacker.play(CLIP.VICTORY, { loop: false, speed: SPEED.victory });
                fx.sound("victory", { power: p }, 0.18);
              } else {
                attacker.idle();
              }
            },
          });
          if (plan.victoryEnd != null) {
            cues.push({ t: plan.victoryEnd, run: () => attacker.idle(0.35) });
          }
        }

        /* Kurbani parcalara ayirir. Kurban tek mesh degil: govde + kaide,
           her biri cok primitifli. Hepsi ayri patlatilip figur gizleniyor.
           Parcalar oyunun OLCEKLI saatinden besleniyor (clock) - yavas cekim
           ya da donma sirasinda havada asili kalsinlar, oyundan kopmasinlar. */
        const parcala = (kurban, guc) => {
          const parcalar = [];
          kurban.traverse((o) => {
            if (o.isMesh && o.visible && o.geometry?.attributes?.position) parcalar.push(o);
          });
          if (!parcalar.length) return;
          let tohum = 1337;
          for (const mesh of parcalar) {
            let s;
            try {
              s = createShatter(mesh, { seed: tohum++, life: 1.6, power: 0.9 + guc * 0.6 });
            } catch {
              continue;            // bir parca patlamazsa sahne durmasin
            }
            // Parcalar mesh'in DUNYA konumunda dogsun: geometri yerel uzayda
            mesh.updateWorldMatrix(true, false);
            s.mesh.applyMatrix4(mesh.matrixWorld);
            scene.add(s.mesh);
            clock.add((d) => {
              if (s.update(d)) { scene.remove(s.mesh); s.dispose(); return true; }
              return false;
            });
          }
          kurban.visible = false;
        };

        /* --- SPARTA: kurbani tahtadan savur ---
         *
         *  Govde kendi MERKEZI etrafinda donmeli, ayaklarinin dibi etrafinda
         *  degil: aktorun origini yerde oldugu icin dogrudan rotation.x
         *  verilirse figur saatin akrebi gibi savrulup zemine giriyor.
         *  Cozum reparent DEGIL (aktor oyunun tas listesinde duruyor, ebeveyni
         *  degistirmek PieceSet'i bozar): merkezi ayri takip edip her karede
         *  origini `merkez - R*c` ile geri hesapliyoruz.
         */
        const savur = (kurban, yon, guc) => {
          const merkez = kurban.position.clone().setY(SPARTA.merkezY);
          const c = new THREE.Vector3(0, SPARTA.merkezY, 0);
          const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), kurban.rotation.y);
          // Takla ekseni ucus yonune dik: govde geriye dogru yuvarlaniyor.
          const eksen = new THREE.Vector3(yon.z, 0, -yon.x).normalize();
          const olcek = spartaHiz(guc);
          const v = yon.clone().multiplyScalar(SPARTA.hiz * olcek);
          let vy = SPARTA.yukselme * olcek;
          let aci = 0;
          const omega = SPARTA.takla * (0.9 + 0.25 * guc);
          let yerde = false;
          let yatis = 0;
          let omur = 0;
          const q = new THREE.Quaternion();
          const off = new THREE.Vector3();

          /** Govdenin o andaki egimine gore merkezin durabilecegi en alcak nokta. */
          const zeminY = (a) => SPARTA.yatmaY + (SPARTA.merkezY - SPARTA.yatmaY) * Math.abs(Math.cos(a));

          const carpti = () => {
            fx.flash({ strength: 0.12 + 0.08 * guc, ms: 180 });
            rig.shake?.fire(0.18 * guc, 0.42);
            timeScale.sequence(SPARTA_CARPMA_RAMPA);
            fx.sound("death", { power: guc * 1.15 });
            fx.sound("dust", { power: guc }, 0.03);
            skorCarpma(fx, guc);
            kalabalikBaksin(merkez.clone().setY(0), {
              renk: kurban.userData?.color,
              haric: [kurban, attacker],
            });
            if (YILDIRIMLI.has(kurban.userData?.type)) yildirimDusur(kurban, merkez.clone().setY(0));
            if (PARCALANAN.has(kurban.userData?.type)) {
              // Parcalanma carpmadan hemen SONRA: once govdenin yere indigi
              // gorulsun. Yildirimla ayni karede patlarsa simsek okunmuyor.
              let bekle = 0.3;
              clock.add((d) => {
                bekle -= d;
                if (bekle > 0) return false;
                parcala(kurban, guc);
                return true;
              });
            }
          };

          const uygula = () => {
            q.setFromAxisAngle(eksen, aci).multiply(yaw);
            off.copy(c).applyQuaternion(q);
            kurban.quaternion.copy(q);
            kurban.position.copy(merkez).sub(off);
          };

          uygula();
          clock.add((d) => {
            omur += d;
            if (!yerde) {
              merkez.addScaledVector(v, d);
              vy -= SPARTA.yercekimi * d;
              merkez.y += vy * d;
              aci += omega * d;
              if (vy < 0 && merkez.y <= zeminY(aci)) {
                merkez.y = zeminY(aci);
                yerde = true;
                vy = vy * -SPARTA.sekme;
                if (vy < 0.4) vy = 0; // tek agir carpma, zipzip yok
                // En yakin YATIK duruma otur (pi/2'nin tek katlari).
                yatis = Math.round((aci - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
                carpti();
              }
            } else {
              v.multiplyScalar(Math.max(0, 1 - SPARTA.surtunme * d));
              merkez.addScaledVector(v, d);
              if (vy !== 0) {
                vy -= SPARTA.yercekimi * d;
                merkez.y += vy * d;
              }
              aci += (yatis - aci) * Math.min(1, 9 * d);
              if (merkez.y < zeminY(aci)) {
                merkez.y = zeminY(aci);
                vy = 0;
              }
            }
            uygula();
            return omur > plan.total; // sahne bitince kendini birak
          });
        };

        /** Gokten yildirim: kurbanin ayagina vurur, gok gurler, ekran carpar. */
        const yildirimDusur = (kurban, hedef = null) => {
          // Sparta'da govde artik kendi karesinde degil; simsek DUSTUGU yere
          // vurmali, taşın eski karesine degil.
          const nokta = (hedef ?? kurban.position).clone();
          nokta.y = 0;
          const bolt = createLightning(nokta, { seed: 7 });
          scene.add(bolt.mesh);
          clock.add((d) => {
            if (bolt.update(d)) { scene.remove(bolt.mesh); bolt.dispose(); return true; }
            return false;
          });
          fx.flash({ strength: 0.34, ms: 240 });
          rig.shake?.fire(0.26, 0.5);
          timeScale.freeze(90);
          fx.sound("thunder", { power: 1 });
        };

        const fire = cueRunner(cues);
        let t = 0;

        const tick = (dt) => {
          t += dt;
          fire(t);

          // --- saldiranin tahta uzerindeki yolu ---
          if (plan.mode === "kapali") {
            const k = Math.min(1, t / plan.walkEnd);
            attacker.position.lerpVectors(from, to, easeInOutQuad(k));
            attacker.position.y = Math.sin(k * Math.PI) * 0.06;
          } else if (t < plan.walkEnd) {
            attacker.position.lerpVectors(from, standoff, easeInOutQuad(t / plan.walkEnd));
          } else if (t >= plan.advanceStart && t < plan.advanceEnd) {
            const k = (t - plan.advanceStart) / ADVANCE;
            attacker.position.lerpVectors(standoff, to, easeInOutQuad(k));
          } else if (t >= plan.advanceEnd) {
            attacker.position.copy(to);
          } else {
            attacker.position.copy(standoff);
          }

          // --- kurban saldirgana donuyor ---
          if (victim && plan.mode !== "kapali" && t < plan.lethal) {
            const delta = THREE.MathUtils.euclideanModulo(victimYaw - victim.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
            victim.rotation.y += THREE.MathUtils.clamp(delta, -TURN_RATE * dt, TURN_RATE * dt);
          }

          // --- olen tas tahtadan siliniyor ---
          if (victim && t >= plan.fadeStart) {
            victim.setOpacity(1 - Math.min(1, easeOutCubic((t - plan.fadeStart) / FADE)));
          }

          if (t >= plan.total) {
            attacker.position.copy(to);
            if (victim) victim.setOpacity(0);
            clock.remove(tick);
            (cinematic ? rig.restore(480) : Promise.resolve()).then(resolve);
            return true;
          }
          return false;
        };

        // Kurbanin baslangic yonu, dondurme farkini hesaplarken lazim
        if (victim) victim.rotation.y = victimYaw0;
        clock.add(tick);
      })
  );
}

/**
 * Yeme olmayan normal hamle: tas hedefe dogru donup yuruyor.
 * Rok'ta iki tas ayni anda bu yolu kullaniyor.
 */
export function runQuietMove({ actor, fromSquare, toSquare, clock, fx = LIVE_FX }) {
  const from = squareToWorld(fromSquare);
  const to = squareToWorld(toSquare);
  const dist = from.distanceTo(to);
  const duration = THREE.MathUtils.clamp(dist / MOVE_SPEED, 0.35, 1.5);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const homeYaw = actor.homeYaw;

  actor.rotation.y = yaw;
  actor.play(CLIP.WALK, { loop: true, speed: yuruHizi(dist / duration) });
  fx.sound("step", { power: 0.5 });

  return new Promise((resolve) => {
    let t = 0;
    const tick = (dt) => {
      t += dt;
      const k = Math.min(1, t / duration);
      actor.position.lerpVectors(from, to, easeInOutQuad(k));
      if (k >= 1) {
        actor.position.copy(to);
        actor.rotation.y = homeYaw;
        actor.idle();
        fx.sound("place");
        clock.remove(tick);
        resolve();
        return true;
      }
      return false;
    };
    clock.add(tick);
  });
}
