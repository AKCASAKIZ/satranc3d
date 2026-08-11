/**
 * CrazyGames portali.
 *
 * Bu dosyanin TEK isi: portalin SDK'sini oyunun geri kalanindan izole etmek.
 * Oyun kodu buradaki fonksiyonlari cagirir ve portalda olup olmadigimizi hic
 * bilmez; portal yoksa hepsi sessizce hicbir sey yapar.
 *
 * !! SDK, portal DISINDA cagrilinca HATA FIRLATIR. Dokumanin kendi ifadesi:
 *    ortam `disabled` iken "SDK method calls throw errors". Yani her cagriyi
 *    korumali sarmak sart; tek bir korumasiz cagri GitHub Pages'teki canli
 *    oyunu acilista oldururdu.
 *
 * !! SDK betigi GitHub Pages'te HIC YUKLENMIYOR. Orada ortam zaten `disabled`,
 *    yani hicbir ise yaramadan her ziyaretciye ucuncu taraf bir betik
 *    yuklemek olurdu. Betik yalnizca portalda ve localhost'ta enjekte
 *    ediliyor; hangisinde oldugumuza SDK'dan once, hostname'e bakarak karar
 *    veriliyor (SDK'nin kendi `environment` alani ancak yuklendikten sonra
 *    okunabiliyor - tavuk-yumurta).
 */

const BETIK = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

let sdk = null;          // yalnizca portalda/localhost'ta ve init basarili ise dolu
let oynaniyor = false;   // gameplayStart/Stop cift cagrilmasin
let sonReklam = 0;       // ms; midgame reklam araligini biz de gozetiyoruz

/** Portal betigi yuklenmeli mi? SDK'dan ONCE karar verilmeli. */
function portaldaMiyiz() {
  const h = location.hostname;
  if (new URLSearchParams(location.search).has("useLocalSdk")) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  return /(^|\.)crazygames\.(com|nl)$/.test(h);
}

function betigiYukle() {
  return new Promise((coz, hata) => {
    const s = document.createElement("script");
    s.src = BETIK;
    s.onload = coz;
    s.onerror = () => hata(new Error("portal betigi yuklenmedi"));
    document.head.appendChild(s);
  });
}

/** Sessiz cagri: portal yoksa ya da cagri patlarsa oyunu etkilemesin. */
function dene(fn) {
  if (!sdk) return;
  try { fn(); } catch (e) { console.warn("[portal]", e); }
}

/**
 * Portali baslatir. Basarisiz olursa oyun portalsiz calismaya devam eder --
 * bu bir hata degil, GitHub Pages'teki normal durum.
 */
export async function portalBaslat() {
  if (!portaldaMiyiz()) return false;
  try {
    await betigiYukle();
    await window.CrazyGames.SDK.init();
    // init'ten sonra ortam okunabiliyor; `disabled` ise dokunmuyoruz
    if (window.CrazyGames.SDK.environment === "disabled") return false;
    sdk = window.CrazyGames.SDK;
    return true;
  } catch (e) {
    console.warn("[portal] baslatilamadi, portalsiz devam", e);
    return false;
  }
}

export function portalVarMi() { return !!sdk; }

export function yuklemeBasladi() { dene(() => sdk.game.loadingStart()); }
export function yuklemeBitti() { dene(() => sdk.game.loadingStop()); }

/**
 * Oynanis basladi/durdu. Portal bunu reklam zamanlamasi icin kullaniyor:
 * "durdu" demezsek oyuncunun dusundugu anda reklam gosterebiliyor.
 */
export function oyunBasladi() {
  if (oynaniyor) return;
  oynaniyor = true;
  dene(() => sdk.game.gameplayStart());
}

export function oyunDurdu() {
  if (!oynaniyor) return;
  oynaniyor = false;
  dene(() => sdk.game.gameplayStop());
}

/** Keyif ani: kazanma, vezir alma gibi. Portal one cikarma icin kullaniyor. */
export function keyifAni() { dene(() => sdk.game.happytime()); }

/**
 * Reklam gosterir. Cozulen deger reklamin BITIP bitmedigi.
 *
 * !! Odul YALNIZCA `adFinished`'da verilmeli, `adError`'da asla -- dokumanin
 *    acik kurali. Burada `false` donmek "odul yok" demek.
 *
 * Ses/oyun duraklatmasi cagiranin isi degil, burada yapiliyor: her cagri
 * yerinde unutulabilecek bir sey ve unutulursa reklam sirasinda oyun sesi
 * calmaya devam ediyor (portalin reddetme sebeplerinden).
 */
export async function reklamIste(tur, { sustur, ac } = {}) {
  if (!sdk) return false;
  // Midgame icin portalin onerdigi aralik 3 dakika; erken istemek `adCooldown`
  // hatasi ve bosa giden bir bekleme demek, bastan istemiyoruz.
  if (tur === "midgame" && Date.now() - sonReklam < 3 * 60 * 1000) return false;

  return new Promise((coz) => {
    let bitti = false;
    const kapat = (deger) => { if (!bitti) { bitti = true; ac?.(); coz(deger); } };
    try {
      sdk.ad.requestAd(tur, {
        adStarted: () => { sustur?.(); },
        adFinished: () => { sonReklam = Date.now(); kapat(true); },
        adError: (e) => { console.warn("[portal] reklam", e); kapat(false); },
      });
    } catch (e) {
      console.warn("[portal] reklam istegi", e);
      kapat(false);
    }
  });
}
