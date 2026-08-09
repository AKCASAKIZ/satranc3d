/**
 * Ses efektleri kodla uretiliyor -- dosya indirilmiyor, telif yok, boyut yok.
 * Hepsi WebAudio primitifleri: sinus thump + filtrelenmis gurultu.
 *
 * Sesler "bus + mutlak zaman" uzerinden yaziliyor, canli AudioContext'e degil.
 * Boylece ayni voice kodu hem hoparlorde hem de klip icin OfflineAudioContext'te
 * calisiyor -- video sesinin oyun sesinden sapmasi imkansiz.
 */

/** Tohumlu rastgele -- gurultu tabani her renderda ayni olsun (klip determinizmi). */
function makeRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rand = makeRandom(0x5eed);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
  return buf;
}

/** Bir AudioContext'i seslendirmeye hazir hale getirir. */
export function createBus(ctx, { volume = 0.5, destination = null } = {}) {
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(destination ?? ctx.destination);
  return { ctx, master, noise: makeNoiseBuffer(ctx) };
}

function noiseSource(bus) {
  const src = bus.ctx.createBufferSource();
  src.buffer = bus.noise;
  src.loop = true;
  return src;
}

/**
 * Ustel zarf. exponentialRamp sifira gidemez, bu yuzden tepe degeri
 * tabanla sinirlaniyor -- power=0 gelirse WebAudio hata firlatirdi.
 */
function envelope(bus, node, t, { attack = 0.002, decay = 0.25, peak = 1 } = {}) {
  const g = bus.ctx.createGain();
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(p, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  node.connect(g);
  return { gain: g, stopAt: t + attack + decay + 0.05 };
}

/**
 * Ses sozlugu. Her voice (bus, baslangicZamani, secenekler) aliyor;
 * "simdi" kavrami yok, bu yuzden ileri tarihe de programlanabiliyor.
 */
export const VOICES = {
  /** Agir carpma: alcak sinus thump + kisa bantli gurultu patlamasi. */
  impact(bus, t, { pitch = 90, power = 1 } = {}) {
    const osc = bus.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch * 2.2, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, t + 0.16);
    const oe = envelope(bus, osc, t, { decay: 0.28, peak: 0.9 * power });
    oe.gain.connect(bus.master);
    osc.start(t);
    osc.stop(oe.stopAt);

    const n = noiseSource(bus);
    const bp = bus.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.8;
    n.connect(bp);
    const ne = envelope(bus, bp, t, { decay: 0.1, peak: 0.55 * power });
    ne.gain.connect(bus.master);
    n.start(t);
    n.stop(ne.stopAt);
  },

  /** Parcalanma: yuksek frekansli gurultu kuyrugu, hizli sonum. */
  shatter(bus, t, { power = 1 } = {}) {
    const n = noiseSource(bus);
    const hp = bus.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(2200, t);
    hp.frequency.exponentialRampToValueAtTime(600, t + 0.5);
    n.connect(hp);

    const g = bus.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.42 * power), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    hp.connect(g);
    g.connect(bus.master);

    n.start(t);
    n.stop(t + 0.6);
  },

  /** Toz: alcak gecirgen gurultu, yavas fade -- carpmadan hemen sonra. */
  dust(bus, t, { power = 1 } = {}) {
    const n = noiseSource(bus);
    const lp = bus.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    n.connect(lp);

    const g = bus.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.2 * power), t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    lp.connect(g);
    g.connect(bus.master);

    n.start(t);
    n.stop(t + 1.0);
  },

  /** Tas tahtaya otururken cikan kisa tok ses. */
  place(bus, t) {
    const osc = bus.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.07);
    const e = envelope(bus, osc, t, { decay: 0.09, peak: 0.22 });
    e.gain.connect(bus.master);
    osc.start(t);
    osc.stop(e.stopAt);
  },
};

/** Bir ses olay listesini (at = saniye, klip basindan itibaren) bus'a yazar. */
export function scheduleEvents(bus, events, offset = 0) {
  for (const e of events) VOICES[e.type]?.(bus, offset + e.at, e.opts);
}

// --- canli calma yolu ------------------------------------------------

let liveBus = null;

/** Tarayici otoplay kurali: AudioContext ilk kullanici etkilesiminde acilabilir. */
export function initAudio() {
  if (liveBus) {
    if (liveBus.ctx.state === "suspended") liveBus.ctx.resume();
    return liveBus.ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  liveBus = createBus(new AC());
  return liveBus.ctx;
}

export function setVolume(v) {
  if (liveBus) liveBus.master.gain.value = v;
}

/** Canli ses: type + gecikme (saniye). Ses acilmadiysa sessizce yutulur. */
export function play(type, opts = {}, delay = 0) {
  if (!liveBus) return;
  VOICES[type]?.(liveBus, liveBus.ctx.currentTime + delay, opts);
}

// --- klip icin offline render ---------------------------------------

/**
 * Olay listesini WAV'a cevirir. Ayni VOICES kodu, sadece baska bir context.
 * duration saniye; kuyruk kesilmesin diye cagiran taraf pay birakmali.
 */
export async function renderEventsToWav(events, duration, sampleRate = 48000) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return null;
  const ctx = new OAC(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const bus = createBus(ctx);
  scheduleEvents(bus, events);
  return encodeWav(await ctx.startRendering());
}

/** AudioBuffer -> 16 bit PCM WAV blob. */
export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const data = new DataView(new ArrayBuffer(44 + frames * channels * 2));

  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) data.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  data.setUint32(4, 36 + frames * channels * 2, true);
  str(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); // PCM
  data.setUint16(22, channels, true);
  data.setUint32(24, buffer.sampleRate, true);
  data.setUint32(28, buffer.sampleRate * channels * 2, true);
  data.setUint16(32, channels * 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, frames * channels * 2, true);

  const src = [];
  for (let c = 0; c < channels; c++) src.push(buffer.getChannelData(c));

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, src[c][i]));
      data.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([data.buffer], { type: "audio/wav" });
}
