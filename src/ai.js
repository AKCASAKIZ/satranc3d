import { Engine, LEVELS, levelWithBias, pickMove, toPublicMove } from "./engine.js";

export { LEVELS };

/**
 * Motorun ana is parcacigindaki yuzu. Worker acilmazsa (dosya protokolu,
 * eski tarayici) ayni motoru senkron calistiran yedege dusuyor -- oyun
 * takilir ama oynanmaz hale gelmez.
 */
export class AI {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.worker = null;
    this.fallback = null;

    try {
      this.worker = new Worker(new URL("./ai.worker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => {
        const { id, ...rest } = e.data;
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        rest.error ? entry.reject(new Error(rest.error)) : entry.resolve(rest);
      };
      this.worker.onerror = () => {
        // Worker cokerse bekleyen istekleri yedege devret
        this.worker = null;
        for (const [, entry] of this.pending) entry.reject(new Error("worker"));
        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  /**
   * @param {number} [maxMs] saatten gelen tavan; seviyenin butcesi bunu
   *   asamaz. Saat kapaliyken Infinity gelir ve hicbir sey degismez.
   * @returns {Promise<{ move: {from,to,promotion,san}|null, score, depth, nodes }>}
   */
  async think(fen, level, bias = 0, maxMs = Infinity) {
    if (this.worker) {
      const id = ++this.seq;
      try {
        return await new Promise((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          this.worker.postMessage({ id, fen, level, bias, maxMs });
        });
      } catch {
        /* yedege dus */
      }
    }
    return this.thinkSync(fen, level, bias, maxMs);
  }

  async thinkSync(fen, level, bias = 0, maxMs = Infinity) {
    this.fallback ??= new Engine();
    const cfg = levelWithBias(level, bias);
    const result = this.fallback.search(fen, {
      timeMs: Math.min(cfg.timeMs, maxMs),
      maxDepth: cfg.maxDepth,
    });
    return {
      move: toPublicMove(pickMove(result, cfg.slack)),
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
    };
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
  }
}
