import * as THREE from "three";
import { squareToWorld } from "./board.js";
import { createPiece, attachActorClock, resetIdlePhase } from "./pieces.js";
import { runFinisher, finisherTiming } from "./finishers.js";
import { Clock } from "./clock.js";
import { TimeScale, Shake } from "./fx/impact.js";
import { renderEventsToWav } from "./fx/audio.js";
import { renderAyarla, ortamKur, VARSAYILAN_ORTAM } from "./env.js";

/**
 * Klip kayit modu -- oyunun kendi pazarlama icerigini uretmesi buradan geciyor.
 *
 *   ?clip=qxp              -> tek oldurus, dikey video karesi + wav
 *   ?clip=all              -> alti imza hareketi arka arkaya, tek Chrome acilisinda
 *   &w=540 &fps=60 &label=0
 *
 * Kareler PNG olarak dev sunucusuna POST ediliyor (vite.config.js icindeki
 * middleware diske yaziyor), ses OfflineAudioContext'te ayni voice koduyla
 * uretiliyor. Sonra tools/make_clip.sh ffmpeg ile mp4'e ciriyor.
 *
 * DETERMINIZM SART: gercek zaman hicbir yerde okunmuyor. Saat sabit adimla
 * ilerliyor, hit-stop sanal saatten besleniyor, parcalanma tohumu sabit.
 * Ayni URL her zaman ayni videoyu verir -- yoksa "sunu biraz duzelt" diye
 * geri donuldugunde karsilastirma yapilamaz.
 */

/* Ilk alti kanal deneyinin ilk partisi. Sonraki dortlu kanca gucune gore
   secildi: kurbanin VEZIR olmasi gokte yildirim cakmasini tetikliyor
   (bkz. YILDIRIMLI, finishers.js), piyonun agir tas yemesi ise en guclu
   "cirak ustayi yendi" kancasi. */
const ALL_SPECS = ["pxp", "rxq", "nxb", "bxn", "qxr", "kxp"];
const YENI_SPECS = ["pxq", "kxq", "pxr", "qxb"];
// Klip etiketleri INGILIZCE: kanal ve portal kitlesi kuresel. Turkce
// etiket ("VEZIR x KALE") videoyu Turkiye disinda okunmaz kiliyordu.
const NAMES = { p: "PAWN", r: "ROOK", n: "KNIGHT", b: "BISHOP", q: "QUEEN", k: "KING" };

// Kurbanin hangi kareye kondugu kadrajı belirliyor; tahtanin ortasi en genis
// arka plani veriyor, kenarda cekince kadrajin yarisi bos kaliyor.
const FROM = "d4";
const TO = "d5";

const PRE_ROLL = 0.3; // carpma oncesi nefes -- Shorts'ta ilk kare donuk olmamali
const TAIL = 1.15; // parcalar yere insin, ses kuyrugu kesilmesin

/**
 * Klip suresi finisher suresine gore degisiyor; sah 1.55 sn, piyon 1.15 sn.
 *
 * `rampa` yavas cekimin kattigi EK GERCEK sure. Sahnenin cizelgesi
 * olceklenmis saatte, videonun uzunlugu gercek saniyede olculuyor; 0,3
 * hizda gecen bir saniye sahneyi yalnizca 300 ms ilerletir. Eklenmezse
 * Sparta klibi govde daha havadayken kesiliyor.
 */
function clipLength(duration, rampa = 0, tail = TAIL) {
  return PRE_ROLL + duration + rampa + tail;
}

/**
 * Deterministik sinematik kamera.
 *
 * Kamera saldirinin YAN'ında duruyor, arkasinda degil: hareket ekranda
 * boydan boya kayarsa "geliyor" hissi veriyor, arkadan cekince tas sadece
 * kuculuyor. Carpmaya kadar iceri dalis, carpmada mikro geri tepme,
 * sonrasinda yavas acilma.
 */
function makeClipCamera({ from, to, impactTime, total, arcHeight = 0, launch = null }) {
  // Bakis noktasi tahtanin biraz ustunde: dikey kadrajda kamera yatayken
  // ust yarisi bos gokyuzu oluyor, bakisi asagi cevirince tahta dolduruyor.
  const anchor = to.clone().lerp(from, 0.3).setY(0.55);

  const back = from.clone().sub(to).setY(0).normalize();
  const perp = new THREE.Vector3(back.z, 0, -back.x);
  const dir = back.clone().multiplyScalar(0.45).add(perp).normalize();
  const theta0 = Math.atan2(dir.x, dir.z);

  /* Savrulma icin kamera ACISI DEGISIYOR.
     Yaklasma cekiminde kamera hareketin YANINDA duruyor -- tas ekrani
     boydan boya gectigi icin "geliyor" hissi orada. Ama ucus ayni eksende:
     dikey kadrajda yatay alan dar (9:16'da yatay gorus ~24 derece), govde
     iki kare gidince ya kadraji tasiyor ya da geri cekmek gerekiyor ve iki
     figur de kucucuk kaliyor. Kamera ucus boyunca saldiranin ARKASINA
     kayarsa govde ekranda YUKARI dogru gidiyor ve kadrajin uzun kenari
     kullaniliyor. Tam eksene oturmuyor (0,28 rad pay): tam arkadan cekim
     duz ve derinliksiz. */
  const thetaArka = Math.atan2(back.x, back.z) + 0.28;

  // Sicrayan taslar (at 2.3, kale 1.9, vezir 1.4 birim yukseliyor) yakin
  // planda kadrajin ustunden tasiyordu. Yaklasma mesafesi hareketin
  // yuksekligine gore aciliyor -- her finisher icin ayri ayar tutmaya gerek yok.
  const near = 4.3 + arcHeight * 0.62;
  const far = near + 2.1;

  /* Savrulan govde kadrajin disina cikmasin.
     Ilk deneme bakis noktasini ucus YONUNDE kaydiriyordu; olculdu, yanlisti:
     govde iki kare gidince saldiran kadrajin solundan tasiyor ve son iki
     saniye bos tahtaya bakiliyor. Dogrusu bakis noktasini iki figurun
     ORTASINA baglamak -- kadraj ikisini de tutuyor, hiz hissi de kayboluyor
     degil cunku kamera yalniz yarim yolu gidiyor. Konumlar deterministik
     oldugu icin bu hala ayni videoyu uretiyor. */
  const anchorT = anchor.clone();
  const hedef = new THREE.Vector3();
  let sonT = null;

  return (camera, t) => {
    let radius;
    let phi;
    let theta;

    const dt = sonT == null ? 0 : Math.max(0, t - sonT);
    sonT = t;

    if (launch && t > launch.at) {
      hedef.copy(launch.orta()).setY(0.46);
      // Yumusatma: ani gecis "kamera sicradi" gibi okunuyor
      anchorT.lerp(hedef, 1 - Math.exp(-5 * dt));
    } else {
      anchorT.copy(anchor);
    }

    if (t < impactTime) {
      const k = Math.min(1, t / Math.max(0.001, impactTime));
      const e = k * k * (3 - 2 * k); // smoothstep
      radius = THREE.MathUtils.lerp(far, near, e);
      phi = THREE.MathUtils.lerp(Math.PI / 3.15, Math.PI / 2.75, e);
      theta = theta0 + 0.3 * e;
    } else {
      const k = Math.min(1, (t - impactTime) / Math.max(0.001, total - impactTime));
      const e = 1 - Math.pow(1 - k, 3);
      // carpmada kisa geri tepme, sonra acilma
      const kick = Math.exp(-k * 14) * 0.45;
      radius = THREE.MathUtils.lerp(near, near + 1.3, e) + kick;
      phi = THREE.MathUtils.lerp(Math.PI / 2.75, Math.PI / 3.0, e);
      theta = theta0 + 0.3 + 0.38 * e;
    }

    if (launch && t > launch.at) {
      // Ucus suresince arkaya kayis; en kisa yoldan (aci farkini +-pi'ye
      // indirgeyerek), yoksa kamera bazen tahtanin etrafinda ters yonden
      // dolasiyor.
      const k = Math.min(1, (t - launch.at) / Math.max(0.001, launch.dur * 1.15));
      const e = 1 - Math.pow(1 - k, 3);
      const fark = ((thetaArka - theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      theta += fark * e;
      // Arkaya gecince govde ekranda yukari gidiyor; asagidan bakmak
      // ucusu yukseltiyor.
      phi += 0.1 * e;
      radius += 0.55 * e;
    }

    const s = new THREE.Spherical(radius, phi, theta);
    s.makeSafe();
    camera.position.copy(anchorT).add(new THREE.Vector3().setFromSpherical(s));
    camera.lookAt(anchorT);
  };
}

/** 2D katman: flas, alt bant etiketi, hafif vinyet. */
function composite(ctx, { w, h, flash, label, sub }) {
  if (flash > 0.002) {
    ctx.fillStyle = `rgba(255,235,200,${flash})`;
    ctx.fillRect(0, 0, w, h);
  }

  // Vinyet -- dikey kadrajda tahtanin kenarlari yoksa goz ortaya gitsin
  const g = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.16, w / 2, h * 0.46, h * 0.62);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (!label) return;
  const base = Math.round(h * 0.052);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f4efe4";
  ctx.font = `800 ${base}px "Helvetica Neue", system-ui, sans-serif`;
  ctx.fillText(label, w / 2, h * 0.885);
  if (sub) {
    ctx.fillStyle = "rgba(200,214,228,0.75)";
    ctx.font = `600 ${Math.round(base * 0.42)}px "Helvetica Neue", system-ui, sans-serif`;
    ctx.fillText(sub, w / 2, h * 0.885 + base * 0.72);
  }
}

async function post(url, body, type) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": type },
    body,
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
}

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Tek bir oldurusu kare kare render edip sunucuya yollar. */
async function recordOne({ spec, scene, assets, settings, renderer, canvas2d, opts }) {
  const [attackerType = "q", victimType = "p"] = spec.split("x");
  const { w, h, fps, label } = opts;

  const keep = new Set(scene.children);
  resetIdlePhase();
  const attacker = createPiece(assets, attackerType, "w");
  attacker.position.copy(squareToWorld(FROM));
  const victim = createPiece(assets, victimType, "b");
  victim.position.copy(squareToWorld(TO));
  scene.add(attacker, victim);

  // --- sanal saat: gercek zaman hicbir yerde okunmuyor ---
  let elapsed = 0;
  const timeScale = new TimeScale(() => elapsed * 1000);
  const clock = new Clock(timeScale);
  // Iskelet klipleri de sanal saatten beslensin -- yoksa hit-stop sirasinda
  // kamera donar ama karakterler oynamaya devam eder.
  attachActorClock(clock);

  // --- efektler olay listesine yaziliyor ---
  const sounds = [];
  let flashState = null;
  const fx = {
    flash: ({ strength, ms }) => {
      flashState = { t0: elapsed, strength, ms };
    },
    sound: (type, o = {}, delay = 0) => {
      sounds.push({ type, at: elapsed + delay, opts: o });
    },
  };

  const shake = new Shake();
  const stubRig = { shake, focus: () => Promise.resolve(), restore: () => Promise.resolve() };
  settings.cinematic = false; // kamerayi rig degil, klip yolu suruyor

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
    fx,
  });
  // runFinisher tick'ini bir microtask sonra kaydediyor
  await new Promise((r) => setTimeout(r, 0));

  const fromPos = squareToWorld(FROM);
  const toPos = squareToWorld(TO);
  const timing = finisherTiming(attackerType, settings.duel, fromPos.distanceTo(toPos));
  // Savrulmali klipte kuyruk kisa: molozun inmesi ve sesin sonmesi zaten
  // ucus boyunca oluyor, uzun kuyruk bos tahtaya bakmak demek.
  const total = clipLength(timing.duration, timing.rampa, timing.ucus > 0 ? 0.7 : TAIL);
  const frames = Math.round(total * fps);
  const step = 1 / fps;

  /* Kamera SAHNE saatinde surulur, gercek saatte degil.
     Yavas cekim sahneyi yavaslatiyor; kamera gercek saatte kalsaydi
     govde havada asili dururken kamera yolunu bitirip donardi. Ayni
     saati kullanmak yavas cekimi kameraya da tasiyor -- 300 estetiginin
     yarisi bu. */
  const camTotal = PRE_ROLL + timing.duration;
  const cam = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
  const camPath = makeClipCamera({
    from: fromPos,
    to: toPos,
    impactTime: PRE_ROLL + timing.impactAt * timing.duration,
    total: camTotal,
    arcHeight: timing.arc,
    launch:
      timing.ucus > 0
        ? {
            at: PRE_ROLL + timing.impactAt * timing.duration,
            dur: timing.ucus,
            // 0,55 denendi: bakis kurbana fazla yakin kalinca saldiran sol
            // kenardan tasiyordu. 0,42 ikisini de iceride tutuyor.
            orta: () => attacker.position.clone().lerp(victim.position, 0.42),
            acilma: () => attacker.position.distanceTo(victim.position),
          }
        : null,
  });

  const ctx2d = canvas2d.getContext("2d");

  let sahneT = 0; // olceklenmis (sahne) saat -- kamera bunu takip ediyor
  for (let i = 0; i < frames; i++) {
    if (elapsed >= PRE_ROLL) sahneT += clock.tick(step);
    // Sarsinti kameradan bagimsiz surulmeli; rig yok
    const shakeOffset = shake.update(step);

    // Pre-roll'da sahne donuk ama kamera akmali: ilk kare olu olmasin.
    camPath(cam, elapsed < PRE_ROLL ? elapsed : PRE_ROLL + sahneT);
    if (shakeOffset) cam.position.add(new THREE.Vector3(shakeOffset.x, shakeOffset.y, shakeOffset.z));

    renderer.render(scene, cam);

    let flash = 0;
    if (flashState) {
      const k = (elapsed - flashState.t0) / (flashState.ms / 1000);
      flash = k >= 1 || k < 0 ? 0 : flashState.strength * (1 - k);
    }

    ctx2d.clearRect(0, 0, w, h);
    ctx2d.drawImage(renderer.domElement, 0, 0, w, h);
    composite(ctx2d, {
      w,
      h,
      flash,
      label: label ? `${NAMES[attackerType]} × ${NAMES[victimType]}` : null,
      // Olculdu (11-08-2026): kanal profilindeki link, video aciklamasindaki
    // linkten daha cok tikliyor - Shorts'ta aciklamayi acmak iki dokunus,
    // avatara basmak bir. Bu yuzden alt satir markayi VE yolu birlikte
    // soyluyor. Ekrandaki yazi YouTube'un link kisitlarina takilmiyor.
    sub: label ? "Kung-Fu Chess 3D  ·  link in profile" : null,
    });

    await post(
      `/__clip/frame?name=${spec}&i=${String(i).padStart(5, "0")}`,
      await toBlob(canvas2d),
      "image/png"
    );

    elapsed += step;
  }

  const wav = await renderEventsToWav(sounds, total + 0.4);
  if (wav) await post(`/__clip/audio?name=${spec}`, wav, "audio/wav");

  await post(
    `/__clip/done?name=${spec}`,
    JSON.stringify({ spec, fps, w, h, frames, duration: total, sounds }),
    "application/json"
  );

  attacker.dispose();
  victim.dispose();
  for (const child of [...scene.children]) if (!keep.has(child)) scene.remove(child);
  return { spec, frames };
}

export async function runRecord({ params, scene, settings, assets }) {
  for (const id of ["hud", "ui", "scene", "flash"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  const w = Number(params.get("w") || 1080);
  const h = Number(params.get("h") || Math.round((w * 16) / 9));
  const fps = Number(params.get("fps") || 30);
  const label = params.get("label") !== "0";
  const spec = params.get("clip") || "qxp";
  // Klipler her zaman tam dovusu gosteriyor -- pazarlama icerigi bu
  // Kliplerde varsayilan SPARTA: kanalin tum degeri son tekmede.
  settings.duel = params.get("duel") || "sparta";
  const specs = spec === "all" ? ALL_SPECS : spec === "yeni" ? YENI_SPECS : [spec];

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  // Golge + tone mapping oyunla BIREBIR ayni yerden (bkz. env.js).
  renderAyarla(renderer);
  // Bu yolda applyTheme calismiyor; IBL'i elle kur, yoksa taslar oyundakinden duz cikar.
  ortamKur(scene, VARSAYILAN_ORTAM.bg, VARSAYILAN_ORTAM.zemin);

  const canvas2d = document.createElement("canvas");
  canvas2d.width = w;
  canvas2d.height = h;

  const log = document.createElement("pre");
  log.style.cssText = "color:#8f8;background:#0b0d10;font:13px monospace;margin:0;padding:16px";
  document.body.style.cssText = "margin:0;background:#0b0d10";
  document.body.appendChild(log);
  const say = (s) => {
    log.textContent += s + "\n";
    console.log("[clip] " + s);
  };

  say(`klip modu: ${specs.join(", ")} @ ${w}x${h} ${fps}fps`);

  try {
    for (const s of specs) {
      const t0 = Date.now();
      const r = await recordOne({ spec: s, scene, assets, settings, renderer, canvas2d, opts: { w, h, fps, label } });
      say(`${s}: ${r.frames} kare, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
    }
    await post("/__clip/finished", JSON.stringify({ specs }), "application/json");
    say("BITTI");
  } catch (err) {
    say("HATA: " + err.message);
    console.error(err);
    await post("/__clip/finished", JSON.stringify({ error: err.message }), "application/json").catch(() => {});
  } finally {
    renderer.dispose();
  }
}
