/**
 * Game sarmalayicisinin 3D katmana verdigi bilginin dogrulugunu sinar.
 * Ozellikle kritik olan: en passant'ta yenen tasin karesi hedef kare DEGIL,
 * ve rokta kalenin de tasinmasi gerekiyor.
 *
 *     node tools/test_rules.mjs
 */
import { Game } from "../src/game.js";

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}\n         beklenen: ${e}\n         gelen:    ${a}`);
  }
}

// --- normal yeme -------------------------------------------------------
{
  const g = new Game();
  g.move("e2", "e4");
  g.move("d7", "d5");
  const r = g.move("e4", "d5");
  check("normal yeme: kurban hedef karede", [r.captured, r.capturedSquare, r.capturedColor], ["p", "d5", "b"]);
}

// --- en passant --------------------------------------------------------
{
  const g = new Game();
  g.move("e2", "e4");
  g.move("a7", "a6");
  g.move("e4", "e5");
  g.move("d7", "d5"); // iki kare -> en passant acilir
  const r = g.move("e5", "d6");
  check("en passant: hamle gecerli", !!r, true);
  check("en passant: bayrak", r.isEnPassant, true);
  // Beyaz d6'ya gidiyor ama yedigi piyon d5'te duruyor
  check("en passant: kurban karesi d5 (hedef d6 DEGIL)", r.capturedSquare, "d5");
}

// --- kisa rok ----------------------------------------------------------
{
  const g = new Game();
  for (const [f, t] of [["e2", "e4"], ["e7", "e5"], ["g1", "f3"], ["b8", "c6"], ["f1", "c4"], ["g8", "f6"]]) {
    g.move(f, t);
  }
  const r = g.move("e1", "g1");
  check("kisa rok: sah e1->g1", [r.from, r.to], ["e1", "g1"]);
  check("kisa rok: kale h1->f1", r.rook, { from: "h1", to: "f1" });
}

// --- uzun rok ----------------------------------------------------------
{
  const g = new Game();
  for (const [f, t] of [["d2", "d4"], ["d7", "d5"], ["b1", "c3"], ["b8", "c6"], ["c1", "f4"], ["c8", "f5"], ["d1", "d2"], ["d8", "d7"]]) {
    g.move(f, t);
  }
  const r = g.move("e1", "c1");
  check("uzun rok: kale a1->d1", r.rook, { from: "a1", to: "d1" });
}

// --- terfi -------------------------------------------------------------
{
  const g = new Game();
  for (const [f, t] of [["a2", "a4"], ["b7", "b5"], ["a4", "b5"], ["h7", "h6"], ["b5", "b6"], ["h6", "h5"], ["b6", "a7"], ["h5", "h4"]]) {
    g.move(f, t);
  }
  check("terfi: a7->b8 terfi gerektiriyor", g.needsPromotion("a7", "b8"), true);
  const r = g.move("a7", "b8", "q");
  check("terfi: vezire cikti ve at yendi", [r.promotion, r.captured], ["q", "n"]);
}

// --- mat ---------------------------------------------------------------
{
  const g = new Game();
  g.move("f2", "f3");
  g.move("e7", "e5");
  g.move("g2", "g4");
  g.move("d8", "h4"); // aptal mat
  const s = g.status();
  check("mat: oyun bitti", s.over, true);
  check("mat: metin", s.text, "Black wins by checkmate");
  // Oyun sonu uyarlamasi bu ALANI okuyor, metni degil. Metin degisirse test
  // ustteki satirda patlar; `winner` bozulursa zorluk uyarlamasi SESSIZCE
  // yanlis yone kayar - o yuzden ayrica olculuyor.
  check("mat: kazanan alani", s.winner, "b");
  check("beraberlikte kazanan yok", new Game().status().winner, undefined);
}

// --- gecersiz hamle ----------------------------------------------------
{
  const g = new Game();
  check("gecersiz hamle null doner", g.move("e2", "e5"), null);
}

// --- hedef listesi -----------------------------------------------------
{
  const g = new Game();
  g.move("e2", "e4");
  g.move("d7", "d5");
  const targets = g.targetsFrom("e4");
  check("hedefler: e4 piyonu e5 ve d5(yeme)",
    targets.sort((a, b) => a.square.localeCompare(b.square)),
    [{ square: "d5", capture: true, promotion: false }, { square: "e5", capture: false, promotion: false }]);
}

console.log(`\n${pass} gecti, ${fail} kaldi`);
process.exit(fail ? 1 : 0);
