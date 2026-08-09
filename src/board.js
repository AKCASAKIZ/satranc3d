import * as THREE from "three";

export const SQUARE = 1.0;
export const FILES = "abcdefgh";

/**
 * Tahta materyalleri modul seviyesinde paylasiliyor -- ayarlar panelinden
 * tema degistirince tek yerden renk guncellemek icin.
 */
export const BOARD_MATERIALS = {
  light: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x6f5842, roughness: 0.85 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x3b2d22, roughness: 0.9 }),
};

/**
 * Kare adi ("e4") -> dunya koordinati.
 * Beyaz +Z tarafinda oturur ve -Z yonune bakar; a1 sol-on kose.
 */
export function squareToWorld(square) {
  const file = FILES.indexOf(square[0]);
  const rank = parseInt(square[1], 10) - 1;
  return new THREE.Vector3(file - 3.5, 0, 3.5 - rank);
}

export function worldToSquare(point) {
  const file = Math.round(point.x + 3.5);
  const rank = Math.round(3.5 - point.z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return FILES[file] + (rank + 1);
}

export function createBoard() {
  const group = new THREE.Group();
  group.name = "board";

  const geo = new THREE.BoxGeometry(SQUARE, 0.12, SQUARE);

  // Kareler tek tek mesh -- secim vurgusu ve ileride kare bazli efektler icin
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const isLight = (f + r) % 2 === 1;
      const mesh = new THREE.Mesh(geo, isLight ? BOARD_MATERIALS.light : BOARD_MATERIALS.dark);
      mesh.position.set(f - 3.5, -0.06, 3.5 - r);
      mesh.receiveShadow = true;
      mesh.userData.square = FILES[f] + (r + 1);
      group.add(mesh);
    }
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.1, 8.8), BOARD_MATERIALS.frame);
  frame.position.y = -0.13;
  frame.receiveShadow = true;
  group.add(frame);

  return group;
}

/** Secili kare ve gecerli hamle hedeflerini gosteren isaretci havuzu. */
export function createHighlights() {
  const group = new THREE.Group();
  group.name = "highlights";

  const make = (color, radius, opacity) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    group.add(m);
    return m;
  };

  const selected = make(0x66ff99, 0.46, 0.45);
  const moves = Array.from({ length: 32 }, () => make(0x66ccff, 0.16, 0.75));
  const captures = Array.from({ length: 32 }, () => make(0xff5544, 0.44, 0.55));

  return {
    group,
    show(fromSquare, targets) {
      this.clear();
      if (fromSquare) {
        selected.visible = true;
        selected.position.copy(squareToWorld(fromSquare)).setY(0.011);
      }
      let mi = 0;
      let ci = 0;
      for (const t of targets) {
        const pool = t.capture ? captures : moves;
        const idx = t.capture ? ci++ : mi++;
        const marker = pool[idx];
        if (!marker) continue;
        marker.visible = true;
        marker.position.copy(squareToWorld(t.square)).setY(0.012);
      }
    },
    clear() {
      selected.visible = false;
      for (const m of moves) m.visible = false;
      for (const c of captures) c.visible = false;
    },
  };
}
