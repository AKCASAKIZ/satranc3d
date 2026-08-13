/**
 * Service worker — PWA ("ana ekrana ekle") ve ilk ziyaretten sonra cevrimdisi
 * oynanabilme icin.
 *
 * !! BILEREK NETWORK-FIRST, cache-first DEGIL. Klasik PWA tarifi cache-first
 *    diyor ve daha hizli; ama bu oyun GitHub Pages'te her push'ta yeniden
 *    yayinlaniyor. Cache-first ile bir kez ugrayan ziyaretci, cache adi elle
 *    yukseltilene kadar ESKI SURUMDE cakili kalir. Surum numarasini her
 *    derlemede elle artirmayi unutmak kacinilmaz; unutuldugunda ortaya cikan
 *    hata da en kotu turden: bizde duzelmis, kullanicida duruyor.
 *    Bu yuzden ag once deneniyor, cache yalnizca AG YOKSA devreye giriyor.
 *
 * !! Yalnizca AYNI KAYNAK istekleri gecer. CrazyGames SDK'si ucuncu taraf
 *    (sdk.crazygames.com) ve portal onu kendi surumleme mantigiyla servis
 *    ediyor; araya girmek reklam/olcum tarafini sessizce bozabilir.
 *
 * !! Dev sunucusunun klip yazma ucu (/__clip/) hic dokunulmadan geciyor.
 *    Kayit modu her kareyi POST ediyor; araya giren bir worker klip hattini
 *    ayiklanmasi zor bicimde bozardi.
 */

const CACHE = "kungfu-chess-v1";

self.addEventListener("install", (e) => {
  // Onbellek onceden doldurulmuyor: 12 MB GLB'yi kurulumda cekmek ilk acilisi
  // yavaslatir ve oyuncu belki hic cevrimdisi kalmayacak. Ne oynandiysa o
  // birikiyor.
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const ad of await caches.keys()) {
        if (ad !== CACHE) await caches.delete(ad);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/__clip/")) return;

  e.respondWith(
    (async () => {
      try {
        const yanit = await fetch(request);
        // Yalnizca saglam yanitlar saklaniyor; 404'u onbellege koymak
        // cevrimdisi modda kalici bir 404 uretir.
        if (yanit && yanit.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, yanit.clone());
        }
        return yanit;
      } catch (err) {
        const vurgu = await caches.match(request);
        if (vurgu) return vurgu;
        throw err;
      }
    })(),
  );
});
