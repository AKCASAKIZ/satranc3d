import * as THREE from "three";

const TAU = Math.PI * 2;

/** En kisa yoldan aci farki -- 350 derece donmek yerine -10 derece donsun. */
function shortestDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * OrbitControls'un uzerine oturan kamera kumandasi.
 * Kullanici fareyle serbestce dondurebilir; bu sinif ayrica dugmelerle
 * yumusak gecisli hazir acilar ve 90 derecelik adim donusu sagliyor.
 * Kademe 1'de sinematik oldurus cekimi de buradan surulecek.
 */
export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.tween = null;
    this.spin = 0; // saniyede radyan; surekli donus modu
    this.shake = null; // Shake ornegi; main.js baglar
    this.saved = null; // sinematik cekim oncesi durus
  }

  get spherical() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    return s;
  }

  apply(s) {
    s.makeSafe();
    const offset = new THREE.Vector3().setFromSpherical(s);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  /** Hedef acilara yumusak gecis. Verilmeyen alanlar korunur. */
  moveTo({ azimuth, polar, radius, look }, duration = 700) {
    const start = this.spherical;
    const target = {
      theta: azimuth ?? start.theta,
      phi: polar ?? start.phi,
      radius: radius ?? start.radius,
    };
    const dTheta = shortestDelta(start.theta, target.theta);
    const t0 = performance.now();
    this.tween = {
      start,
      target,
      dTheta,
      t0,
      duration,
      lookFrom: this.controls.target.clone(),
      lookTo: look ? look.clone() : null,
    };
    return new Promise((resolve) => {
      this.tween.resolve = resolve;
    });
  }

  /**
   * Sinematik dalis: kamerayi belirli bir noktaya (yeme karesi) yaklastirir.
   * Onceki durusu saklar ki restore() geri getirebilsin.
   */
  focus(point, { azimuthOffset = -0.5, polar = Math.PI / 2.7, radius = 4.2, duration = 320 } = {}) {
    const s = this.spherical;
    this.saved = { theta: s.theta, phi: s.phi, radius: s.radius, look: this.controls.target.clone() };
    return this.moveTo(
      { azimuth: s.theta + azimuthOffset, polar, radius, look: point },
      duration
    );
  }

  /** focus() oncesindeki durusa don. */
  restore(duration = 520) {
    if (!this.saved) return Promise.resolve();
    const { theta, phi, radius, look } = this.saved;
    this.saved = null;
    return this.moveTo({ azimuth: theta, polar: phi, radius, look }, duration);
  }

  /** 90 derecelik adim donusu -- "tahtayi cevir" dugmeleri. */
  step(direction) {
    const s = this.spherical;
    const quarter = Math.PI / 2;
    const snapped = Math.round(s.theta / quarter) * quarter;
    return this.moveTo({ azimuth: snapped + direction * quarter }, 450);
  }

  /** Hazir bakis acilari. */
  preset(name) {
    const views = {
      beyaz: { azimuth: 0, polar: Math.PI / 3.4, radius: 12 },
      siyah: { azimuth: Math.PI, polar: Math.PI / 3.4, radius: 12 },
      ustten: { azimuth: 0, polar: 0.12, radius: 11.5 },
      yandan: { azimuth: Math.PI / 2, polar: Math.PI / 2.5, radius: 12 },
      sinematik: { azimuth: -0.6, polar: Math.PI / 2.9, radius: 9.5 },
    };
    const v = views[name];
    return v ? this.moveTo(v) : Promise.resolve();
  }

  setSpin(radiansPerSecond) {
    this.spin = radiansPerSecond;
  }

  update(dt) {
    let driven = false;

    // Onceki karenin sarsinti offseti geri alinmali, yoksa her karede
    // ustune eklenip kamera surekli kayiyor.
    if (this._shakeOffset) {
      this.camera.position.sub(this._shakeOffset);
      this._shakeOffset = null;
    }

    if (this.tween) {
      const { start, target, dTheta, t0, duration, lookFrom, lookTo } = this.tween;
      const k = Math.min(1, (performance.now() - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic

      if (lookTo) this.controls.target.lerpVectors(lookFrom, lookTo, e);

      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(start.radius, target.radius, e),
        THREE.MathUtils.lerp(start.phi, target.phi, e),
        start.theta + dTheta * e
      );
      this.apply(s);
      if (k >= 1) {
        this.tween.resolve?.();
        this.tween = null;
      }
      driven = true;
    } else if (this.spin !== 0) {
      const s = this.spherical;
      s.theta += this.spin * dt;
      this.apply(s);
      driven = true;
    }

    // Sarsinti kamera pozisyonuna ekleniyor, orbit durumunu bozmuyor --
    // bu yuzden tween bitince kamera dogru yerde kaliyor.
    if (this.shake) {
      const o = this.shake.update(dt);
      if (o) {
        this._shakeOffset = new THREE.Vector3(o.x, o.y, o.z);
        this.camera.position.add(this._shakeOffset);
        driven = true;
      }
    }

    return driven; // true ise OrbitControls bu kare devre disi
  }
}
