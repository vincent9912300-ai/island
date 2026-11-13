/**
 * The five trail checkpoints: a small stone cairn whose orb you light by standing next to it and pressing L.
 * Lit state persists in localStorage; the HUD shows the prompt, the count and the minimap markers.
 */
import * as THREE from 'three/webgpu';
import { SPOTS } from '../world/layout';
import { uniform, vec3, type N } from '../core/tsl';
import type { Heightfield } from '../world/Heightfield';
import type { Input } from '../player/Input';

const KEY = 'island.checkpoints.v1';
const RADIUS = 5;

export const CHECKPOINT_SPOTS = SPOTS.filter((s) => s.name.startsWith('checkpoint-'));

interface Marker {
  u: N;
  light: THREE.PointLight;
  phase: number;
}

export class Checkpoints {
  readonly points: { x: number; z: number }[];
  readonly lit: boolean[];
  /** index of the nearest unlit checkpoint within reach, or -1 */
  near = -1;
  onToast: ((msg: string) => void) | null = null;
  private markers: Marker[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, hf: Heightfield) {
    this.points = CHECKPOINT_SPOTS.map((s) => ({ x: s.player[0], z: s.player[1] }));
    this.lit = this.load();
    const stone = new THREE.MeshStandardMaterial({ color: 0x7a736a, roughness: 0.95 });
    const orbGeo = new THREE.SphereGeometry(0.16, 16, 12);
    for (let i = 0; i < this.points.length; i++) {
      const { x, z } = this.points[i];
      const g = new THREE.Group();
      g.position.set(x, hf.height(x, z), z);
      let y = 0;
      for (const [r, h] of [[0.42, 0.18], [0.32, 0.16], [0.22, 0.14]] as const) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 7), stone);
        m.position.y = y + h / 2;
        m.rotation.y = i * 1.7 + y * 3;
        g.add(m);
        y += h;
      }
      const u = uniform(this.lit[i] ? 1 : 0);
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.colorNode = vec3(1.0, 0.74, 0.4).mul(u.mul(14).add(0.045));
      const orb = new THREE.Mesh(orbGeo, mat);
      orb.position.y = y + 0.22;
      orb.castShadow = false;
      g.add(orb);
      const light = new THREE.PointLight(0xffb060, 0, 18, 2);
      light.position.y = y + 0.3;
      light.castShadow = false;
      g.add(light);
      scene.add(g);
      this.markers.push({ u, light, phase: i * 1.3 });
    }
    this.applyUniforms(0);
  }

  get litCount(): number {
    return this.lit.reduce((n, v) => n + (v ? 1 : 0), 0);
  }

  update(dt: number, px: number, pz: number, input: Input) {
    this.t += dt;
    this.near = -1;
    let bd = RADIUS;
    for (let i = 0; i < this.points.length; i++) {
      if (this.lit[i]) continue;
      const d = Math.hypot(px - this.points[i].x, pz - this.points[i].z);
      if (d < bd) {
        bd = d;
        this.near = i;
      }
    }
    if (this.near >= 0 && input.hit('KeyL')) this.light(this.near);
    this.applyUniforms(dt);
  }

  private applyUniforms(dt: number) {
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      const target = this.lit[i] ? 1 : 0;
      m.u.value += (target - m.u.value) * (dt === 0 ? 1 : Math.min(1, dt * 5));
      const k = m.u.value as number;
      m.light.intensity = k * (10 + Math.sin(this.t * 2.2 + m.phase) * 2 * k);
    }
  }

  private light(i: number) {
    if (this.lit[i]) return;
    this.lit[i] = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.lit));
    } catch { /* private mode */ }
    const n = this.litCount;
    this.onToast?.(n === this.points.length ? 'All 5 checkpoints lit!' : `Checkpoint lit · ${n}/${this.points.length}`);
  }

  private load(): boolean[] {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      if (Array.isArray(v) && v.length === this.points.length) return v.map(Boolean);
    } catch { /* corrupted */ }
    return this.points.map(() => false);
  }
}
