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
  }

  freeze(ms = 70) {
    this.value = 0.02;
    this.until = this.now() + ms;
  }

  slow(factor = 0.35, ms = 250) {
    this.value = factor;
    this.until = this.now() + ms;
  }

  update() {
    if (this.value !== 1 && this.now() >= this.until) this.value = 1;
    return this.value;
  }
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
