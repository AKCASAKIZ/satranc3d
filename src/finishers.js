import * as THREE from "three";
import { squareToWorld } from "./board.js";
import { createShatter } from "./fx/shatter.js";
import { flash } from "./fx/impact.js";
import { play } from "./fx/audio.js";

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
 * Altı imza oldurus hareketi.
 *
 * Onemli tasarim karari: taslar KATI CISIM, hareketin tamami konum/donus/olcek
 * egrisi. Bu yuzden rig, skinning veya Blender animasyonu yok -- hepsi burada
 * prosedurel keyframe. Iterasyon aninda, ogrenme egrisi sifir.
 *
 * Ton: sert ama soyut. Guc, carpma ani + parcalanmayla tasiniyor; kan yok.
 */

const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeInCubic = (k) => k * k * k;
const easeInOutQuad = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/**
 * Her finisher bir "zaman cizelgesi" tanimliyor: sureler + carpma ani +
 * saldiranin o andaki konumunu veren fonksiyon.
 *
 *   from/to  : dunya koordinatlari
 *   k        : 0..1 normalize zaman
 *   donus    : { pos: Vector3, rot?: {x,y,z}, scale?: Vector3 }
 */
const MOVES = {
  // Piyon: geri cekilip kafa atma, ardindan cift sekme
  p: {
    duration: 1.15,
    impactAt: 0.34,
    arc: 0.12,
    power: 0.75,
    shakeStrength: 0.1,
    at(k, from, to, up) {
      const pos = new THREE.Vector3();
      if (k < 0.22) {
        // hazirlik: geri cekilme
        const e = easeOutCubic(k / 0.22);
        pos.lerpVectors(from, to, -0.18 * e);
      } else if (k < 0.34) {
        // atilis
        const e = easeInCubic((k - 0.22) / 0.12);
        pos.lerpVectors(from, to, -0.18 + 1.18 * e);
      } else {
        // cift sekme ile yerlesme
        const e = (k - 0.34) / 0.66;
        pos.copy(to);
        pos.addScaledVector(up, Math.abs(Math.sin(e * Math.PI * 2)) * 0.12 * (1 - e));
      }
      return { pos };
    },
  },

  // Kale: yukselip hedefin ustune agir cokus
  r: {
    duration: 1.35,
    impactAt: 0.46,
    arc: 1.9,
    power: 1.25,
    shakeStrength: 0.22,
    at(k, from, to, up) {
      const pos = new THREE.Vector3();
      if (k < 0.28) {
        // yukselme
        const e = easeOutCubic(k / 0.28);
        pos.copy(from).addScaledVector(up, 1.9 * e);
      } else if (k < 0.46) {
        // hedefin ustune kayis + serbest dusus
        const e = (k - 0.28) / 0.18;
        pos.lerpVectors(from, to, easeInOutQuad(e));
        pos.addScaledVector(up, 1.9 * (1 - easeInCubic(e)));
      } else {
        const e = (k - 0.46) / 0.54;
        pos.copy(to).addScaledVector(up, 0.1 * (1 - e) * Math.sin(e * Math.PI * 3));
      }
      return { pos };
    },
  },

  // At: yay cizerek sicrayis, iki ayakla ezis
  n: {
    duration: 1.3,
    impactAt: 0.42,
    arc: 2.3,
    power: 1.15,
    shakeStrength: 0.2,
    at(k, from, to, up) {
      const pos = new THREE.Vector3();
      const rot = { x: 0, y: 0, z: 0 };
      if (k < 0.42) {
        const e = k / 0.42;
        pos.lerpVectors(from, to, easeInOutQuad(e));
        pos.addScaledVector(up, Math.sin(e * Math.PI) * 2.3);
        rot.x = -Math.sin(e * Math.PI) * 0.55; // one dogru egilme
      } else {
        const e = (k - 0.42) / 0.58;
        pos.copy(to).addScaledVector(up, 0.14 * (1 - e) * Math.sin(e * Math.PI * 2.5));
        rot.x = -0.55 * Math.max(0, 1 - e * 3);
      }
      return { pos, rot };
    },
  },

  // Fil: caprazdan hizli suzulus -- carpmadan sonra da devam edip durur
  b: {
    duration: 1.25,
    impactAt: 0.38,
    arc: 0.0,
    power: 1.0,
    shakeStrength: 0.14,
    at(k, from, to, up) {
      const pos = new THREE.Vector3();
      const rot = { x: 0, y: 0, z: 0 };
      if (k < 0.16) {
        const e = easeOutCubic(k / 0.16);
        pos.lerpVectors(from, to, -0.12 * e);
        rot.z = 0.25 * e;
      } else if (k < 0.55) {
        // icinden gecis: hedefi asip devam ediyor
        const e = easeInCubic((k - 0.16) / 0.39);
        pos.lerpVectors(from, to, -0.12 + 1.5 * e);
        rot.z = 0.25 - 0.5 * e;
      } else {
        // geri suzulup karesine oturma
        const e = easeOutCubic((k - 0.55) / 0.45);
        pos.lerpVectors(from, to, 1.38 - 0.38 * e);
        rot.z = -0.25 * (1 - e);
      }
      return { pos, rot };
    },
  },

  // Vezir: havada donerek tek darbe
  q: {
    duration: 1.4,
    impactAt: 0.44,
    arc: 1.4,
    power: 1.3,
    shakeStrength: 0.24,
    at(k, from, to, up) {
      const pos = new THREE.Vector3();
      const rot = { x: 0, y: 0, z: 0 };
      if (k < 0.44) {
        const e = k / 0.44;
        pos.lerpVectors(from, to, easeInCubic(e));
        pos.addScaledVector(up, Math.sin(e * Math.PI) * 1.4);
        rot.y = e * Math.PI * 4; // iki tam tur
      } else {
        const e = (k - 0.44) / 0.56;
        pos.copy(to).addScaledVector(up, 0.1 * (1 - e) * Math.sin(e * Math.PI * 2));
        rot.y = Math.PI * 4 + easeOutCubic(e) * Math.PI * 0.5;
      }
      return { pos, rot };
    },
  },

  // Sah: yavas tek adim, kurban basincla icine coker
  k: {
    duration: 1.55,
    impactAt: 0.55,
    arc: 0.22,
    power: 1.45,
    shakeStrength: 0.28,
    at(k, from, to, up) {
      const pos = new THREE.Vector3();
      if (k < 0.55) {
        // agir, kararli ilerleyis
        const e = easeInOutQuad(k / 0.55);
        pos.lerpVectors(from, to, e);
        pos.addScaledVector(up, Math.sin(e * Math.PI) * 0.22);
      } else {
        const e = (k - 0.55) / 0.45;
        pos.copy(to).addScaledVector(up, 0.06 * (1 - e) * Math.sin(e * Math.PI * 2));
      }
      return { pos };
    },
  },
};

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Bir hareketin sure/carpma bilgisi. Klip kaydi klibin uzunlugunu ve kamera
 * dalisinin ne zaman bitecegini buradan okuyor -- sureler iki yerde yazili
 * olsaydi finisher'i her ayarlayista video kadraji kayardi.
 */
export function finisherTiming(type) {
  const m = MOVES[type] ?? MOVES.p;
  return { duration: m.duration, impactAt: m.impactAt, power: m.power, arc: m.arc ?? 0 };
}

/**
 * Bir yeme sahnesini bastan sona oynatir.
 * Cozulmesi animasyon bitince olur; main.js bu sure boyunca girdiyi kilitliyor.
 */
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
  const move = MOVES[attacker.userData.type] ?? MOVES.p;
  const from = squareToWorld(fromSquare);
  const to = squareToWorld(toSquare);
  const victimPos = squareToWorld(victimSquare ?? toSquare);

  const baseRot = { x: attacker.rotation.x, y: attacker.rotation.y, z: attacker.rotation.z };
  const cinematic = settings.cinematic !== false;

  // Sinematik acilmis ise once kamera kurbanin yanina dalsin
  const intro = cinematic
    ? rig.focus(victimPos.clone().setY(0.45), { duration: 300 })
    : Promise.resolve();

  return intro.then(
    () =>
      new Promise((resolve) => {
        let t = 0;
        let impacted = false;
        let shatter = null;

        const tick = (dt) => {
          t += dt;
          const k = Math.min(1, t / move.duration);

          // --- saldiranin hareketi ---
          const s = move.at(k, from, to, UP);
          attacker.position.copy(s.pos);
          if (s.rot) {
            attacker.rotation.set(
              baseRot.x + s.rot.x,
              baseRot.y + s.rot.y,
              baseRot.z + s.rot.z
            );
          }

          // --- carpma ani ---
          if (!impacted && k >= move.impactAt) {
            impacted = true;

            if (victim) {
              shatter = createShatter(victim, {
                seed: 1337,
                life: 1.5,
                power: move.power,
              });
              scene.add(shatter.mesh);
              victim.visible = false;
            }

            fx.flash({ strength: 0.16 + 0.14 * move.power, ms: 200 });
            rig.shake?.fire(move.shakeStrength, 0.4);
            timeScale.freeze(60 + 30 * move.power);

            fx.sound("impact", { pitch: 70 + 40 / move.power, power: move.power });
            fx.sound("shatter", { power: move.power });
            fx.sound("dust", { power: move.power }, 0.09);
          }

          if (shatter && shatter.update(dt)) {
            scene.remove(shatter.mesh);
            shatter.dispose();
            shatter = null;
          }

          if (k >= 1) {
            attacker.position.copy(to);
            attacker.rotation.set(baseRot.x, baseRot.y, baseRot.z);
            fx.sound("place");

            // Parcalar hala ucuyorsa sahnede biraksin, oyun beklemesin
            if (shatter) {
              const leftover = shatter;
              clock.add((d) => {
                if (leftover.update(d)) {
                  scene.remove(leftover.mesh);
                  leftover.dispose();
                  return true;
                }
                return false;
              });
            }

            clock.remove(tick);
            (cinematic ? rig.restore(480) : Promise.resolve()).then(resolve);
            return true;
          }
          return false;
        };

        clock.add(tick);
      })
  );
}

/** Yeme olmayan normal hamle -- sade kayma. */
export function runQuietMove({ mesh, fromSquare, toSquare, clock, duration = 0.3, fx = LIVE_FX }) {
  const from = squareToWorld(fromSquare);
  const to = squareToWorld(toSquare);
  return new Promise((resolve) => {
    let t = 0;
    const tick = (dt) => {
      t += dt;
      const k = Math.min(1, t / duration);
      const e = easeInOutQuad(k);
      mesh.position.lerpVectors(from, to, e);
      mesh.position.y = Math.sin(e * Math.PI) * 0.3;
      if (k >= 1) {
        mesh.position.copy(to);
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
