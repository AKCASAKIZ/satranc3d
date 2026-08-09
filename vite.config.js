import fs from "node:fs";
import path from "node:path";

const OUT_ROOT = path.resolve("out/clips");

/**
 * Klip kayit modunun (src/record.js) diske yazma ucu.
 *
 * Tarayicidan dosya yazmanin baska yolu yok: indirme klasoru headless
 * Chrome'da guvenilir degil ve kare sirasi garanti edilemiyor. Bu yuzden
 * her kare dev sunucusuna POST ediliyor, burasi sirayla diske koyuyor.
 *
 * Sadece dev sunucusunda var; uretim derlemesine hicbir sey sizmiyor.
 */
function clipRecorder() {
  return {
    name: "satranc3d-clip-recorder",
    apply: "serve",
    configureServer(server) {
      const body = (req) =>
        new Promise((resolve, reject) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        });

      // Klip adi dosya yoluna giriyor -- disaridan gelen metin, siniri dar tut
      const dirFor = (name) => {
        const safe = String(name || "clip").replace(/[^a-z0-9_-]/gi, "");
        if (!safe) throw new Error("gecersiz klip adi");
        const dir = path.join(OUT_ROOT, safe);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      };

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__clip/")) return next();
        if (req.method !== "POST") return next();

        try {
          const url = new URL(req.url, "http://localhost");
          const name = url.searchParams.get("name");
          const data = await body(req);

          if (url.pathname === "/__clip/frame") {
            const i = url.searchParams.get("i") || "00000";
            fs.writeFileSync(path.join(dirFor(name), `f_${i}.png`), data);
          } else if (url.pathname === "/__clip/audio") {
            fs.writeFileSync(path.join(dirFor(name), "audio.wav"), data);
          } else if (url.pathname === "/__clip/done") {
            fs.writeFileSync(path.join(dirFor(name), "meta.json"), data);
            server.config.logger.info(`[klip] ${name} kareleri yazildi`);
          } else if (url.pathname === "/__clip/finished") {
            fs.mkdirSync(OUT_ROOT, { recursive: true });
            // make_clip.sh bu dosyayi bekliyor; Chrome'u ne zaman
            // kapatacagini baska turlu bilemiyor.
            fs.writeFileSync(path.join(OUT_ROOT, "FINISHED"), data);
            server.config.logger.info("[klip] kayit bitti");
          } else {
            return next();
          }

          res.statusCode = 204;
          res.end();
        } catch (err) {
          server.config.logger.error("[klip] " + err.message);
          res.statusCode = 500;
          res.end(err.message);
        }
      });
    },
  };
}

export default {
  // pieces.glb ve onizleme render'lari dogrudan servis edilsin
  publicDir: "assets",
  plugins: [clipRecorder()],
  server: {
    // host:true olmazsa Vite sadece [::1]'e baglaniyor ve Chrome'un
    // IPv4 localhost cozumlemesi basarisiz oluyor. Ayrica mobil test icin sart.
    host: true,
    port: 5180,
  },
};
