import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBoard, createHighlights, squareToWorld } from "./board.js";
import { loadWarriors, PieceSet, attachActorClock, CLIP } from "./pieces.js";
import { Game } from "./game.js";
import { CameraRig } from "./camera_rig.js";
import { createUI, loadSettings, saveSettings } from "./ui.js";
import { createBeam } from "./fx/sky.js";
import { Clock } from "./clock.js";
import { TimeScale, Shake } from "./fx/impact.js";
import { initAudio, play as playSound, sustur, sesiAc } from "./fx/audio.js";
import { runFinisher, runQuietMove } from "./finishers.js";
import { runDemo } from "./demo.js";
import { AI } from "./ai.js";
import {
  portalBaslat, portalVarMi, yuklemeBasladi, yuklemeBitti,
  oyunBasladi, oyunDurdu, keyifAni, reklamIste,
} from "./portal.js";

const canvas = document.getElementById("scene");
const statusEl = document.getElementById("status");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x151719);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 9.5, 10.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2.15;

// Isik: texture yok, bicimi tek yonlu isigin golgesi tasiyor
const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
key.position.set(5, 10, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -7;
key.shadow.camera.right = 7;
key.shadow.camera.top = 7;
key.shadow.camera.bottom = -7;
key.shadow.bias = -0.0008;
scene.add(key);
scene.add(new THREE.DirectionalLight(0x88aaff, 0.5).translateX(-6).translateY(4));
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

const timeScale = new TimeScale();
const clock = new Clock(timeScale);
// Iskelet animasyonlari da oyunun olcekli saatinden beslenmeli, yoksa
// carpma aninda kamera donarken taslar oynamaya devam ediyor.
attachActorClock(clock);
const rig = new CameraRig(camera, controls);
rig.shake = new Shake();
const settings = loadSettings();

scene.add(createBoard());
const highlights = createHighlights();
scene.add(highlights.group);

const game = new Game();
const ai = new AI();
let pieces = null;
let selected = null;
let busy = false;
// Motor dusunurken oyuncunun basladigi yeni oyun eski cevabi oynatmasin
let generation = 0;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const aiPlays = () => settings.opponent !== "insan";
const humanTurn = () => !aiPlays() || game.turn === settings.playerColor;

/* ---------- olcum ---------- *
 *
 *  Sayfa goruntulemesi tek basina bir sey soylemiyor: gelenlerin cogu bakip
 *  cikiyor olabilir. Asil sayi GELEN ile OYNAYAN arasindaki fark - portal
 *  hazirligi da, YouTube hattinin ise yarayip yaramadigi da buradan okunuyor.
 *
 *  Iki olay yetiyor:
 *    ilk-hamle  -> ziyaretci gercekten oynadi (tahtaya dokundu)
 *    oyun-bitti -> partiyi sonuna goturdu
 *  Kisisel hicbir veri gonderilmiyor; GoatCounter zaten cerez kullanmiyor.
 *  Olcum yoksa (reklam engelleyici, kayit modu) sessizce gecilir. */
let ilkHamleBildirildi = false;
function olay(ad) {
  try {
    window.goatcounter?.count?.({ path: ad, title: ad, event: true });
  } catch { /* olcum oyunu asla bozmasin */ }
}

function refresh() {
  pieces.sync(game.board);
  const s = game.status();
  statusEl.textContent = s.text;
  statusEl.classList.toggle("over", s.over);
  if (s.over) sonPerdeAc(s);
}

/* ---------- oyun sonu ve sessiz zorluk uyarlamasi ---------- *
 *
 *  Oyun bitince eskiden SADECE durum yazisi degisiyordu; oyuncunun yeni oyunu
 *  sol ustteki kucuk dugmeden kendisi baslatmasi gerekiyordu. Tutma acisindan
 *  en kritik an tam burasi: yenilen oyuncu bir sey aramak zorunda kalirsa
 *  sekmeyi kapatiyor. Perde matin ardindan gelir, rovans tek tik uzakta.
 *
 *  Ayni anda zorluk SESSIZCE kayiyor. Gosterilmemesi bilincli: "zorluk
 *  dusuruldu" yazisi oyuncuyu asagilar.
 */

/** Motora giden yumusatma. Ilk oyunda bir tik yumusak baslar. */
function etkinBias() {
  return (settings.bias || 0) + (settings.ilkOyun ? 1 : 0);
}

/** Insan-insan oyununda uyarlama yok; kimin "kaybettigi" motorla ilgili degil. */
function sonucuIsle(s) {
  if (!aiPlays()) return null;
  if (!s.winner) return "draw";
  return s.winner === settings.playerColor ? "win" : "loss";
}

function uyarla(sonuc) {
  if (!sonuc || sonuc === "draw") return;
  const kazandi = sonuc === "win";
  // Seri ayni yonde birikir, yon degisince sifirlanip yeniden baslar
  settings.seri = kazandi
    ? Math.max(1, (settings.seri || 0) + 1)
    : Math.min(-1, (settings.seri || 0) - 1);
  // Iki ust uste ayni sonuc -> bir tik kaydir, sonra seriyi sifirla ki
  // ucuncu oyunda tekrar kaydirmasin (kademe kademe, sicramadan)
  if (Math.abs(settings.seri) >= 2) {
    settings.bias = Math.max(-2, Math.min(2, (settings.bias || 0) + (kazandi ? -1 : 1)));
    settings.seri = 0;
  }
  settings.ilkOyun = false;
  saveSettings(settings);
}

/* ---------- mat sahnesi ---------- *
 *
 *  Sah satrancta HIC YENMEZ - mat, o alinmadan once oyunu bitiriyor. Yani
 *  yeme akisindaki oldurus sahnesi burada calismiyor; final ayrica
 *  sahneleniyor: gokten isin iner, kaybeden sah isiga yukselir, KAZANAN
 *  tarafin butun taslari zafer duruguna gecip ziplar.
 *
 *  Kazananin sevinmesi susleme degil tutma araci: oyuncu kazandiginda odul,
 *  kaybettiginde intikam duygusu veriyor - ikisi de rovansa basmaya itiyor.
 */
const MAT_SURESI = 2.6;

function matSahnesi(kazanan) {
  if (!pieces) return 0;
  const kaybeden = kazanan === "w" ? "b" : "w";
  let sah = null;
  const kutlayanlar = [];
  for (const aktor of pieces.group.children) {
    const u = aktor.userData;
    if (!u) continue;
    if (u.type === "k" && u.color === kaybeden) sah = aktor;
    else if (u.color === kazanan) kutlayanlar.push(aktor);
  }
  if (!sah) return 0;

  const nokta = sah.position.clone();
  nokta.y = 0;
  const beam = createBeam(nokta, { life: MAT_SURESI });
  scene.add(beam.mesh);
  playSound("beam", { power: 1 });

  const baslangicY = sah.position.y;
  clock.add((dt) => {
    const bitti = beam.update(dt);
    // Sah isikla birlikte yukseliyor: once agir, sonra hizlanan
    const k = beam.progress;
    sah.position.y = baslangicY + Math.pow(Math.max(0, k - 0.15) / 0.85, 1.7) * 7;
    sah.visible = k < 0.96;
    if (bitti) { scene.remove(beam.mesh); beam.dispose(); return true; }
    return false;
  });

  // Kutlama: hepsi ayni anda ziplarsa mekanik duruyor, kucuk gecikmeler
  // dagitiliyor. Zafer klibi zaten var; ziplama onun ustune biniyor.
  kutlayanlar.forEach((aktor, i) => {
    const gecikme = (i % 8) * 0.06 + Math.floor(i / 8) * 0.04;
    const y0 = aktor.position.y;
    let tt = -gecikme;
    let basladi = false;
    clock.add((dt) => {
      tt += dt;
      if (tt < 0) return false;
      if (!basladi) {
        basladi = true;
        aktor.play?.(CLIP.VICTORY, { loop: false, speed: 1 });
      }
      // Iki kisa zipla: 0,45 sn'de bir
      const z = Math.max(0, Math.sin(tt * 7)) * Math.max(0, 1 - tt / 1.6);
      aktor.position.y = y0 + z * 0.26;
      if (tt > 1.8) { aktor.position.y = y0; aktor.idle?.(0.3); return true; }
      return false;
    });
  });

  return MAT_SURESI;
}

/* Gelistirme kancasi: mat sahnesini tiklamadan tetiklemek icin.
   `import.meta.env.DEV` sayesinde uretim derlemesine GIRMIYOR - Vite bu
   blogu tamamen atiyor. Konsoldan: __mat("w") */
if (import.meta.env?.DEV) {
  window.__mat = (kazanan = "w") => matSahnesi(kazanan);
  window.__sahne = () => scene;
  // Sekme arka plandayken requestAnimationFrame calismiyor; sahneyi
  // gozlemleyebilmek icin saati ELLE ilerletme kancasi.
  window.__adim = (dt = 1 / 60, kere = 60) => {
    for (let i = 0; i < kere; i++) clock.tick(dt);
    renderer.render(scene, camera);
  };
  window.__tani = () => {
    const c = pieces?.group?.children ?? [];
    const sah = c.find((a) => a.userData?.type === "k" && a.userData?.color === "b");
    return {
      tasSayisi: c.length,
      ornekUserData: c[0]?.userData
        ? { type: c[0].userData.type, color: c[0].userData.color } : null,
      siyahSahBulundu: !!sah,
      sahY: sah ? +sah.position.y.toFixed(3) : null,
      sahGorunur: sah ? sah.visible : null,
    };
  };
}

function sonPerdeAc(s) {
  const el = document.getElementById("son");
  if (!el || !el.hidden) return;                 // ayni oyunda iki kez acilmasin
  const sonuc = sonucuIsle(s);
  olay("oyun-bitti-" + (sonuc || "insan"));
  // Portal reklam zamanlamasini buna gore yapiyor: "durdu" demezsek
  // oyuncunun dusundugu anda reklam gosterebiliyor.
  oyunDurdu();
  if (sonuc === "win") keyifAni();
  uyarla(sonuc);
  document.getElementById("sonBaslik").textContent = s.text;
  document.getElementById("sonAlt").textContent =
    sonuc === "win" ? "Well played." : sonuc === "loss" ? "Care for another?" : "";
  // Mat varsa perde sahnenin ARDINDAN gelsin; beraberlikte kisa bekleme yeter
  const bekle = s.winner ? matSahnesi(s.winner) * 1000 + 400 : 900;
  setTimeout(() => { el.hidden = false; }, bekle);
}

/**
 * Rovans. Reklam BURADA gosteriliyor: oyunun tek dogal molasi bu.
 *
 * !! Mac ortasinda reklam YOK. Satrancta dusunme ani oyunun kendisi; onu
 *    kesmek oyuncuyu kaciriyor. Portalin 3 dakika kurali da zaten portal.js
 *    icinde gozetiliyor, erken istek `adCooldown` ile bosa gidiyor.
 */
/**
 * Ipucu: motoru oyuncunun tarafi icin calistirip en iyi hamleyi vurgular.
 *
 * ODULLU REKLAMIN karsiligi bu. Secildi cunku satrancta ipucu oyuncunun
 * zaten istedigi sey; oyunu once kotulestirip sonra reklamla duzelten
 * kaliplardan (hamle geri alma hakki, sure, kilitli tema) farkli olarak
 * kimseyi cezalandirmiyor. Portal yoksa (kendi sitemiz) reklam da yok,
 * ipucu bedava veriliyor - orada gosterilecek reklam zaten mevcut degil.
 *
 * Motor HEP "zor" seviyede sorulur: ipucu, rakibin ayarlanmis zorlugundan
 * bagimsiz olarak gercekten en iyi hamle olmali.
 */
let ipucuSuruyor = false;
async function ipucuVer() {
  if (ipucuSuruyor || busy || game.isOver || !humanTurn()) return;
  ipucuSuruyor = true;
  const dugme = document.getElementById("ipucu");
  dugme.disabled = true;
  const mine = generation;
  try {
    if (portalVarMi()) {
      const izlendi = await reklamIste("rewarded", { sustur, ac: sesiAc });
      // !! Odul YALNIZCA reklam bitince. Hata/atlama durumunda ipucu yok.
      if (!izlendi) return;
    }
    olay("ipucu");
    const cevap = await ai.think(game.fen, "zor", 0);
    if (mine !== generation || !cevap.move) return;
    selected = cevap.move.from;
    highlights.show(cevap.move.from, [{ square: cevap.move.to }]);
  } catch (err) {
    console.warn("ipucu", err);
  } finally {
    ipucuSuruyor = false;
    dugme.disabled = false;
  }
}

let rovansSuruyor = false;
async function yeniOyun() {
  // Reklam oynarken perde kapali ve tahta hala eski oyunu gosteriyor;
  // korumasiz birakilirsa oyuncu tekrar tiklayip ikinci reklam istiyor.
  if (rovansSuruyor) return;
  rovansSuruyor = true;
  try {
    const el = document.getElementById("son");
    if (el) el.hidden = true;
    if (portalVarMi()) {
      // Ses reklam boyunca kismali, yoksa portal oyunu reddediyor
      await reklamIste("midgame", { sustur, ac: sesiAc });
    }
    generation++;
    game.reset();
    selected = null;
    highlights.clear();
    refresh();
    oyunBasladi();
    maybeAiMove();
  } finally {
    rovansSuruyor = false;
  }
}

/** Sira motordaysa dusundurup hamlesini oynatir. */
async function maybeAiMove() {
  if (busy || game.isOver || humanTurn()) return;

  const mine = generation;
  busy = true;
  selected = null;
  highlights.clear();
  statusEl.textContent = "Thinking\u2026";

  let answer;
  try {
    answer = await ai.think(game.fen, settings.opponent, etkinBias());
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Engine error: " + err.message;
    busy = false;
    return;
  }

  busy = false;
  // Sifirlama ya da rakip degisikligi olduysa bu cevap artik gecersiz
  if (mine !== generation) return;
  // Dusunme yazisini animasyon baslamadan kaldir, yoksa oldurus boyunca
  // ekranda "dusunuyor" kaliyor
  statusEl.textContent = game.status().text;
  if (!answer.move) return;
  await playMove(answer.move.from, answer.move.to, answer.move.promotion);
}

/** Terfi secimi: kucuk overlay, secilene kadar bekler. */
function askPromotion() {
  const el = document.getElementById("promo");
  el.hidden = false;
  return new Promise((resolve) => {
    const onClick = (e) => {
      const piece = e.target.dataset.piece;
      if (!piece) return;
      el.hidden = true;
      el.removeEventListener("click", onClick);
      resolve(piece);
    };
    el.addEventListener("click", onClick);
  });
}

/** @param {string} [forced] motorun sectigi terfi -- verilirse soru sorulmaz */
async function playMove(from, to, forced) {
  if (!ilkHamleBildirildi && humanTurn()) {
    ilkHamleBildirildi = true;
    olay("ilk-hamle");
  }
  busy = true;
  highlights.clear();
  selected = null;

  const promotion = !forced && game.needsPromotion(from, to) ? await askPromotion() : forced || "q";
  const attacker = pieces.at(from);
  const result = game.move(from, to, promotion);
  if (!result) {
    busy = false;
    return;
  }

  if (result.capturedSquare) {
    // Oldurus sahnesi: kurban kendi geometrisine parcalanir
    await runFinisher({
      scene,
      attacker,
      victim: pieces.at(result.capturedSquare),
      fromSquare: result.from,
      toSquare: result.to,
      victimSquare: result.capturedSquare,
      rig,
      timeScale,
      settings,
      clock,
    });
  } else {
    const anims = [runQuietMove({ actor: attacker, fromSquare: from, toSquare: to, clock })];
    if (result.rook) {
      const rookActor = pieces.at(result.rook.from);
      if (rookActor) {
        anims.push(
          runQuietMove({
            actor: rookActor,
            fromSquare: result.rook.from,
            toSquare: result.rook.to,
            clock,
          })
        );
      }
    }
    await Promise.all(anims);
  }

  refresh();
  busy = false;
  maybeAiMove();
}

/* ---------- dokunus mu surukleme mi ---------- *
 *
 *  Is eskiden dogrudan `pointerdown`da yapiliyordu. Masaustunde fark
 *  edilmiyordu ama TELEFONDA oyunu oynanmaz kiliyordu: OrbitControls tek
 *  parmakla kamerayi donduruyor, yani tahtayi cevirmek icin yapilan her
 *  surukleme ayni anda tas seciyor, bazen hamle oynatiyordu.
 *
 *  Simdi is `pointerup`ta ve yalnizca parmak/fare KAYMADIYSA yapiliyor.
 *  Fareye de uygulaniyor: masaustunde de tasa basip kamerayi cevirmek
 *  istemeden secim yapiyordu.
 *
 *  Ikinci parmak degdiginde dokunus iptal: cimdikle yakinlastirma bitince
 *  parmaklardan biri kalkiyor ve o kalkis tek basina "dokunus" sayilirdi.
 */
const TAP_KAYMA = 10;          // ekran pikseli; parmak titremesi bunun altinda
let basim = null;

function onPointerDown(event) {
  if (basim) { basim.kaydi = true; return; }   // ikinci parmak: artik dokunus degil
  basim = { id: event.pointerId, x: event.clientX, y: event.clientY, kaydi: false };
}

function onPointerMove(event) {
  if (!basim || event.pointerId !== basim.id || basim.kaydi) return;
  if (Math.hypot(event.clientX - basim.x, event.clientY - basim.y) > TAP_KAYMA) {
    basim.kaydi = true;
  }
}

function onPointerUp(event) {
  if (!basim || event.pointerId !== basim.id) { basim = null; return; }
  const dokunus = !basim.kaydi;
  basim = null;
  if (dokunus) secimYap(event);
}

function onPointerCancel() { basim = null; }

function secimYap(event) {
  if (busy || !humanTurn()) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  // Tas artik cok parcali bir karakter, o yuzden isin alt mesh'e degiyor;
  // hangi tas oldugunu bulmak icin ust aktore cikmak gerekiyor.
  const hitPiece = raycaster.intersectObjects(pieces.group.children, true)[0];
  const hitSquare = raycaster.intersectObjects(scene.getObjectByName("board").children, false)[0];

  // EN YAKIN isabet kazanir. "Once taslar" demek yanlis: bos bir kareye
  // tiklayinca isin kareyi gecip arkadaki uzak bir tasa carpiyor ve oyun
  // oraya tiklanmis saniyordu -- hamle hicbir zaman oynanmiyordu.
  const piece = hitPiece && PieceSet.actorOf(hitPiece.object)?.userData.square;
  const board = hitSquare?.object.userData.square;
  let square = null;
  if (piece && board) square = hitPiece.distance <= hitSquare.distance ? piece : board;
  else square = piece || board || null;
  if (!square) {
    selected = null;
    highlights.clear();
    return;
  }

  if (selected) {
    const targets = game.targetsFrom(selected);
    if (targets.some((t) => t.square === square)) {
      playMove(selected, square);
      return;
    }
  }

  if (game.ownsPiece(square)) {
    selected = square;
    highlights.show(square, game.targetsFrom(square));
  } else {
    selected = null;
    highlights.clear();
  }
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width === w && canvas.height === h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

let lastFrame = performance.now();

function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  resize();
  // clock.tick hem kayitli animasyonlari surer hem olceklenmis dt doner;
  // hit-stop boylece kamerayi da animasyonlari da ayni anda donduruyor.
  const scaled = clock.tick(dt);
  // Rig kamerayi surdugu karelerde OrbitControls devreye girmemeli,
  // yoksa iki taraf ayni pozisyonu cekistirip titreme yapiyor.
  if (!rig.update(scaled)) controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

async function boot() {
  try {
    // Portal once baslatilmali: yukleme sayaci ona da bildirilecek.
    // Portal yoksa hepsi sessizce hicbir sey yapmiyor.
    await portalBaslat();
    yuklemeBasladi();
    // 12 karakter GLB'si ~7 MB; sessiz beklemek yerine sayaci HUD'a yaz
    // Yol VERILMIYOR: pieces.js varsayilani `<BASE_URL>glb` uretiyor. Burada
    // mutlak "/glb" yaziliydi ve alt dizinden servis edilince (GitHub Pages
    // proje sitesi) 12 GLB'nin hepsi 404 veriyordu - olculdu 10-08-2026.
    const assets = await loadWarriors(undefined, (done, total) => {
      statusEl.textContent = `Savascilar yukleniyor ${done}/${total}`;
    });

    // Kare kare dogrulama modu -- normal oyunu hic kurmadan tek kare uretir
    const params = new URLSearchParams(location.search);
    if (params.has("demo")) {
      yuklemeBitti();
      await runDemo({ params, scene, settings, assets });
      return;
    }

    // Klip kayit modu -- dikey video kareleri + wav uretir, oyunu kurmaz
    if (params.has("clip")) {
      const { runRecord } = await import("./record.js");
      yuklemeBitti();
      await runRecord({ params, scene, settings, assets });
      return;
    }

    pieces = new PieceSet(assets);
    scene.add(pieces.group);
    createUI({
      scene,
      rig,
      settings,
      clock,                       // cevre animasyonlari (cim ruzgari) icin
      onOpponentChange: () => {
        // Ayar degistiginde ucusan bir motor cevabi varsa artik gecersiz
        generation++;
        // Taraf degisince kamera da donsun, oyuncu kendi tarafindan baksin
        if (aiPlays()) rig.preset(settings.playerColor === "b" ? "siyah" : "beyaz");
        maybeAiMove();
      },
    });
    rig.preset(aiPlays() && settings.playerColor === "b" ? "siyah" : "beyaz");
    refresh();
    canvas.addEventListener("pointerdown", onPointerDown);
    // move/up PENCEREYE baglaniyor, tuvale degil: parmak tuvalin disina
    // (HUD'un ustune) cikip birakildiginda tuvalin pointerup'i hic gelmiyor
    // ve basim takili kaliyordu - sonraki dokunus da yutuluyordu.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    // Tarayici otoplay kurali: AudioContext ancak kullanici etkilesiminde acilir
    const unlock = () => initAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    document.getElementById("reset").addEventListener("click", () => {
      if (busy) return;
      yeniOyun();
    });
    document.getElementById("ipucu").addEventListener("click", ipucuVer);
    document.getElementById("sonRovans").addEventListener("click", yeniOyun);
    document.getElementById("sonTaraf").addEventListener("click", () => {
      settings.playerColor = settings.playerColor === "w" ? "b" : "w";
      saveSettings(settings);
      rig.preset(aiPlays() && settings.playerColor === "b" ? "siyah" : "beyaz");
      yeniOyun();
    });
    yuklemeBitti();
    oyunBasladi();
    loop();
    maybeAiMove();
  } catch (err) {
    statusEl.textContent = "Yukleme hatasi: " + err.message;
    console.error(err);
  }
}

boot();
