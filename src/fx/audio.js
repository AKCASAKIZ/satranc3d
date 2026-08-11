/**
 * Ses efektleri kodla uretiliyor -- dosya indirilmiyor, telif yok, boyut yok.
 *
 * Tasarim kurali: hicbir efekt tek bir osilator degil. Her vurus uc katman --
 * TRANSIENT (ilk 5 ms, "nereye carpti"), GOVDE (malzemenin inharmonik kismi
 * tonlari, "neye carpti"), KUYRUK (gurultu + yanki, "nerede carpti"). Tek
 * katmanli bip sesleri oyunu ucuz gosteriyordu; agirlik hissini bu ayrisim
 * tasiyor.
 *
 * Butun sesler ortak bir tas salon yankisina ve limiter'a giriyor. Yanki
 * sadece suslemi degil: kuru orneklerin "menude bir dugmeye bastim" hissini
 * veren sey mekan yoklugu.
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

/**
 * Tas salon yankisi. Hazir IR dosyasi yerine uretiliyor: iki kanal ayri
 * tohumla dagitiliyor (genislik), tepe erken yansimalarla vurgulaniyor,
 * tek kutuplu alcak gecirgen ile karartiliyor -- parlak yanki plastik duruyor.
 */
function makeImpulse(ctx, seconds = 1.6, decay = 4.2) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rand = makeRandom(ch === 0 ? 0x1a2b : 0x7c3d);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const v = (rand() * 2 - 1) * Math.pow(1 - k, decay);
      lp += (v - lp) * 0.34; // karartma
      data[i] = lp;
    }
    // Erken yansimalar: kuru sesin hemen ardindan gelen birkac sert vurus,
    // odanin buyuklugunu asil bunlar anlatiyor.
    for (const [ms, amp] of [[11, 0.5], [19, 0.36], [31, 0.26], [43, 0.18]]) {
      const i = Math.floor((ms / 1000) * ctx.sampleRate) + ch * 7;
      if (i < len) data[i] += amp * (ch === 0 ? 1 : -1);
    }
  }
  return buf;
}

/** Bir AudioContext'i seslendirmeye hazir hale getirir. */
export function createBus(ctx, { volume = 0.5, destination = null } = {}) {
  const master = ctx.createGain(); // voice'lar buraya baglaniyor (kuru yol)
  master.gain.value = volume;

  const send = ctx.createGain(); // yanki gonderisi
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.85 * volume;
  send.connect(convolver);
  convolver.connect(wet);

  // Katmanlar ust uste binince tepe deger kaciyor. Limiter hem kirilmayi
  // engelliyor hem de butun efektleri ayni "yapistiriciya" sokup tek bir
  // dunyadan geliyormus gibi duyulmalarini sagliyor.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -13;
  glue.knee.value = 8;
  glue.ratio.value = 6;
  glue.attack.value = 0.003;
  glue.release.value = 0.16;

  // Hafif tiz acma: yankidan sonra ses matlasiyor, netligi buradan geri aliyoruz
  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 5200;
  air.gain.value = 2.5;

  master.connect(glue);
  wet.connect(glue);
  glue.connect(air);
  air.connect(destination ?? ctx.destination);

  return { ctx, master, send, noise: makeNoiseBuffer(ctx) };
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
function envelope(bus, node, t, { attack = 0.002, hold = 0, decay = 0.25, peak = 1 } = {}) {
  const g = bus.ctx.createGain();
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(p, t + attack);
  if (hold > 0) g.gain.setValueAtTime(p, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
  node.connect(g);
  return { gain: g, stopAt: t + attack + hold + decay + 0.05 };
}

/** Kuru sesi ayrica yankiya yollar. 0 = tamamen kuru (adim sesleri gibi). */
function reverb(bus, node, amount) {
  if (amount <= 0) return;
  const g = bus.ctx.createGain();
  g.gain.value = amount;
  node.connect(g);
  g.connect(bus.send);
}

/** Stereo yerlestirme -- ayni sesin katmanlari biraz acilinca genisliyor. */
function panned(bus, node, pan) {
  if (!bus.ctx.createStereoPanner || !pan) return node;
  const p = bus.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(p);
  return p;
}

/**
 * Filtrelenmis gurultu patlamasi. `to` verilirse filtre suresince suzuluyor:
 * asagi suzulme "cokme", yukari suzulme "savurma" hissi veriyor.
 */
function noiseBurst(
  bus,
  t,
  { type = "bandpass", from = 1200, to = null, q = 1, attack = 0.001, hold = 0, decay = 0.12, peak = 0.4, wet = 0.2, pan = 0 } = {}
) {
  const n = noiseSource(bus);
  const f = bus.ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + attack + hold + decay);
  n.connect(f);
  const e = envelope(bus, f, t, { attack, hold, decay, peak });
  const out = panned(bus, e.gain, pan);
  out.connect(bus.master);
  reverb(bus, out, wet);
  n.start(t);
  n.stop(e.stopAt);
  return e;
}

/**
 * Inharmonik kismi ton yigini. Malzemeyi belirleyen sey burasi: tam kat
 * oranlar (1, 2, 3...) muzik aleti gibi duyuluyor; tas ve dovme metal
 * oranlari kaydirdigi icin "cisim" gibi duyuluyor.
 */
function partials(bus, t, base, ratios, { type = "sine", decay = 0.3, peak = 0.3, wet = 0.3, spread = 0.5 } = {}) {
  ratios.forEach((ratio, i) => {
    const osc = bus.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(base * ratio, t);
    // Ust kismi tonlar daha hizli sonuyor -- gercek cisimlerde de boyle
    const fall = Math.pow(0.62, i);
    const e = envelope(bus, osc, t, { attack: 0.002, decay: decay * fall, peak: peak * fall });
    const out = panned(bus, e.gain, ((i % 2 ? 1 : -1) * spread * i) / ratios.length);
    out.connect(bus.master);
    reverb(bus, out, wet);
    osc.start(t);
    osc.stop(e.stopAt);
  });
}

/** Ilk 5 ms. Kulagin "sert" diye algiladigi sey neredeyse tamamen burada. */
function transient(bus, t, { peak = 0.4, freq = 3800, decay = 0.012, pan = 0 } = {}) {
  noiseBurst(bus, t, { type: "highpass", from: freq, q: 0.7, attack: 0.0008, decay, peak, wet: 0.08, pan });
}

/**
 * Ses sozlugu. Her voice (bus, baslangicZamani, secenekler) aliyor;
 * "simdi" kavrami yok, bu yuzden ileri tarihe de programlanabiliyor.
 */
export const VOICES = {
  /**
   * Oldurucu darbe: mermer heykele inen agir vurus.
   * Alt uctaki sinus dususu agirligi, inharmonik tas tonlari malzemeyi,
   * moloz kuyrugu da sonucu tasiyor.
   */
  impact(bus, t, { pitch = 90, power = 1 } = {}) {
    transient(bus, t, { peak: 0.55 * power, freq: 3400 });

    // Govde: tasin catlamasi
    partials(bus, t, pitch * 2.05, [1, 1.71, 2.63, 4.11], {
      decay: 0.34,
      peak: 0.42 * power,
      wet: 0.34,
    });

    // Alt uc: darbenin agirligi. Duyulmaktan cok hissediliyor.
    const sub = bus.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(pitch * 1.15, t);
    sub.frequency.exponentialRampToValueAtTime(pitch * 0.38, t + 0.22);
    const se = envelope(bus, sub, t, { attack: 0.004, decay: 0.42, peak: 0.85 * power });
    se.gain.connect(bus.master);
    reverb(bus, se.gain, 0.18);
    sub.start(t);
    sub.stop(se.stopAt);

    // Kuyruk: dokulen moloz
    noiseBurst(bus, t + 0.012, {
      from: 2600,
      to: 320,
      q: 0.6,
      decay: 0.4,
      peak: 0.34 * power,
      wet: 0.45,
    });
  },

  /**
   * Bloklanan vurus: silah kalkana carpiyor. Oldurucu darbeden acikca
   * ayri duymali, yoksa tam dovuste iki vurus tek ses gibi geliyor --
   * bu yuzden parlak, uzun kuyruklu ve bol yankili.
   */
  clash(bus, t, { power = 1 } = {}) {
    transient(bus, t, { peak: 0.5 * power, freq: 5200 });
    // Can oranlari: dovme metalin cinlamasi
    partials(bus, t, 520, [1, 2.76, 5.4, 8.93, 13.34], {
      type: "triangle",
      decay: 0.85,
      peak: 0.3 * power,
      wet: 0.6,
      spread: 0.8,
    });
    noiseBurst(bus, t, { from: 3600, to: 1400, q: 1.6, decay: 0.16, peak: 0.28 * power, wet: 0.4 });
  },

  /**
   * Silah savurma. Darbeden ~0.12 sn once caliniyor: carpmanin geldigini
   * haber veren bu ses, carpmanin kendisi kadar agirlik katiyor.
   */
  whoosh(bus, t, { power = 1, pan = -0.25 } = {}) {
    noiseBurst(bus, t, {
      from: 300,
      to: 2400,
      q: 1.2,
      attack: 0.06,
      decay: 0.16,
      peak: 0.95 * power,
      wet: 0.25,
      pan,
    });
  },

  /** Devrilme: govdenin tahtaya carpmasi + dagilan moloz. */
  death(bus, t, { power = 1 } = {}) {
    const sub = bus.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(78, t);
    sub.frequency.exponentialRampToValueAtTime(31, t + 0.3);
    const e = envelope(bus, sub, t, { attack: 0.006, decay: 0.5, peak: 0.7 * power });
    e.gain.connect(bus.master);
    reverb(bus, e.gain, 0.3);
    sub.start(t);
    sub.stop(e.stopAt);

    noiseBurst(bus, t, { type: "lowpass", from: 900, to: 160, decay: 0.55, peak: 0.34 * power, wet: 0.4 });
    noiseBurst(bus, t + 0.13, { from: 2200, to: 700, q: 0.8, decay: 0.5, peak: 0.16 * power, wet: 0.5 });
  },

  /** Parcalanan mermer -- yuksek frekansli dagilma kuyrugu. */
  shatter(bus, t, { power = 1 } = {}) {
    transient(bus, t, { peak: 0.15 * power, freq: 6000 });
    noiseBurst(bus, t, { type: "highpass", from: 2400, to: 620, decay: 0.5, peak: 0.18 * power, wet: 0.55 });
    partials(bus, t, 1180, [1, 1.83, 2.94], { decay: 0.22, peak: 0.07 * power, wet: 0.5 });
  },

  /** Toz: alcak gecirgen gurultu, yavas fade -- carpmadan hemen sonra. */
  dust(bus, t, { power = 1 } = {}) {
    noiseBurst(bus, t, {
      type: "lowpass",
      from: 520,
      to: 180,
      attack: 0.07,
      decay: 0.85,
      peak: 0.34 * power,
      wet: 0.4,
    });
  },

  /** Tas ayagin tahtaya basmasi -- yurume klibi sessiz kalmasin. */
  step(bus, t, { power = 1 } = {}) {
    noiseBurst(bus, t, { type: "lowpass", from: 1100, to: 300, decay: 0.09, peak: 0.34 * power, wet: 0.14 });
    partials(bus, t, 132, [1, 2.4], { decay: 0.08, peak: 0.2 * power, wet: 0.1 });
  },

  /** Tas tahtaya otururken cikan kisa tok ses -- mermer tiklamasi. */
  place(bus, t, { power = 1 } = {}) {
    transient(bus, t, { peak: 0.1 * power, freq: 4200 });
    partials(bus, t, 296, [1, 2.67, 4.31], { decay: 0.13, peak: 0.13 * power, wet: 0.25 });
  },

  /**
   * Yildirim: keskin catirti + uzun alcak gurulti.
   *
   * Iki katman bilincli. Catirti carpma anini isaretliyor (yuksek, cok kisa);
   * gurulti agirligi veriyor (30 Hz'e inen, 2 sn suren). Tek katmanla
   * ya "cit" gibi ince ya "guum" gibi tepkisiz duruyor.
   */
  thunder(bus, t, { power = 1 } = {}) {
    // Catirti: genis bantli, ani
    transient(bus, t, { peak: 0.62 * power, freq: 7200, decay: 0.02 });
    noiseBurst(bus, t, { type: "highpass", from: 3200, to: 900, decay: 0.16, peak: 0.4 * power, wet: 0.5 });
    // Gurulti: uzun kuyruk, salonu doldursun
    noiseBurst(bus, t + 0.03, {
      type: "lowpass", from: 420, to: 60, attack: 0.02, decay: 1.9, peak: 0.5 * power, wet: 0.75,
    });
    // Sub: gogusde hissedilen kisim
    const sub = bus.ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(62, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + 1.2);
    const e = envelope(bus, sub, t, { attack: 0.006, decay: 1.3, peak: 0.75 * power });
    e.gain.connect(bus.master);
    reverb(bus, e.gain, 0.3);
    sub.start(t);
    sub.stop(e.stopAt);
  },

  /**
   * Isin: yukselen, temiz, metalik olmayan bir ton. Yildirimin tersi -
   * o carpiyor, bu KALDIRIYOR. Bu yuzden perde yukari kayiyor ve
   * vurus/catirti katmani YOK.
   */
  beam(bus, t, { power = 1 } = {}) {
    const base = 196;
    [1, 1.5, 2, 3].forEach((ratio, i) => {
      const osc = bus.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * ratio, t + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * ratio * 2.4, t + 1.6);
      const e = envelope(bus, osc, t + i * 0.05, {
        attack: 0.25, hold: 0.5, decay: 1.1, peak: (0.2 / (i + 1)) * power,
      });
      e.gain.connect(bus.master);
      reverb(bus, e.gain, 0.6);
      osc.start(t + i * 0.05);
      osc.stop(e.stopAt);
    });
    noiseBurst(bus, t, { type: "highpass", from: 4000, to: 9000, attack: 0.4, decay: 1.2, peak: 0.1 * power, wet: 0.8 });
  },

  /** Zafer: kisa bronz fanfar. Tam dovusun sonunu kapatiyor. */
  victory(bus, t, { power = 1 } = {}) {
    [0, 0.09, 0.18].forEach((offset, i) => {
      const freq = [294, 392, 588][i];
      for (const detune of [-6, 6]) {
        const osc = bus.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const lp = bus.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(700, t + offset);
        lp.frequency.exponentialRampToValueAtTime(2600, t + offset + 0.12);
        osc.connect(lp);
        const e = envelope(bus, lp, t + offset, { attack: 0.03, hold: 0.1, decay: 0.5, peak: 0.13 * power });
        const out = panned(bus, e.gain, detune > 0 ? 0.3 : -0.3);
        out.connect(bus.master);
        reverb(bus, out, 0.5);
        osc.start(t + offset);
        osc.stop(e.stopAt);
      }
    });
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
