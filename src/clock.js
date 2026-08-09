/**
 * Merkezi animasyon saati.
 *
 * Butun hareketler buradan surulmeli, cunku hit-stop (carpma aninda donma)
 * ancak tek bir zaman olcegi varsa dogru calisir. Her animasyon kendi
 * requestAnimationFrame'ini kullansaydi carpma aninda bazilari donar
 * bazilari donmezdi.
 *
 * Geri cagirma true donerse listeden dusuruluyor.
 */
export class Clock {
  constructor(timeScale) {
    this.timeScale = timeScale;
    this.callbacks = new Set();
    this.pending = [];
  }

  add(fn) {
    this.pending.push(fn);
  }

  remove(fn) {
    this.callbacks.delete(fn);
    const i = this.pending.indexOf(fn);
    if (i >= 0) this.pending.splice(i, 1);
  }

  /** rawDt saniye (olceklenmemis). Olceklenmis dt'yi doner. */
  tick(rawDt) {
    // Yeni eklenenler bir sonraki kareden itibaren calissin -- iterasyon
    // sirasinda set'i degistirmemek icin
    if (this.pending.length) {
      for (const fn of this.pending) this.callbacks.add(fn);
      this.pending.length = 0;
    }

    const scale = this.timeScale.update();
    const dt = rawDt * scale;

    for (const fn of [...this.callbacks]) {
      if (fn(dt)) this.callbacks.delete(fn);
    }
    return dt;
  }
}
