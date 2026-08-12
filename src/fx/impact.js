/**
 * Darbeyi agirlastiran uc ucuz numara. Animasyonun kendisinden daha cok
 * "vurdu" hissini bunlar tasiyor.
 */

/**
 * Hit-stop: carpma aninda her seyi kisa sure dondur.
 * Etki/maliyet orani en yuksek numara -- 70 ms donma darbeyi iki kat agirlastiriyor.
 * Global bir zaman olcegi olarak calisiyor; ana dongu dt'yi bununla carpiyor.
 */
export class TimeScale {
  /**
   * now: milisaniye veren saat. Klip kaydinda duvar saati yerine sanal saat
   * veriliyor, yoksa hit-stop'un uzunlugu render hizina gore degisir ve
   * ayni URL iki farkli video uretir.
   */
  constructor(now = () => performance.now()) {
    this.now = now;
    this.value = 1;
    this.until = 0;
    /** Sirali hiz programi (bkz. sequence). Bos ise klasik freeze/slow yolu. */
    this.steps = null;
  }

  freeze(ms = 70) {
    this.steps = null;
    this.value = 0.02;
    this.until = this.now() + ms;
  }

  slow(factor = 0.35, ms = 250) {
    this.steps = null;
    this.value = factor;
    this.until = this.now() + ms;
  }

  /**
   * Hiz RAMPASI: tek bir donma yerine sirali bir hiz programi.
   *
   * "300" tarzi darbe tek bir yavaslatma degil, yavas-DUR-hizli-yavas
   * dizisi: tekme agir agir gelir, degdigi an durur, govde bir anda
   * firlar, sonra havada tekrar agirlasir. Tek `freeze` bunu veremiyor
   * cunku donmeden sonra her sey ayni hizda devam ediyor.
   *
   * @param {Array<{to:number, ms:number, ramp?:boolean}>} steps
   *   ramp yoksa deger aninda `to` olur ve ms boyunca orada kalir;
   *   ramp true ise onceki degerden `to`'ya ms boyunca yumusakca gecer.
   *   Program bitince deger 1'e doner.
   */
  sequence(steps) {
    const t0 = this.now();
    let at = t0;
    let from = this.value;
    this.steps = steps.map((s) => {
      const seg = { start: at, end: at + s.ms, from, to: s.to, ramp: !!s.ramp };
      at = seg.end;
      from = s.to;
      return seg;
    });
    this.until = at;
  }

  update() {
    const t = this.now();

    if (this.steps) {
      if (t >= this.until) {
        this.steps = null;
        this.value = 1;
        return this.value;
      }
      for (const seg of this.steps) {
        if (t >= seg.end) continue;
        if (t < seg.start) break; // program ileride basliyorsa mevcut deger korunur
        if (!seg.ramp) {
          this.value = seg.to;
        } else {
          const k = (t - seg.start) / Math.max(1, seg.end - seg.start);
          // smoothstep: duz lineer rampa makine gibi okunuyor
          this.value = seg.from + (seg.to - seg.from) * (k * k * (3 - 2 * k));
        }
        break;
      }
      return this.value;
    }

    if (this.value !== 1 && t >= this.until) this.value = 1;
    return this.value;
  }
}

/**
 * Bir hiz programinin sahneye kattigi EK GERCEK sure (saniye).
 *
 * Klip kaydi icin sart: video uzunlugu gercek saniyeyle olculuyor, sahnenin
 * cizelgesi ise olceklenmis saatte ilerliyor. 0,3 hizda gecen 900 ms sahneyi
 * yalnizca 270 ms ilerletir; bu fark videoya eklenmezse klip dovus bitmeden
 * kesilir.
 */
export function rampaEkSure(steps) {
  let ek = 0;
  let from = 1;
  for (const s of steps) {
    const ort = s.ramp ? (from + s.to) / 2 : s.to;
    ek += (s.ms / 1000) * (1 - ort);
    from = s.to;
  }
  return ek;
}

/** Ekran flasi -- WebGL'e dokunmadan, CSS overlay ile. */
export function flash({ color = "255,235,200", strength = 0.55, ms = 180 } = {}) {
  const el = document.getElementById("flash");
  if (!el) return;
  el.style.transition = "none";
  el.style.background = `rgba(${color},${strength})`;
  // reflow zorla, yoksa tarayici iki stili birlestirip gecisi atliyor
  void el.offsetWidth;
  el.style.transition = `background ${ms}ms ease-out`;
  el.style.background = `rgba(${color},0)`;
}

/**
 * Sonumlenen kamera sarsintisi. CameraRig her karede bunu sorup
 * kamera pozisyonuna offset ekliyor.
 */
export class Shake {
  constructor() {
    this.strength = 0;
    this.decay = 1;
    this.t = 0;
  }

  fire(strength = 0.18, duration = 0.35) {
    this.strength = Math.max(this.strength, strength);
    this.decay = 1 / duration;
    this.t = 0;
  }

  /** dt saniye -> {x,y,z} offset */
  update(dt) {
    if (this.strength <= 0.0001) return null;
    this.t += dt;
    this.strength = Math.max(0, this.strength - this.decay * this.strength * dt * 3);

    const s = this.strength;
    // Yuksek frekansli titresim; sinus karisimi rastgeleden daha kontrollu
    const f = this.t * 47;
    return {
      x: Math.sin(f * 1.7) * s,
      y: Math.sin(f * 2.3 + 1.1) * s * 0.7,
      z: Math.cos(f * 1.9 + 0.4) * s,
    };
  }
}
