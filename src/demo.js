import * as THREE from "three";
import { squareToWorld } from "./board.js";
import { createPiece, attachActorClock, resetIdlePhase, POZ } from "./pieces.js";
import { runFinisher } from "./finishers.js";
import { Clock } from "./clock.js";
import { TimeScale } from "./fx/impact.js";
import { renderAyarla, ortamKur, VARSAYILAN_ORTAM } from "./env.js";

/**
 * Kare kare dogrulama modu.
 *
 *   ?demo=qxp        -> vezir piyonu yiyor, 6 zaman noktasi tek serit halinde
 *   ?demo=all        -> alti imza hareketinin tamami, 6x6 tablo
 *
 * Butun kareler TEK sayfa yuklemesinde uretiliyor. Her kare icin ayri headless
 * Chrome acmak kare basina dakikalar suruyordu; boylece tek acilista bitiyor.
 *
 * Determinizm sart: sinematik kamera, hit-stop ve sarsinti kapali, saat sabit
 * adimla ilerletiliyor, parcalanma tohumu sabit. Ayni URL her zaman ayni goruntu.
 */

// Zaman noktalari dovusun fazlarina denk geliyor: yurume, savurma, vurus,
// olum, silinme, toparlanma. Klipler kisalir/uzarsa buranin da guncellenmesi
// gerekiyor -- degerler planFinisher'in ciktisiyla elle hizalandi.
// `?times=0,1,2` ile gecici olarak baska anlara bakilabiliyor: sparta gibi
// uzun dovuslerin kuyrugu bu listenin disinda kaliyor.
const TIMES = [0.0, 0.32, 0.62, 0.95, 1.5, 2.3];
const ALL_SPECS = ["pxp", "rxp", "nxp", "bxp", "qxp", "kxp"];
const NAMES = { p: "PIYON", r: "KALE", n: "AT", b: "FIL", q: "VEZIR", k: "SAH" };

const TILE_W = 440;
const TILE_H = 380;

const FROM = "d4";
const TO = "d5";

export async function runDemo({ params, scene, settings, assets }) {
  /* !! YENI PERDE EKLENIRSE BU LISTEYE DE EKLE. Yukleme perdesi ve menu
     tam ekran ve z-index 30 -- listede olmazlarsa klip/demo ciktisinin
     ustunde durup butun kareleri kapatirlar. */
  for (const id of ["hud", "ui", "scene", "yukleme", "menu"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  const spec = params.get("demo") || "pxp";
  const specs = spec === "all" ? ALL_SPECS : [spec];

  // Finisher'in kameraya dokunmasini engelleyen sahte rig
  settings.cinematic = false;
  // Dogrulama modu her zaman ayni sahneyi gostermeli; kullanicinin kayitli
  // dovus ayari kareleri degistirmesin
  settings.duel = params.get("duel") || "kisa";
  const stubRig = {
    shake: null,
    focus: () => Promise.resolve(),
    restore: () => Promise.resolve(),
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(TILE_W, TILE_H, false);
  // Golge + tone mapping oyunla BIREBIR ayni yerden (bkz. env.js).
  renderAyarla(renderer);
  // Bu yolda applyTheme calismiyor; IBL'i elle kur, yoksa taslar oyundakinden duz cikar.
  ortamKur(scene, VARSAYILAN_ORTAM.bg, VARSAYILAN_ORTAM.zemin);

  const cam = new THREE.PerspectiveCamera(42, TILE_W / TILE_H, 0.1, 100);
  const look = squareToWorld(TO).clone().setY(0.5);
  const s = new THREE.Spherical(4.9, Math.PI / 2.9, -0.75);
  cam.position.copy(look).add(new THREE.Vector3().setFromSpherical(s));
  cam.lookAt(look);

  const times = (params.get("times") || "")
    .split(",")
    .map(Number)
    .filter(Number.isFinite);
  if (!times.length) times.push(...TIMES);

  const sheet = document.createElement("canvas");
  sheet.width = TILE_W * times.length;
  sheet.height = TILE_H * specs.length;
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let row = 0; row < specs.length; row++) {
    const [attackerType = "p", victimType = "p"] = specs[row].split("x");

    for (let col = 0; col < times.length; col++) {
      const t = times[col];
      const keep = new Set(scene.children);

      resetIdlePhase();
      const attacker = createPiece(assets, attackerType, "w");
      attacker.position.copy(squareToWorld(FROM));
      const victim = createPiece(assets, victimType, "b");
      victim.position.copy(squareToWorld(TO));
      scene.add(attacker);
      scene.add(victim);

      // Her kare kendi saatiyle sifirdan oynuyor -- kareler birbirini etkilemesin
      const timeScale = new TimeScale();
      timeScale.freeze = () => {};
      timeScale.slow = () => {};
      // Sparta rampasi da kapali olmali: yavas cekim sahne saatini gerçek
      // zamana bagliyor, sabit adimla ilerleyen bu modda dovus t saniyede
      // bitmiyor (olculdu: t=5.9'da govde hala havadaydi).
      timeScale.sequence = () => {};
      const clock = new Clock(timeScale);
      // Iskelet klipleri de bu karenin saatinden beslenmeli
      attachActorClock(clock);

      if (params.has("poz")) {
        // Poz ayarlama modu: dovus yok, sadece Idle + poz.
        attacker.position.copy(squareToWorld(TO));
        attacker.faceTowards(cam.position);
        victim.visible = false;
        // Bu modda `times` sure degil, POZ acilarinin CARPANI: tek render'da
        // birkac varyant yan yana gorunuyor (isaret/siddet ayari icin).
        const taban = POZ[params.get("poz")] || {};
        const olcekli = {};
        for (const [ad, acilar] of Object.entries(taban)) {
          olcekli[ad] = Object.fromEntries(Object.entries(acilar).map(([e, a]) => [e, a * t]));
        }
        attacker.poz(olcekli, { gir: 0.001, sure: 99 });
        for (let acc = 0; acc < 0.05; acc += 1 / 120) clock.tick(1 / 120);
        renderer.render(scene, cam);
        ctx.drawImage(renderer.domElement, col * TILE_W, row * TILE_H);
        attacker.dispose();
        victim.dispose();
        for (const child of [...scene.children]) if (!keep.has(child)) scene.remove(child);
        continue;
      }

      runFinisher({
        scene,
        attacker,
        victim,
        fromSquare: FROM,
        toSquare: TO,
        victimSquare: TO,
        rig: stubRig,
        timeScale,
        settings,
        clock,
      });

      // runFinisher tick'ini bir microtask sonra kaydediyor; beklemeden
      // saati ilerletirsek hicbir sey oynamiyor.
      await new Promise((r) => setTimeout(r, 0));

      const STEP = 1 / 120;
      for (let acc = 0; acc < t; acc += STEP) clock.tick(STEP);

      renderer.render(scene, cam);
      ctx.drawImage(renderer.domElement, col * TILE_W, row * TILE_H);

      // Etiketler
      ctx.font = "600 15px system-ui, sans-serif";
      ctx.fillStyle = "#e8e4dc";
      ctx.fillText(`t=${t.toFixed(2)}s`, col * TILE_W + 14, row * TILE_H + 26);
      if (col === 0) {
        ctx.font = "700 16px system-ui, sans-serif";
        ctx.fillStyle = "#7fd4ff";
        ctx.fillText(
          `${NAMES[attackerType]} x ${NAMES[victimType]}`,
          col * TILE_W + 14,
          row * TILE_H + TILE_H - 16
        );
      }

      // Bu karede sahneye eklenen her sey temizlensin. dispose() sart:
      // aktorler mixer'lariyla birlikte global listede duruyor, sadece
      // sahneden cikarmak 36 karelik tabloda 72 mixer birikmesi demek.
      attacker.dispose();
      victim.dispose();
      for (const child of [...scene.children]) {
        if (!keep.has(child)) scene.remove(child);
      }
    }
  }

  renderer.dispose();

  const img = document.createElement("img");
  img.src = sheet.toDataURL("image/png");
  img.style.cssText = "display:block;width:100vw;height:auto";
  document.body.style.cssText = "margin:0;background:#0b0d10;overflow:auto";
  document.body.appendChild(img);
}
