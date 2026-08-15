/**
 * Satranc saati.
 *
 * Bu dosya GERCEK zamanla calisiyor, oyunun `Clock`'uyla degil. Sebep
 * olculebilir: `Clock` hit-stop ve yavas cekim icin olcekleniyor -- sparta
 * tekmesinin agir cekim bolumunde saat de yavaslardi, yani oyuncu tekme
 * atarak zaman kazanirdi.
 *
 * Ayni gerekceyle saat OLDURUS ANIMASYONLARI BOYUNCA DURUYOR (main.js
 * `busy` bayragi). Animasyon dusunme suresi degil; 4 saniyelik bir dovusu
 * oyuncunun saatinden dusurmek, ozellikle 3 dakikalik partide, oyunu
 * dovusun kendisi yuzunden kaybettirir.
 */

/* Secilebilir tempolar. `sn` taban sure, `art` hamle basina eklenen.

   !! Anahtarlar SAYI GIBI OLMAMALI. Once "10" ve "5" yazilmisti; JavaScript
      nesne anahtarlarinda tam sayi gorunumlu olanlari once ve kucukten
      buyuge siraliyor, menude "5 min · 10 min · No clock · 3|2" ciktisi
      geldi -- kod dogru, siralama sessizce bozuk. Ekranda yakalandi. */
export const TEMPOLAR = {
  yok: { label: "No clock", sn: 0, art: 0 },
  d10: { label: "10 min", sn: 600, art: 0 },
  d5: { label: "5 min", sn: 300, art: 0 },
  "3+2": { label: "3 | 2", sn: 180, art: 2 },
};

export const tempoVarMi = (key) => !!TEMPOLAR[key] && TEMPOLAR[key].sn > 0;

/** mm:ss; son 20 saniyede saliseye dusuyor (blitz'te tek okunakli bicim). */
export function bicimle(sn) {
  if (sn <= 0) return "0:00";
  if (sn < 20) return sn.toFixed(1).replace(".", ",");
  const d = Math.floor(sn / 60);
  const k = Math.floor(sn % 60);
  return d + ":" + String(k).padStart(2, "0");
}

export class Saat {
  /** @param {string} tempo TEMPOLAR anahtari */
  constructor(tempo) {
    const cfg = TEMPOLAR[tempo] ?? TEMPOLAR.yok;
    this.acik = cfg.sn > 0;
    this.taban = cfg.sn;
    this.art = cfg.art;
    this.kalan = { w: cfg.sn, b: cfg.sn };
    this.aktif = null; // saati isleyen taraf, null = durmus
    this.dusen = null; // suresi biten taraf
  }

  /** Sirasi gelen tarafin saatini isletmeye basla. */
  basla(renk) {
    if (!this.acik || this.dusen) return;
    this.aktif = renk;
  }

  /** Saati dondur (animasyon, terfi penceresi, menu, oyun sonu). */
  duraklat() {
    this.aktif = null;
  }

  /**
   * Hamle tamamlandi: artis ekle ve sirayi devret.
   * Artis hamleyi YAPAN tarafa ekleniyor (Fischer artisi).
   */
  hamleBitti(oynayan, siradaki) {
    if (!this.acik || this.dusen) return;
    this.kalan[oynayan] += this.art;
    this.aktif = siradaki;
  }

  /**
   * @param {number} dt gercek saniye
   * @returns {"w"|"b"|null} bu karede suresi biten taraf
   */
  tick(dt) {
    if (!this.acik || !this.aktif || this.dusen) return null;
    this.kalan[this.aktif] = Math.max(0, this.kalan[this.aktif] - dt);
    if (this.kalan[this.aktif] === 0) {
      this.dusen = this.aktif;
      this.aktif = null;
      return this.dusen;
    }
    return null;
  }

  /** Motora verilecek dusunme butcesi (ms). Saat yoksa sinir yok. */
  butce(renk) {
    if (!this.acik) return Infinity;
    /* Kalanin yirmide biri: klasik "beklenen kalan hamle sayisi" yaklasimi.
       Alt sinir 120 ms -- altinda motor bir iterasyon bile bitiremiyor ve
       hamle rastgeleye donuyor. Ust sinir yok, seviyenin kendi butcesi
       zaten cagri yerinde uygulaniyor. */
    return Math.max(120, (this.kalan[renk] * 1000) / 20);
  }

  sifirla() {
    this.kalan = { w: this.taban, b: this.taban };
    this.aktif = null;
    this.dusen = null;
  }
}
