import { THEMES, applyTheme } from "./themes.js";
import { DUEL_MODES } from "./finishers.js";

const STORE_KEY = "satranc3d.settings";

const DEFAULTS = {
  theme: "klasik",
  cinematic: true,
  // "insan" = ayni ekranda iki kisi; digerleri motor seviyeleri
  opponent: "orta",
  playerColor: "w",
  // Yeme sahnesinin uzunlugu: tam dovus guzel ama her hamlede 4 sn suruyor
  duel: "kisa",
  // Satranc saati tempolari: timer.js TEMPOLAR. Varsayilan KAPALI --
  // saat, isteyenin actigi bir kisitlama olmali; oyunu ilk kez acan
  // birine dayatilirsa oynanis degil sinav olur.
  tempo: "yok",
  // --- sessiz zorluk uyarlamasi ---
  // seri: +n ust uste galibiyet, -n ust uste yenilgi. bias: motora giden
  // yumusatma (-2..+2). Oyuncuya HIC gosterilmiyor; "zorluk dusuruldu" yazisi
  // oyuncuyu asagilar ve tam da kaybetmemek istedigimiz anda kaybettirir.
  seri: 0,
  bias: 0,
  // Ilk oturumda motor "Orta" ile basliyordu: derinlik 5, sirdan bir oyuncuyu
  // eziyor ve ilk izlenim "beni ezdi" oluyordu. Ilk oyun yumusak baslar,
  // oyuncu kazanirsa uyarlama zaten sertlestirir.
  ilkOyun: true,
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  save(settings);
}

function save(settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* gizli sekmede localStorage kapali olabilir -- sessizce gec */
  }
}

/**
 * Ayarlar paneli + tahta dondurme aparati.
 * Panel sag ustte acilip kapaniyor, dondurme kumandasi sag altta sabit.
 */
export function createUI({ scene, rig, settings, clock, onOpponentChange }) {
  const root = document.getElementById("ui");

  // --- dondurme aparati (sag alt) -------------------------------------
  const dock = document.createElement("div");
  dock.className = "dock";
  dock.innerHTML = `
    <button data-rot="-1" title="Rotate left">&#8630;</button>
    <button data-view="beyaz" title="White side">W</button>
    <button data-view="ustten" title="Top-down">&#9633;</button>
    <button data-view="siyah" title="Black side">B</button>
    <button data-rot="1" title="Rotate right">&#8631;</button>
    <button data-spin="1" title="Auto-rotate" class="spin">&#8635;</button>
  `;
  dock.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.rot) rig.step(Number(b.dataset.rot));
    if (b.dataset.view) rig.preset(b.dataset.view);
    if (b.dataset.spin) {
      const on = !b.classList.contains("active");
      b.classList.toggle("active", on);
      rig.setSpin(on ? 0.25 : 0);
    }
  });
  root.appendChild(dock);

  // --- ayarlar paneli (sag ust) ---------------------------------------
  const toggle = document.createElement("button");
  toggle.className = "gear";
  toggle.innerHTML = "&#9881;";
  toggle.title = "Settings";
  root.appendChild(toggle);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;

  const swatches = Object.entries(THEMES)
    .map(
      ([key, t]) => `
      <button class="swatch" data-theme="${key}" title="${t.label}">
        <span class="chip">
          <i style="background:#${t.dark.toString(16).padStart(6, "0")}"></i>
          <i style="background:#${t.light.toString(16).padStart(6, "0")}"></i>
          <i style="background:#${t.white.toString(16).padStart(6, "0")}"></i>
          <i style="background:#${t.black.toString(16).padStart(6, "0")}"></i>
        </span>
        <span class="name">${t.label}</span>
      </button>`
    )
    .join("");

  panel.innerHTML = `
    <h3>Opponent</h3>
    <div class="seg seg5" id="opponent">
      <button data-opp="insan">Human</button>
      <button data-opp="kolay">Easy</button>
      <button data-opp="orta">Medium</button>
      <button data-opp="zor">Hard</button>
      <button data-opp="usta">Master</button>
    </div>
    <div class="seg" id="side">
      <button data-side="w">Play White</button>
      <button data-side="b">Play Black</button>
    </div>
    <h3>Board theme</h3>
    <div class="swatches">${swatches}</div>
    <h3>Finisher</h3>
    <div class="seg" id="duel">
      ${Object.entries(DUEL_MODES)
        .map(([key, label]) => `<button data-duel="${key}">${label}</button>`)
        .join("")}
    </div>
    <h3>Camera</h3>
    <label class="row">
      <input type="checkbox" id="cinematic" ${settings.cinematic ? "checked" : ""}>
      <span>Cinematic camera on captures</span>
    </label>
    <p class="hint">Drag the board to look around · pinch or scroll to zoom.</p>
  `;
  root.appendChild(panel);

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });

  const markActive = () => {
    panel.querySelectorAll(".swatch").forEach((s) => {
      s.classList.toggle("active", s.dataset.theme === settings.theme);
    });
    panel.querySelectorAll("[data-opp]").forEach((b) => {
      b.classList.toggle("active", b.dataset.opp === settings.opponent);
    });
    // Iki kisi oynarken taraf secimi anlamsiz
    panel.querySelector("#side").hidden = settings.opponent === "insan";
    panel.querySelectorAll("[data-side]").forEach((b) => {
      b.classList.toggle("active", b.dataset.side === settings.playerColor);
    });
    panel.querySelectorAll("[data-duel]").forEach((b) => {
      b.classList.toggle("active", b.dataset.duel === settings.duel);
    });
  };

  panel.addEventListener("click", (e) => {
    const s = e.target.closest(".swatch");
    if (s) {
      settings.theme = s.dataset.theme;
      applyTheme(scene, settings.theme, clock);
      markActive();
      save(settings);
      return;
    }

    // Dovus uzunlugu sadece gorsel; motora dokunmuyor, o yuzden ayri
    if (e.target.closest("[data-duel]")) {
      settings.duel = e.target.closest("[data-duel]").dataset.duel;
      markActive();
      save(settings);
      return;
    }

    const b = e.target.closest("[data-opp], [data-side]");
    if (!b) return;
    if (b.dataset.opp) settings.opponent = b.dataset.opp;
    if (b.dataset.side) settings.playerColor = b.dataset.side;
    markActive();
    save(settings);
    onOpponentChange?.();
  });

  panel.querySelector("#cinematic").addEventListener("change", (e) => {
    settings.cinematic = e.target.checked;
    save(settings);
  });

  applyTheme(scene, settings.theme, clock);
  markActive();

  return { panel, dock };
}
