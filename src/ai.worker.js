import { Engine, LEVELS, pickMove, toPublicMove } from "./engine.js";

// Arama ana is parcaciginda kosarsa kamera ve oldurus animasyonlari
// donuyor; bu yuzden motor tamamen worker'da yasiyor.
const engine = new Engine();

self.onmessage = (e) => {
  const { id, fen, level } = e.data;
  const cfg = LEVELS[level] ?? LEVELS.orta;

  try {
    const result = engine.search(fen, { timeMs: cfg.timeMs, maxDepth: cfg.maxDepth });
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
