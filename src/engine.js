import { Chess } from "chess.js";

/**
 * Alpha-beta arama motoru.
 *
 * Kural mantigi tamamen chess.js'te kaliyor -- kendi tahta temsilimi yazmak
 * kural hatasi riski demek, o da oyunun tamamini bozar. Ama chess.js'in ACIK
 * API'si arama icin cok pahali: moves({verbose:true}) her cagrida SAN uretiyor
 * ve tek basina ~500us suruyor (~2000 dugum/sn, yani derinlik 4 bile zor).
 * Bu yuzden arama sicak yolunda dahili API kullaniliyor:
 *
 *   _moves({legal:true})  25x hizli (SAN uretmiyor)
 *   _makeMove/_undoMove  100x hizli (gecmis/SAN defteri tutmuyor)
 *   _board               0x88 dizisi, degerlendirmede sifir tahsisat
 *   _hash                artimli Zobrist -- bedava transpozisyon anahtari
 *
 * Bunlar chess.js'in ozel alanlari; surum sabitlenmis (package.json'da tam
 * surum) ve assertInternals() acilista dogruluyor. Disari acilan hamle yine
 * from/to karesi olarak veriliyor, oyun onu normal chess.js move()'uyla oynuyor.
 *
 * Butun skorlar SANTIPIYON ve sirasi gelen tarafa gore (negamax).
 */

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100000;

// chess.js dahili bayrak bitleri
const BIT_CAPTURE = 2;
const BIT_EP = 8;
const BIT_PROMOTION = 16;
const BIT_NOISY = BIT_CAPTURE | BIT_EP | BIT_PROMOTION;

const FILES = "abcdefgh";
/** 0x88 indeksinden cebirsel kare adina. */
const toSquare = (i) => FILES[i & 7] + (8 - (i >> 4));

// Kare-deger tablolari beyazin bakisiyla, a8'den h1'e.
// prettier-ignore
const PST = {
  p: [
      0,  0,  0,  0,  0,  0,  0,  0,
     50, 50, 50, 50, 50, 50, 50, 50,
     10, 10, 20, 30, 30, 20, 10, 10,
      5,  5, 10, 25, 25, 10,  5,  5,
      0,  0,  0, 20, 20,  0,  0,  0,
      5, -5,-10,  0,  0,-10, -5,  5,
      5, 10, 10,-20,-20, 10, 10,  5,
      0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  // Sah: acilis/orta oyun tablosu -- kosede kal, rok at
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
  // Oyun sonunda tam tersi: sah merkeze yurumeli
  kEnd: [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50,
  ],
};

/** Kullandigimiz chess.js ic yapilarinin hala yerinde oldugunu dogrular. */
export function assertInternals() {
  const c = new Chess();
  const problems = [];
  if (typeof c._moves !== "function") problems.push("_moves");
  if (typeof c._makeMove !== "function") problems.push("_makeMove");
  if (typeof c._undoMove !== "function") problems.push("_undoMove");
  if (!Array.isArray(c._board) || c._board.length !== 128) problems.push("_board");
  if (typeof c._hash !== "bigint") problems.push("_hash");
  if (problems.length) {
    throw new Error("chess.js ic API degismis: " + problems.join(", "));
  }
  // Acilis pozisyonunda 20 yasal hamle -- bayrak/uretim dogru mu
  if (c._moves({ legal: true }).length !== 20) throw new Error("chess.js _moves beklenmedik sonuc");
  return true;
}

export class Engine {
  constructor() {
    assertInternals();
    this.chess = new Chess();
    this.nodes = 0;
    this.deadline = 0;
    this.aborted = false;
    this.killers = [];
    /** @type {Map<bigint, {depth:number, score:number, flag:number, move:object|null}>} */
    this.tt = new Map();
    /** Arama yolundaki pozisyon tekrarlari: hash -> sayi */
    this.path = new Map();
  }

  /** Sirasi gelen tarafa gore materyal + kare-deger skoru. */
  evaluate() {
    const board = this.chess._board;

    // Once faz: agir tas kalmadiysa sah tablosu degisiyor
    let phase = 0;
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      const p = board[i];
      if (!p) continue;
      const t = p.type;
      if (t === "q") phase += 4;
      else if (t === "r") phase += 2;
      else if (t === "b" || t === "n") phase += 1;
    }
    const endgame = phase <= 6;

    let score = 0; // beyaz lehine
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      const p = board[i];
      if (!p) continue;
      const rank = i >> 4;
      const file = i & 7;
      const white = p.color === "w";
      const table = p.type === "k" && endgame ? PST.kEnd : PST[p.type];
      const idx = white ? (rank << 3) | file : ((7 - rank) << 3) | file;
      const v = VALUE[p.type] + table[idx];
      score += white ? v : -v;
    }

    return this.chess._turn === "w" ? score : -score;
  }

  /** MVV-LVA + oldurucu hamle siralamasi. */
  scoreMove(move, ttMove, ply) {
    if (ttMove && move.from === ttMove.from && move.to === ttMove.to && move.promotion === ttMove.promotion) {
      return 1_000_000;
    }
    if (move.captured) return 100_000 + VALUE[move.captured] * 10 - VALUE[move.piece];
    if (move.promotion) return 90_000 + VALUE[move.promotion];
    const k = this.killers[ply];
    if (k) {
      const key = (move.from << 8) | move.to;
      if (k[0] === key || k[1] === key) return 80_000;
    }
    return 0;
  }

  /** Arama yolunda tekrar ya da 50 hamle kurali. */
  isDrawn() {
    if (this.chess._halfMoves >= 100) return true;
    return (this.path.get(this.chess._hash) ?? 0) >= 2;
  }

  make(move) {
    this.chess._makeMove(move);
    const h = this.chess._hash;
    this.path.set(h, (this.path.get(h) ?? 0) + 1);
  }

  unmake() {
    const h = this.chess._hash;
    const n = this.path.get(h);
    if (n <= 1) this.path.delete(h);
    else this.path.set(h, n - 1);
    this.chess._undoMove();
  }

  /**
   * @param {string} fen
   * @param {{ maxDepth?: number, timeMs?: number }} opts
   * @returns {{ move: object|null, score: number, depth: number, nodes: number, moves: object[] }}
   */
  search(fen, { maxDepth = 64, timeMs = 1000 } = {}) {
    this.chess.load(fen);
    this.nodes = 0;
    this.aborted = false;
    const start = Date.now();
    this.deadline = start + timeMs;
    this.killers = [];
    this.tt.clear();
    this.path.clear();
    this.path.set(this.chess._hash, 1);

    const legal = this.chess._moves({ legal: true });
    if (legal.length === 0) return { move: null, score: 0, depth: 0, nodes: 0, moves: [] };

    let best = legal[0];
    let bestScore = 0;
    let reached = 0;
    // Kok hamle skorlari: "kolay" seviye buradan zayif hamle secebilsin
    let rootScores = legal.map((move) => ({ move, score: 0 }));

    for (let depth = 1; depth <= maxDepth; depth++) {
      // Yeni bir derinlik butcenin yarisindan fazlasini yiyecekse baslama;
      // yarim kalan iterasyon zaten atiliyor, sadece gecikme uretiyor.
      if (depth > 1 && Date.now() - start > timeMs * 0.45) break;

      const scores = [];
      let localBest = null;
      let alpha = -MATE;

      const ordered = [...legal].sort(
        (a, b) => this.scoreMove(b, best, 0) - this.scoreMove(a, best, 0)
      );

      for (const move of ordered) {
        this.make(move);
        const score = -this.negamax(depth - 1, -MATE, -alpha, 1);
        this.unmake();

        if (this.aborted) break;
        scores.push({ move, score });
        if (localBest === null || score > alpha) {
          alpha = score;
          localBest = move;
        }
      }

      if (this.aborted) break;

      best = localBest ?? best;
      bestScore = alpha;
      rootScores = scores.sort((a, b) => b.score - a.score);
      reached = depth;

      // Mat bulunduysa daha derine inmenin anlami yok
      if (Math.abs(bestScore) > MATE - 100) break;
    }

    return { move: best, score: bestScore, depth: reached, nodes: this.nodes, moves: rootScores };
  }

  negamax(depth, alpha, beta, ply) {
    // Saati her dugumde okumak pahali; 2048 dugumde bir bakmak yeterli
    if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) {
      this.aborted = true;
      return 0;
    }
    this.nodes++;

    if (this.isDrawn()) return 0;

    const hash = this.chess._hash;
    const alphaOrig = alpha;
    const hit = this.tt.get(hash);
    if (hit && hit.depth >= depth) {
      if (hit.flag === 0) return hit.score;
      if (hit.flag === 1 && hit.score > alpha) alpha = hit.score;
      if (hit.flag === 2 && hit.score < beta) beta = hit.score;
      if (alpha >= beta) return hit.score;
    }

    // Sahtayken derinligi uzat -- yoksa motor kacisi "gormeden" arama biter
    const inCheck = this.chess.isCheck();
    if (inCheck) depth++;

    if (depth <= 0) return this.quiesce(alpha, beta, ply);

    const moves = this.chess._moves({ legal: true });
    if (moves.length === 0) return inCheck ? -MATE + ply : 0;

    const ttMove = hit?.move;
    moves.sort((a, b) => this.scoreMove(b, ttMove, ply) - this.scoreMove(a, ttMove, ply));

    let bestScore = -MATE;
    let bestMove = null;

    for (const move of moves) {
      this.make(move);
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      this.unmake();

      if (this.aborted) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        // Yeme olmayan bir hamle budama yaptiysa kardes dugumlerde de once dene
        if (!move.captured) {
          const k = (this.killers[ply] ??= [0, 0]);
          const key = (move.from << 8) | move.to;
          if (k[0] !== key) {
            k[1] = k[0];
            k[0] = key;
          }
        }
        break;
      }
    }

    const flag = bestScore <= alphaOrig ? 2 : bestScore >= beta ? 1 : 0;
    this.tt.set(hash, { depth, score: bestScore, flag, move: bestMove });
    return bestScore;
  }

  /**
   * Sessizlik aramasi: yalnizca yeme ve terfileri surdurur. Bu olmadan motor
   * "vezirle yedim" deyip duruyor, karsiligin bir sonraki katta geldigini
   * gormuyor -- klasik ufuk etkisi.
   */
  quiesce(alpha, beta, ply) {
    if ((this.nodes & 2047) === 0 && Date.now() > this.deadline) {
      this.aborted = true;
      return 0;
    }
    this.nodes++;

    const stand = this.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;

    const noisy = this.chess._moves({ legal: true }).filter((m) => m.flags & BIT_NOISY);
    noisy.sort((a, b) => this.scoreMove(b, null, ply) - this.scoreMove(a, null, ply));

    for (const move of noisy) {
      // Umutsuz yemeler: alinan tas farki aciyi kapatamiyorsa hic dallanma
      if (stand + VALUE[move.captured ?? "p"] + 200 < alpha) continue;

      this.make(move);
      const score = -this.quiesce(-beta, -alpha, ply + 1);
      this.unmake();

      if (this.aborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }
}

/** Dahili hamleyi disari acilan sade bicime cevirir. */
export function toPublicMove(move) {
  if (!move) return null;
  return {
    from: toSquare(move.from),
    to: toSquare(move.to),
    promotion: move.promotion ?? "q",
  };
}

/** Seviye ayarlari: sure/derinlik butcesi + kasitli hata payi. */
export const LEVELS = {
  kolay: { timeMs: 300, maxDepth: 2, slack: 220, label: "Kolay" },
  orta: { timeMs: 900, maxDepth: 5, slack: 45, label: "Orta" },
  zor: { timeMs: 2500, maxDepth: 12, slack: 0, label: "Zor" },
};

/**
 * Oyuncunun secimini SESSIZCE kaydiran ayar.
 *
 * Neden slack'i kaydiriyoruz da derinligi degil: derinligi kismak motoru
 * ZAYIF degil TUHAF oynatiyor -- insan "bu ne sacma hamle" der ve yenilgi
 * adil hissettirmez. slack ise "en iyi hamleden N santipiyon geride kalanlar
 * da kur'aya girsin" demek; motor insanin YAKALAYABILECEGI hatalar yapiyor.
 *
 * bias: -2..+2 arasi tamsayi. Artarsa motor yumusar (slack buyur), azalirsa
 * sertlesir. Ust sinir 260: ustunde hamleler rastgeleye donup yine tuhaflasiyor.
 */
export function levelWithBias(level, bias = 0) {
  const cfg = LEVELS[level] ?? LEVELS.orta;
  if (!bias) return cfg;
  const adim = 55;
  const slack = Math.max(0, Math.min(260, cfg.slack + bias * adim));
  // Cok yumusarken derin aramanin anlami kalmiyor; sureyi de kis, mobil rahatlasin
  const timeMs = bias > 0 ? Math.max(250, cfg.timeMs - bias * 200) : cfg.timeMs;
  return { ...cfg, slack, timeMs };
}

/**
 * Seviyeye gore hamle secer. "slack" santipiyon: en iyi hamleden bu kadar
 * geride kalan hamleler de kur'aya girer. Boylece kolay seviye rastgele
 * sacmalamadan -- ama insanin yakalayabilecegi hatalar yaparak -- oynuyor.
 */
export function pickMove(result, slack) {
  if (!result.move) return null;
  if (!slack || result.moves.length <= 1) return result.move;

  const best = result.moves[0].score;
  // Kazanan ya da kaybettiren pozisyonda hep en iyisi -- mat kacirtmayalim
  if (Math.abs(best) > MATE - 100) return result.moves[0].move;

  const pool = result.moves.filter((m) => best - m.score <= slack);
  return pool[Math.floor(Math.random() * pool.length)].move;
}
