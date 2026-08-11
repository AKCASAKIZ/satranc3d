import * as THREE from "three";
import { squareToWorld } from "./board.js";
import { flash } from "./fx/impact.js";
import { createShatter } from "./fx/shatter.js";
import { play } from "./fx/audio.js";
import { CLIP, ATTACK_IMPACT, ATTACK_LENGTH, BLOCK_IMPACT, CLIP_LENGTH } from "./pieces.js";

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
const SPEED = { walk: 1.0, attack: 1.3, block: 1.3, hit: 1.3, death: 1.35, victory: 1.35 };

const MOVE_SPEED = 2.6; // kare/sn -- tahtada yurume hizi
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

/** Dovus uzunlugu ayari. UI'da "Oldurus" basligi altinda. */
export const DUEL_MODES = {
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
      lethal: slide * 0.72,
      fadeStart: slide * 0.72,
      total: slide + FADE * 0.7,
    };
  }

  const approach = Math.max(0, dist - STANDOFF);
  const walkEnd = THREE.MathUtils.clamp(approach / MOVE_SPEED, 0.25, 0.95);

  const attackLen = ATTACK_LENGTH[type] / SPEED.attack;
  const attackHit = ATTACK_IMPACT[type] / SPEED.attack;

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
  return { duration: p.total, impactAt: p.lethal / p.total, power: p.power, arc: 0 };
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
          cues.push({ t: 0, run: () => attacker.play(CLIP.WALK, { loop: true, speed: 1.4 }) });
          cues.push({
            t: plan.lethal,
            run: () => {
              strike(true);
              victim?.play(CLIP.DEATH, { loop: false, speed: SPEED.death * 1.4, fade: 0.08 });
            },
          });
          cues.push({ t: plan.walkEnd, run: () => attacker.idle(0.22) });
        } else {
          cues.push({
            t: 0,
            run: () => {
              attacker.rotation.y = attackerYaw;
              attacker.play(CLIP.WALK, { loop: true, speed: SPEED.walk });
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
          if (victim && PARCALANAN.has(victim.userData?.type)) {
            cues.push({
              t: plan.deathStart + 0.42 / SPEED.death,
              run: () => parcala(victim, p),
            });
          }
          cues.push({
            t: plan.advanceStart,
            run: () => attacker.play(CLIP.WALK, { loop: true, speed: SPEED.walk }),
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
  const duration = THREE.MathUtils.clamp(dist / MOVE_SPEED, 0.28, 0.95);
  const yaw = Math.atan2(to.x - from.x, to.z - from.z);
  const homeYaw = actor.homeYaw;

  actor.rotation.y = yaw;
  actor.play(CLIP.WALK, { loop: true, speed: SPEED.walk });
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
