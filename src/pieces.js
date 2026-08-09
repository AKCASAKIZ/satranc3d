import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { squareToWorld } from "./board.js";

// chess.js tas kodu -> pieces.glb icindeki mesh adi
const MESH_NAME = {
  p: "pawn",
  r: "rook",
  n: "knight",
  b: "bishop",
  q: "queen",
  k: "king",
};

/** Tas materyalleri paylasiliyor -- ayarlardan tema degistirmek icin. */
export const PIECE_MATERIALS = {
  w: new THREE.MeshStandardMaterial({
    color: 0xf2ece0,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
  }),
  b: new THREE.MeshStandardMaterial({
    color: 0x33302b,
    roughness: 0.6,
    metalness: 0.08,
    flatShading: true,
  }),
};

/** pieces.glb'yi bir kez yukleyip prototip geometrileri cikarir. */
export async function loadPieceGeometries(url = "/pieces.glb") {
  const gltf = await new GLTFLoader().loadAsync(url);
  const geometries = {};
  gltf.scene.traverse((o) => {
    if (o.isMesh) geometries[o.name] = o.geometry;
  });

  const missing = Object.values(MESH_NAME).filter((n) => !geometries[n]);
  if (missing.length) {
    throw new Error(`pieces.glb icinde eksik mesh: ${missing.join(", ")}`);
  }
  return geometries;
}

/**
 * Tek bir tas mesh'i uretir. Geometri paylasilir, sadece transform ayrilir --
 * 32 tas icin 6 geometri yeterli.
 */
export function createPiece(geometries, type, color) {
  const mesh = new THREE.Mesh(geometries[MESH_NAME[type]], PIECE_MATERIALS[color]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.type = type;
  mesh.userData.color = color;
  // At tek yonlu tas ve duz siluetten uretiliyor. Rakibe baktirirsak oyuncu
  // sadece levhanin kalin kenarini gorur ve tas kutuya benzer. Bu yuzden
  // YANA bakiyor -- boylece iki oyuncu da at profilini goruyor.
  if (type === "n") {
    mesh.rotation.y = color === "w" ? 0 : Math.PI;
  }
  return mesh;
}

/**
 * Tahtadaki taslari chess.js durumuyla senkron tutar.
 * Basit ve saglam yaklasim: her hamleden sonra tam yeniden kurulum.
 * 32 mesh icin maliyeti ihmal edilebilir, durum kaymasi riski sifir.
 */
export class PieceSet {
  constructor(geometries) {
    this.geometries = geometries;
    this.group = new THREE.Group();
    this.group.name = "pieces";
    this.bySquare = new Map();
  }

  sync(board) {
    this.group.clear();
    this.bySquare.clear();

    for (const row of board) {
      for (const cell of row) {
        if (!cell) continue;
        const mesh = createPiece(this.geometries, cell.type, cell.color);
        mesh.position.copy(squareToWorld(cell.square));
        mesh.userData.square = cell.square;
        this.group.add(mesh);
        this.bySquare.set(cell.square, mesh);
      }
    }
  }

  at(square) {
    return this.bySquare.get(square) ?? null;
  }
}
