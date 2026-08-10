import { Chess } from "chess.js";

/**
 * chess.js sarmalayicisi. Kural mantigi tamamen chess.js'te kaliyor --
 * rok, en passant, terfi, sah, mat, pat, 50 hamle, tekrar hepsi hazir.
 * Burasi sadece 3D katmanin ihtiyaci olan seyi disari veriyor.
 */
export class Game {
  constructor() {
    this.chess = new Chess();
  }

  get board() {
    return this.chess.board();
  }

  get turn() {
    return this.chess.turn();
  }

  get fen() {
    return this.chess.fen();
  }

  get isOver() {
    return this.chess.isGameOver();
  }

  /** Bir kareden oynanabilecek hamleler; 3D vurgu icin sadelestirilmis. */
  targetsFrom(square) {
    return this.chess.moves({ square, verbose: true }).map((m) => ({
      square: m.to,
      capture: m.flags.includes("c") || m.flags.includes("e"),
      promotion: m.flags.includes("p"),
    }));
  }

  ownsPiece(square) {
    const piece = this.chess.get(square);
    return !!piece && piece.color === this.turn;
  }

  /**
   * Hamleyi oynar. Donen nesne 3D katmanin sahneyi guncellemesi icin
   * gereken her seyi tasir -- ozellikle yenen tasin hangi karede oldugunu
   * (en passant'ta yenen tas hedef karede DEGIL).
   */
  move(from, to, promotion = "q") {
    // chess.js 1.x gecersiz hamlede null donmez, exception firlatir.
    let result;
    try {
      result = this.chess.move({ from, to, promotion });
    } catch {
      return null;
    }
    if (!result) return null;

    const isEnPassant = result.flags.includes("e");
    let capturedSquare = null;
    if (result.captured) {
      capturedSquare = isEnPassant
        ? result.to[0] + (result.color === "w" ? +result.to[1] - 1 : +result.to[1] + 1)
        : result.to;
    }

    // Rok: kalenin de tasinmasi gerekiyor
    let rook = null;
    if (result.flags.includes("k")) {
      rook = { from: "h" + result.to[1], to: "f" + result.to[1] };
    } else if (result.flags.includes("q")) {
      rook = { from: "a" + result.to[1], to: "d" + result.to[1] };
    }

    return {
      from: result.from,
      to: result.to,
      piece: result.piece,
      color: result.color,
      captured: result.captured ?? null,
      capturedSquare,
      capturedColor: result.captured ? (result.color === "w" ? "b" : "w") : null,
      isEnPassant,
      promotion: result.promotion ?? null,
      rook,
      san: result.san,
    };
  }

  needsPromotion(from, to) {
    return this.chess
      .moves({ square: from, verbose: true })
      .some((m) => m.to === to && m.flags.includes("p"));
  }

  status() {
    if (this.chess.isCheckmate()) {
      return { over: true, text: this.turn === "w" ? "Black wins by checkmate" : "White wins by checkmate" };
    }
    if (this.chess.isStalemate()) return { over: true, text: "Stalemate — draw" };
    if (this.chess.isInsufficientMaterial()) return { over: true, text: "Insufficient material — draw" };
    if (this.chess.isThreefoldRepetition()) return { over: true, text: "Threefold repetition — draw" };
    if (this.chess.isDraw()) return { over: true, text: "Draw" };
    if (this.chess.inCheck()) {
      return { over: false, text: (this.turn === "w" ? "White" : "Black") + " is in check" };
    }
    return { over: false, text: (this.turn === "w" ? "White" : "Black") + " to move" };
  }

  reset() {
    this.chess.reset();
  }
}
