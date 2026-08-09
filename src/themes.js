import * as THREE from "three";
import { BOARD_MATERIALS } from "./board.js";
import { PIECE_MATERIALS } from "./pieces.js";

/**
 * Renk temalari. Her tema hem tahtayi hem taslari hem de arka plani belirler.
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
  },
  mermer: {
    label: "Mermer",
    light: 0xf1f0ec,
    dark: 0x8d9299,
    frame: 0x4a4f55,
    white: 0xfbfaf7,
    black: 0x2e343b,
    bg: 0x1b1e22,
  },
  ceviz: {
    label: "Ceviz",
    light: 0xd9b98c,
    dark: 0x5d3a1f,
    frame: 0x33200f,
    white: 0xf6e6cd,
    black: 0x2b1c11,
    bg: 0x14100c,
  },
  gece: {
    label: "Gece",
    light: 0x3d4a5c,
    dark: 0x1e2632,
    frame: 0x121821,
    white: 0x7fe3ff,
    black: 0xff5f8a,
    bg: 0x080b10,
  },
  orman: {
    label: "Orman",
    light: 0xdfe4cf,
    dark: 0x4a6141,
    frame: 0x27331f,
    white: 0xf4f7ea,
    black: 0x22301d,
    bg: 0x101610,
  },
  kum: {
    label: "Kum",
    light: 0xf0e2c4,
    dark: 0xc08f5a,
    frame: 0x6d4a2a,
    white: 0xfff6e4,
    black: 0x4a3320,
    bg: 0x1d1712,
  },
};

export function applyTheme(scene, name) {
  const t = THEMES[name] ?? THEMES.klasik;
  BOARD_MATERIALS.light.color.setHex(t.light);
  BOARD_MATERIALS.dark.color.setHex(t.dark);
  BOARD_MATERIALS.frame.color.setHex(t.frame);
  PIECE_MATERIALS.w.color.setHex(t.white);
  PIECE_MATERIALS.b.color.setHex(t.black);
  scene.background = new THREE.Color(t.bg);
  return t;
}
