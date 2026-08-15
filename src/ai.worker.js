import { Engine, levelWithBias, pickMove, toPublicMove } from "./engine.js";

// Arama ana is parcaciginda kosarsa kamera ve oldurus animasyonlari
// donuyor; bu yuzden motor tamamen worker'da yasiyor.
const engine = new Engine();

self.onmessage = (e) => {
  const { id, fen, level, bias, maxMs = Infinity } = e.data;
  const cfg = levelWithBias(level, bias);

  try {
    // maxMs: saatin verdigi tavan (bkz. timer.js butce)
    const result = engine.search(fen, {
      timeMs: Math.min(cfg.timeMs, maxMs),
      maxDepth: cfg.maxDepth,
    });
    self.postMessage({
      id,
      move: toPublicMove(pickMove(result, cfg.slack)),
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
    });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
