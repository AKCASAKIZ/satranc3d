import { Chess } from "chess.js";
import { Engine, LEVELS, pickMove, toPublicMove, assertInternals } from "../src/engine.js";

let fails = 0;
const ok = (cond, msg) => {
  console.log((cond ? "  ok   " : "  FAIL ") + msg);
  if (!cond) fails++;
};

/** Motorun sectigi hamlenin SAN karsiligi -- dahili hamlede SAN yok. */
const san = (fen, move) => {
  if (!move) return null;
  const c = new Chess(fen);
  try {
    return c.move(toPublicMove(move)).san;
  } catch {
    return "GECERSIZ";
  }
};

ok(assertInternals(), "chess.js ic API bekledigimiz gibi");

const engine = new Engine();

// 1) Arka sira mati -- tek hamlede gormeli
{
  const fen = "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1";
  const r = engine.search(fen, { timeMs: 1500, maxDepth: 6 });
  ok(san(fen, r.move) === "Ra8#", `mat bir hamlede: ${san(fen, r.move)} (d${r.depth})`);
}

// 2) Bedava veziri almali
{
  const fen = "4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1";
  const r = engine.search(fen, { timeMs: 800, maxDepth: 4 });
  ok(san(fen, r.move) === "Bxd5", `bedava veziri alir: ${san(fen, r.move)}`);
}

// 3) Ufuk etkisi: korunan piyonu vezirle yememeli (quiesce calisiyor mu)
{
  const fen = "4k3/1p6/p7/8/8/8/3Q4/4K3 w - - 0 1";
  ok(!new Chess(fen).isCheck(), "test pozisyonu kural disi degil");
  const r = engine.search(fen, { timeMs: 1000, maxDepth: 4 });
  ok(san(fen, r.move) !== "Qxa6", `korunan piyona vezirle girmez: ${san(fen, r.move)}`);
}

// 4) Mat pozisyonunda hamle dondurmemeli (aptal mati)
{
  const mateFen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  ok(new Chess(mateFen).isCheckmate(), "test pozisyonu gercekten mat");
  ok(engine.search(mateFen, { timeMs: 100 }).move === null, "mat pozisyonunda null doner");
  ok(engine.search(new Chess().fen(), { timeMs: 100 }).move !== null, "acilista hamle var");
}

// 5) Terfi hamlesi disari dogru cikiyor mu
{
  const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
  const r = engine.search(fen, { timeMs: 500, maxDepth: 4 });
  const pub = toPublicMove(r.move);
  ok(pub.from === "a7" && pub.to === "a8" && pub.promotion === "q", `terfi: ${JSON.stringify(pub)}`);
}

// 6) Sure butcesine uymali
{
  const t0 = Date.now();
  engine.search(new Chess().fen(), { timeMs: 600, maxDepth: 64 });
  const el = Date.now() - t0;
  ok(el < 1500, `sure butcesi tutuyor: ${el}ms (butce 600)`);
}

// 7) Her seviye acilista yasal hamle uretir + hiz raporu
for (const [name, cfg] of Object.entries(LEVELS)) {
  const fen = new Chess().fen();
  const t0 = Date.now();
  const r = engine.search(fen, { timeMs: cfg.timeMs, maxDepth: cfg.maxDepth });
  const move = pickMove(r, cfg.slack);
  const el = Date.now() - t0;
  const nps = Math.round(r.nodes / Math.max(el, 1)) * 1000;
  ok(san(fen, move) !== "GECERSIZ", `${name}: ${san(fen, move)} d${r.depth} ${r.nodes}n ${el}ms ~${nps}nps`);
}

// 8) Kendi kendine tam oyun -- hicbir asamada cokmemeli, hamleler yasal olmali
{
  const chess = new Chess();
  let plies = 0;
  let bad = null;
  while (!chess.isGameOver() && plies < 80) {
    const r = engine.search(chess.fen(), { timeMs: 100, maxDepth: 4 });
    if (!r.move) break;
    try {
      chess.move(toPublicMove(r.move));
    } catch (e) {
      bad = `${plies}. yari hamlede gecersiz: ${JSON.stringify(toPublicMove(r.move))}`;
      break;
    }
    plies++;
  }
  ok(!bad, bad ?? `kendi kendine ${plies} yari hamle oynadi (${chess.isGameOver() ? "oyun bitti" : "surerken kesildi"})`);
}

// 9) Motor kendisine karsi: zor, kolayi yenmeli (tek parti, kaba gosterge)
{
  const chess = new Chess();
  let plies = 0;
  while (!chess.isGameOver() && plies < 120) {
    const level = chess.turn() === "w" ? LEVELS.zor : LEVELS.kolay;
    const r = engine.search(chess.fen(), { timeMs: 250, maxDepth: level.maxDepth });
    const m = pickMove(r, level.slack);
    if (!m) break;
    chess.move(toPublicMove(m));
    plies++;
  }
  // Materyal farkina bak: beyaz (zor) onde olmali
  const mat = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let diff = 0;
  for (const row of chess.board())
    for (const sq of row) if (sq) diff += sq.color === "w" ? mat[sq.type] : -mat[sq.type];
  ok(diff >= 0, `zor vs kolay ${plies} yari hamle sonunda materyal farki: ${diff > 0 ? "+" : ""}${diff}`);
}

/* 10) Zorunlu mati gorme.
   Beklenen sonuc EZBERDEN yazilmiyor: her pozisyonun gercekten zorunlu mat
   oldugu asagidaki kaba kuvvet cozucuyle burada dogrulaniyor, motordan da
   mat skoru dondurmesi isteniyor. Ilk denemede suit elle yazilmisti ve
   FEN'lerin ucu de hataliydi (biri kural disi) -- beklenen cevabi
   dogrulamayan test, testi degil ezberi olcer. */
{
  /** Sira `maximizing` tarafta; `ply` yarim hamlede zorunlu mat var mi? */
  const matVar = (c, ply, maximizing) => {
    if (c.isCheckmate()) return !maximizing;
    if (c.isGameOver() || ply === 0) return false;
    const moves = c.moves();
    if (maximizing) {
      for (const m of moves) {
        c.move(m);
        const r = matVar(c, ply - 1, false);
        c.undo();
        if (r) return true;
      }
      return false;
    }
    for (const m of moves) {
      c.move(m);
      const r = matVar(c, ply - 1, true);
      c.undo();
      if (!r) return false;
    }
    return true;
  };

  const suit = [
    ["7k/8/5K2/8/8/8/8/6Q1 w - - 0 1", "vezirle mat"],
    ["7k/8/8/8/8/8/R7/1R5K w - - 0 1", "iki kaleyle merdiven"],
    ["6k1/5ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1", "arka sira"],
  ];
  for (const [fen, ad] of suit) {
    ok(matVar(new Chess(fen), 3, true), `mat/${ad}: pozisyonda gercekten zorunlu mat var`);
    const r = engine.search(fen, { timeMs: 800, maxDepth: LEVELS.zor.maxDepth });
    ok(r.score > 90000, `mat/${ad}: motor mati goruyor (${san(fen, r.move)}, skor ${r.score}, d${r.depth})`);
  }
}

/* 11) Derinlik tabani -- "zorlastirdik" iddiasinin olculen karsiligi.
   16-08-2026'da LMR+PVS oncesi ayni butcelerde: orta d5, zor d6.
   Bu esikler duserse arama ya da degerlendirme geriye gitmis demektir. */
{
  // Olcum ACILIS pozisyonunda yapildi (bkz. 7. testin ciktisi); baska bir
  // FEN'de dallanma farkli ve esikler anlamini kaybeder.
  const fen = new Chess().fen();
  for (const [ad, taban] of [["orta", 6], ["zor", 7]]) {
    const cfg = LEVELS[ad];
    const r = engine.search(fen, { timeMs: cfg.timeMs, maxDepth: cfg.maxDepth });
    ok(r.depth >= taban, `${ad} derinlik tabani: d${r.depth} (>= d${taban})`);
  }
}

console.log(fails ? `\n${fails} test basarisiz` : "\nhepsi gecti");
process.exit(fails ? 1 : 0);
