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

/** Gecer piyon bonusu, ilerlemeye gore (0 = kendi ilk sirasi, 6 = terfiye bir adim). */
const GECER = [0, 8, 14, 26, 46, 78, 120, 0];

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

    /* evaluate()'in calisma tamponlari. Fonksiyonun ICINDE ayrilirlarsa
       her dugumde dort tipli dizi + iki nesne dogar; olculdu (16-08-2026):
       yapisal terimler eklendikten sonra hiz 88k'dan 48k dugum/sn'ye
       dusmustu, tamponlar disari alininca geri geldi. Motor tek is
       parcaciginda ve evaluate ozyinelemeli DEGIL -- paylasim guvenli. */
    this._wPawn = new Int8Array(8);
    this._bPawn = new Int8Array(8);
    this._wIleri = new Int8Array(8);
    this._bIleri = new Int8Array(8);
    this._kaleKare = new Int8Array(16); // hat
    this._kaleBeyaz = new Uint8Array(16);
  }

  /** Sirasi gelen tarafa gore materyal + kare-deger + yapisal skor. */
  evaluate() {
    const board = this.chess._board;

    // Tek gecis: faz, materyal+PST, piyon iskeleti ve kale/fil sayimi.
    // Ayri gecisler yazilmadi -- evaluate arama sicak yolunun kendisi.
    let phase = 0;
    let score = 0; // beyaz lehine
    let filW = 0;
    let filB = 0;
    // Her hat icin piyon sayisi ve en ileri piyonun sirasi (tamponlar: ctor)
    const wPawn = this._wPawn.fill(0);
    const bPawn = this._bPawn.fill(0);
    const wEnIleri = this._wIleri.fill(8); // beyaz icin kucuk rank = ileri
    const bEnIleri = this._bIleri.fill(-1);
    const kaleHat = this._kaleKare;
    const kaleBeyaz = this._kaleBeyaz;
    let kaleN = 0;
    // Sahlar: en fazla iki tane, dizi yerine dort degisken
    let wKingIdx = -1;
    let bKingIdx = -1;

    for (let i = 0; i < 128; i++) {
      if (i & 0x88) continue;
      const p = board[i];
      if (!p) continue;
      const t = p.type;
      const rank = i >> 4;
      const file = i & 7;
      const white = p.color === "w";

      if (t === "q") phase += 4;
      else if (t === "r") phase += 2;
      else if (t === "b" || t === "n") phase += 1;
      if (t === "b") white ? filW++ : filB++;
      if (t === "r" && kaleN < 16) {
        kaleHat[kaleN] = file;
        kaleBeyaz[kaleN++] = white ? 1 : 0;
      }
      if (t === "p") {
        if (white) {
          wPawn[file]++;
          if (rank < wEnIleri[file]) wEnIleri[file] = rank;
        } else {
          bPawn[file]++;
          if (rank > bEnIleri[file]) bEnIleri[file] = rank;
        }
      }

      /* Sahlar bu donguden HARIC: hangi tablonun kullanilacagi faz'a bagli,
         faz ise ayni dongude birikiyor. Sah e1/e8'de, yani dongunun basinda
         ve sonunda taraniyor -- ikisi de eksik faz gorurdu. Iki sah dongu
         bitince ayrica puanlaniyor. */
      if (t === "k") {
        if (white) wKingIdx = (rank << 3) | file;
        else bKingIdx = ((7 - rank) << 3) | file;
        continue;
      }

      const idx = white ? (rank << 3) | file : ((7 - rank) << 3) | file;
      const v = VALUE[t] + PST[t][idx];
      score += white ? v : -v;
    }
    const endgame = phase <= 6;
    const kTable = endgame ? PST.kEnd : PST.k;
    if (wKingIdx >= 0) score += kTable[wKingIdx];
    if (bKingIdx >= 0) score -= kTable[bKingIdx];

    // --- fil cifti ---------------------------------------------------
    // Iki fil birbirinin kor karesini kapatiyor; acik pozisyonda yarim
    // piyon degerinde. PST tek basina bunu hic gormuyordu.
    if (filW >= 2) score += 32;
    if (filB >= 2) score -= 32;

    // --- piyon yapisi ------------------------------------------------
    // Motor eskiden piyonu piyondan ayirt etmiyordu: ikiz piyon da gecer
    // piyon da 100 santipiyondu. En pahali insan hatasi burada goruluyor.
    for (let f = 0; f < 8; f++) {
      if (wPawn[f] > 1) score -= 14 * (wPawn[f] - 1); // ikiz
      if (bPawn[f] > 1) score += 14 * (bPawn[f] - 1);
      const wKomsu = (f > 0 ? wPawn[f - 1] : 0) + (f < 7 ? wPawn[f + 1] : 0);
      const bKomsu = (f > 0 ? bPawn[f - 1] : 0) + (f < 7 ? bPawn[f + 1] : 0);
      if (wPawn[f] && !wKomsu) score -= 16; // tecrit
      if (bPawn[f] && !bKomsu) score += 16;

      // Gecer piyon: onunde ve yan hatlarda dusman piyonu yok.
      if (wPawn[f]) {
        const r = wEnIleri[f];
        let engel = false;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) {
          if (bPawn[g] && bEnIleri[g] < r) engel = true;
        }
        if (!engel) score += GECER[7 - r]; // 7-r = ilerleme (0..7)
      }
      if (bPawn[f]) {
        const r = bEnIleri[f];
        let engel = false;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) {
          if (wPawn[g] && wEnIleri[g] > r) engel = true;
        }
        if (!engel) score -= GECER[r];
      }
    }

    // --- kale hatlari ------------------------------------------------
    for (let i = 0; i < kaleN; i++) {
      const beyaz = kaleBeyaz[i] === 1;
      const f = kaleHat[i];
      const kendi = beyaz ? wPawn[f] : bPawn[f];
      if (kendi !== 0) continue;
      const karsi = beyaz ? bPawn[f] : wPawn[f];
      const bonus = karsi === 0 ? 22 : 11;
      score += beyaz ? bonus : -bonus;
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
      /* Yeni bir derinlik butcenin bu kadarini yemisken baslamasin; yarim
         kalan iterasyon zaten atiliyor, sadece gecikme uretiyor.
         0.45 idi -> 0.55: LMR'den sonra iterasyonlar arasi carpan kucuduldu
         (siralamasi iyi bir agacta ~3-4x), 0.45'te butcenin ucte biri bos
         geciyordu. Olculdu: "usta" 4500 ms butcede 3200 ms'de duruyordu. */
      if (depth > 1 && Date.now() - start > timeMs * 0.55) break;

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
    let sira = 0;

    for (const move of moves) {
      const sessiz = !move.captured && !move.promotion;
      this.make(move);

      /* --- gec hamle indirimi (LMR) + baş varyant araması (PVS) ---
         Zorluk isteginin asil cevabi burasi. Sureyi uzatmak oyunu
         yavaslatiyor, derinlik ise oyunu SERTLESTIRIYOR: iyi siralanmis bir
         listede 4. hamleden sonrasi neredeyse hep kotudur, onlari kisa
         arayip yalniz alpha'yi asani tam derinlikte tekrar aramak ayni
         sanyede birkac kat cok dugum demek.

         Guvenlik supabi: sah cekilen ya da sah altindaki dallar HIC
         indirilmiyor -- mat agi tam oralarda ve yanlis budama motoru
         zayif degil TUHAF oynatiyor. */
      const sahVeriyor = this.chess.isCheck();
      let indirim = 0;
      if (depth >= 3 && sira >= 3 && sessiz && !inCheck && !sahVeriyor) {
        indirim = sira >= 6 ? 2 : 1;
        if (indirim >= depth) indirim = depth - 1;
      }

      let score;
      if (sira === 0) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      } else {
        // Once dar pencere: "alpha'yi asiyor mu?" sorusunun ucuz hali
        score = -this.negamax(depth - 1 - indirim, -alpha - 1, -alpha, ply + 1);
        // Indirimli arama yine de asti -> indirim yanlisti, tam derinlikte tekrar
        if (score > alpha && indirim) {
          score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1);
        }
        // Gercekten pencerenin icine dustu -> tam pencereyle kesin deger
        if (score > alpha && score < beta) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        }
      }
      this.unmake();
      sira++;

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
/* Butceler 16-08-2026'da yukseltildi: test eden oyuncular "kolay" dedi.
   Olculen sebep tekti -- ustteki iki seviye derinlik tavanina carpiyordu,
   sureye degil. "Orta" 5 kat, "Zor" 12 kat ile arama biterken elinde
   zaman kaliyordu; LMR+PVS'ten sonra ayni sanyede cok daha derine
   iniyor, o yuzden tavanlar acildi.

   `sabit: true` = sessiz uyarlama bu seviyeye DOKUNMAZ. Oyuncu en ustu
   bilerek seciyor; kaybedince motorun arkasindan yumusamasi o secimi
   anlamsiz kilardi. */
export const LEVELS = {
  kolay: { timeMs: 300, maxDepth: 2, slack: 220, label: "Kolay" },
  orta: { timeMs: 1000, maxDepth: 8, slack: 40, label: "Orta" },
  zor: { timeMs: 2800, maxDepth: 18, slack: 0, sabit: true, label: "Zor" },
  // Usta: tavan yok, sure telefonda da kabul edilebilir olsun diye 4,5 sn.
  // Bunun uzerine cikmak oyunu bekleme odasina cevirir.
  usta: { timeMs: 4500, maxDepth: 64, slack: 0, sabit: true, label: "Usta" },
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
  // Zor/Usta uyarlanmaz: bkz. LEVELS'teki `sabit` notu
  if (!bias || cfg.sabit) return cfg;
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
