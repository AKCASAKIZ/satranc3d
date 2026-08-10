import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBoard, createHighlights, squareToWorld } from "./board.js";
import { loadWarriors, PieceSet, attachActorClock } from "./pieces.js";
import { Game } from "./game.js";
import { CameraRig } from "./camera_rig.js";
import { createUI, loadSettings } from "./ui.js";
import { Clock } from "./clock.js";
import { TimeScale, Shake } from "./fx/impact.js";
import { initAudio } from "./fx/audio.js";
import { runFinisher, runQuietMove } from "./finishers.js";
import { runDemo } from "./demo.js";
import { AI } from "./ai.js";

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

function refresh() {
  pieces.sync(game.board);
  const s = game.status();
  statusEl.textContent = s.text;
  statusEl.classList.toggle("over", s.over);
}

/** Sira motordaysa dusundurup hamlesini oynatir. */
async function maybeAiMove() {
  if (busy || game.isOver || humanTurn()) return;

  const mine = generation;
  busy = true;
  selected = null;
  highlights.clear();
  statusEl.textContent = "Rakip dusunuyor...";

  let answer;
  try {
    answer = await ai.think(game.fen, settings.opponent);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Motor hatasi: " + err.message;
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
      await runDemo({ params, scene, settings, assets });
      return;
    }

    // Klip kayit modu -- dikey video kareleri + wav uretir, oyunu kurmaz
    if (params.has("clip")) {
      const { runRecord } = await import("./record.js");
      await runRecord({ params, scene, settings, assets });
      return;
    }

    pieces = new PieceSet(assets);
    scene.add(pieces.group);
    createUI({
      scene,
      rig,
      settings,
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
      generation++;
      game.reset();
      selected = null;
      highlights.clear();
      refresh();
      maybeAiMove();
    });
    loop();
    maybeAiMove();
  } catch (err) {
    statusEl.textContent = "Yukleme hatasi: " + err.message;
    console.error(err);
  }
}

boot();
