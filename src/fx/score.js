/**
 * Sparta tekmesinin MUZIGI.
 *
 * Neden prosedurel: (1) hazir parca Shorts'ta telif takibine yakalanip
 * videoyu sessize alabiliyor, her klip icin ayri lisans takip etmek de isi
 * durdurur; (2) muzik dovusle KARE KARE hizali olmali -- vurus muzigin
 * vurusuna denk gelmezse ikisi de zayifliyor. Notalar ses efektleriyle ayni
 * VOICES sozlugunden ve ayni bus'tan geciyor, yani klipteki muzik oyundaki
 * muzikten sapamaz (klip kaydinda ayni cagrilar OfflineAudioContext'te
 * render ediliyor).
 *
 * ZAMAN: muzik GERCEK saniyede yasar, sahne saatinde degil. Yavas cekimde
 * dovus agirlasirken muzik temposunu korumali -- filmde de boyle. Bu yuzden
 * skor uc parcaya bolunmus ve her parca GERCEKTEN oldugu anda calisiyor:
 * giris (dovus baslarken, ileri tarihli), vurus (tekme degdigi an),
 * carpma (govde yere indigi an). Tek seferde programlansaydi rampa
 * muzigi goruntuden kaydirirdi.
 *
 * Perde: re minor pentatonik (D-F-G-A-C). Yarim ses yok, bu yuzden hangi
 * iki nota ust uste binerse binsin uyumsuz duymuyor -- zamanlamasi
 * fiziginden gelen bir sahnede sart.
 */

/** Re minor pentatonik, alt oktav. `tel` 375 Hz uzerini dogru calmiyor. */
const NOTA = { d3: 146.8, f3: 174.6, g3: 196.0, a3: 220.0, c4: 261.6, d4: 293.7 };

/**
 * Muzik katmaninin efektlere gore seviyesi.
 *
 * Olculdu: skor ilk yazildiginda klibin ortalama seviyesi -24,5 dB'den
 * -5,3 dB'ye ciktı ve tepe 0,0 dB'ye dayandi -- yani master limiter
 * surekli eziliyor ve vurus efektleri muzigin altinda kayboluyordu.
 * Muzik dovusun ALTINDA durmali; sahnenin sesi hala tekme.
 * YouTube zaten -14 LUFS'a normalize ediyor, yuksek basmak kazandirmiyor.
 */
const MUZIK = 0.6;

/**
 * Dovusun basindan tekmeye kadar olan kisim: alt dron + hizlanan davul +
 * son yarim saniyede yukselen gerilim.
 *
 * @param {object} fx      efekt kanali (fx.sound)
 * @param {number} vurusta tekmenin degecegi an (saniye, simdiden itibaren)
 * @param {number} guc     saldiranin agirligi (POWER)
 */
export function skorGiris(fx, vurusta, guc = 1) {
  const s = (type, at, opts) => fx.sound(type, opts, Math.max(0, at));

  s("dron", 0, { power: 0.9 * MUZIK, freq: 55, sure: Math.max(0.6, vurusta - 0.2) });

  // Hizlanan davul: araliklar kisaliyor, son vurus tekmeyle ayni karede.
  // Sabit tempo "muzik calıyor" diye duyuluyor; hizlanma "bir sey olacak".
  const araliklar = [1.55, 1.05, 0.68, 0.4, 0.2];
  araliklar.forEach((geri, i) => {
    if (vurusta - geri < 0.05) return;
    s("taiko", vurusta - geri, { power: (0.34 + 0.1 * i) * MUZIK, pitch: 64 + 3 * i });
  });

  s("yukselis", Math.max(0, vurusta - 0.85), { power: 0.85 * guc * MUZIK, sure: Math.min(0.85, vurusta) });
}

/**
 * Tekme degdi: gong + agir davul + alt tel. Klibin muzikal tepe noktasi.
 *
 * @param {number} ucus govdenin havada kalacagi GERCEK sure (yavas cekim
 *   dahil). Olculdu: bu katman olmadan tekme ile carpma arasinda -40 dB'lik
 *   bir ses cukuru kaliyor, yani klibin en gosterisli 1,5 saniyesi sessiz.
 */
export function skorVurus(fx, guc = 1, ucus = 0) {
  fx.sound("gong", { power: 1.0 * guc * MUZIK });
  fx.sound("taiko", { power: 0.95 * guc * MUZIK, pitch: 52 });
  fx.sound("tel", { power: 0.7 * MUZIK, freq: NOTA.d3, decay: 2.2, pan: -0.2 });
  if (ucus > 0.2) fx.sound("dron", { power: 1.5 * MUZIK, freq: 73, sure: ucus * 0.8 });
}

/**
 * Govde yere caldi: kapanis. Inen bes nota -- yukselen bir ezgi
 * "devam edecek" der, inen ezgi "bitti" der. Sahne burada bitiyor.
 */
export function skorCarpma(fx, guc = 1) {
  fx.sound("taiko", { power: 0.7 * guc * MUZIK, pitch: 58 });
  const ezgi = [
    [NOTA.d4, 0.0, 0.35],
    [NOTA.c4, 0.16, 0.3],
    [NOTA.a3, 0.32, 0.28],
    [NOTA.g3, 0.52, 0.26],
    [NOTA.d3, 0.78, 0.5],
  ];
  for (const [freq, at, seviye] of ezgi) {
    fx.sound("tel", { power: seviye * MUZIK, freq, decay: 1.6, pan: (freq / NOTA.d4 - 0.7) * 0.6 }, at);
  }
}
