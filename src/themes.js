import * as THREE from "three";
import { BOARD_MATERIALS } from "./board.js";
import { applyPieceColors } from "./pieces.js";
import { applyEnvironment } from "./env.js";

/**
 * Renk temalari. Her tema hem tahtayi hem taslari hem arka plani hem de
 * CEVREYI (tahtanin durdugu yer) belirler.
 *
 * Cevre ayri bir secici DEGIL, bilerek: iki ayri secici birakilsaydi oyuncu
 * okunmaz kombinasyonlar kurabilirdi (parlak cevre + dusuk kontrastli tahta).
 * Tek secici, tasarim kuralini koruyor.
 * Kural: acik/koyu tas kontrasti her temada yuksek kalmali, yoksa tahta
 * okunmaz hale gelir -- projenin ana tasarim kurali bu.
 */
export const THEMES = {
  klasik: {
    label: "Klasik",
    light: 0xe8dcc0,
    dark: 0x6f5842,
    frame: 0x3b2d22,
    white: 0xf2ece0,
    black: 0x33302b,
    bg: 0x151719,
    // Bosluk: varsayilan. Sadece hafif sis, silueti yok -
    // taniyacaklari ilk gorunum sade kalsin.
    env: { sis: { renk: 0x151719, yakin: 16, uzak: 46 }, zemin: 0x0d0f11 },
  },
  mermer: {
    label: "Mermer",
    light: 0xf1f0ec,
    dark: 0x8d9299,
    frame: 0x4a4f55,
    white: 0xfbfaf7,
    black: 0x2e343b,
    bg: 0x1b1e22,
    // Saolin avlusu: uzakta tas sutunlar, sabah sisi
    env: { sis: { renk: 0x1b1e22, yakin: 13, uzak: 40 }, zemin: 0x14171a,
           siluet: { tur: "sutun", renk: 0x2a2f36, sayi: 18, mesafe: 15 } },
  },
  ceviz: {
    label: "Ceviz",
    light: 0xd9b98c,
    dark: 0x5d3a1f,
    frame: 0x33200f,
    white: 0xf6e6cd,
    black: 0x2b1c11,
    bg: 0x14100c,
    // Dag tepesi: uzak zirveler, kalin sis (bulut denizi)
    env: { sis: { renk: 0x14100c, yakin: 11, uzak: 34 }, zemin: 0x0e0b08,
           siluet: { tur: "zirve", renk: 0x231a12, sayi: 12, mesafe: 19 },
           cim: { dip: 0x2e281c, uc: 0x554832, sayi: 16000, yaricap: 13 } },
  },
  gece: {
    label: "Gece",
    light: 0x3d4a5c,
    dark: 0x1e2632,
    frame: 0x121821,
    white: 0x7fe3ff,
    black: 0xff5f8a,
    bg: 0x080b10,
    // Gece tapinagi: fenerler, koyu mavi, derin sis
    env: { sis: { renk: 0x080b10, yakin: 10, uzak: 32 }, zemin: 0x05070b,
           siluet: { tur: "sutun", renk: 0x121a26, sayi: 14, mesafe: 14 },
           fener: { sayi: 10, mesafe: 12, renk: 0xff9d5c } },
  },
  orman: {
    label: "Orman",
    light: 0xdfe4cf,
    dark: 0x4a6141,
    frame: 0x27331f,
    white: 0xf4f7ea,
    black: 0x22301d,
    bg: 0x101610,
    // Bambu ormani: dikey siluetler, yesilimsi sis
    env: { sis: { renk: 0x101610, yakin: 9, uzak: 30 }, zemin: 0x0b100b,
           siluet: { tur: "bambu", renk: 0x1b2a1b, sayi: 40, mesafe: 11 },
           cim: { dip: 0x28382a, uc: 0x4a6642, sayi: 22000, yaricap: 14 } },
  },
  kum: {
    label: "Kum",
    light: 0xf0e2c4,
    dark: 0xc08f5a,
    frame: 0x6d4a2a,
    white: 0xfff6e4,
    black: 0x4a3320,
    bg: 0x1d1712,
    // Col: bos ufuk, sicak sis, siluet yok
    env: { sis: { renk: 0x1d1712, yakin: 15, uzak: 44 }, zemin: 0x15100b },
  },
};

export function applyTheme(scene, name, clock) {
  const t = THEMES[name] ?? THEMES.klasik;
  BOARD_MATERIALS.light.color.setHex(t.light);
  BOARD_MATERIALS.dark.color.setHex(t.dark);
  BOARD_MATERIALS.frame.color.setHex(t.frame);
  // Sadece govde (mermer/obsidyen) boyaniyor; bronz ve koyu metal aksesuar
  // olarak kaliyor, yoksa silah da tas rengine karisip siluet kayboluyor.
  applyPieceColors(t.white, t.black);
  scene.background = new THREE.Color(t.bg);
  applyEnvironment(scene, t.env, clock);
  return t;
}
