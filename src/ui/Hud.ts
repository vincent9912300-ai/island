/**
 * A quiet HUD: the name of the place you walk into, a time-of-day line, a one-time controls hint, and the photo
 * mode badge. Plus the checkpoint prompt / counter / toast and a small minimap of the island with the player
 * and the five checkpoints. Hidden in photo mode, with ?hud=0, or through the harness.
 */
import { SPOTS, COAST, WORLD_SIZE } from '../world/layout';
import { CHECKPOINT_SPOTS } from '../game/Checkpoints';

const PLACES: { name: string; label: string; r: number }[] = [
  { name: 'beach', label: 'Sunrise Beach', r: 120 },
  { name: 'jungle', label: 'The Jungle', r: 160 },
  { name: 'waterfall', label: 'The Falls', r: 60 },
  { name: 'village', label: 'Fishing Village', r: 110 },
  { name: 'cliffs', label: 'North Cliffs', r: 140 },
  { name: 'lighthouse', label: 'The Lighthouse', r: 45 },
];

const MAP = 168;

export class Hud {
  private root: HTMLDivElement;
  private place: HTMLDivElement;
  private clock: HTMLDivElement;
  private hint: HTMLDivElement;
  private badge: HTMLDivElement;
  private prompt: HTMLDivElement;
  private counter: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private map: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private current = '';
  private shown = true;
  private placeT = 0;
  private toastT = 0;

  constructor(visible: boolean) {
    const css = document.createElement('style');
    css.textContent = `
      #hud { position: fixed; inset: 0; pointer-events: none; z-index: 20; font: 500 13px/1.4 ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: #f4efe3; text-shadow: 0 1px 6px rgba(0,0,0,0.45); }
      #hud .place { position: absolute; left: 50%; top: 12%; transform: translateX(-50%); font: 400 30px/1 "Island Title", ui-serif, Georgia, serif; letter-spacing: 0.3em; opacity: 0; transition: opacity 1.2s ease; text-transform: uppercase; }
      #hud .clock { position: absolute; right: 26px; bottom: 22px; font-size: 12px; letter-spacing: 0.08em; opacity: 0.75; }
      #hud .hint { position: absolute; left: 26px; bottom: 22px; font-size: 12px; opacity: 0.8; transition: opacity 1.5s ease; max-width: 60ch; }
      #hud .badge { position: absolute; left: 50%; top: 22px; transform: translateX(-50%); font-size: 11px; letter-spacing: 0.25em; opacity: 0; transition: opacity 0.4s; }
      #hud .prompt { position: absolute; left: 50%; bottom: 15%; transform: translateX(-50%); font-size: 15px; letter-spacing: 0.06em; opacity: 0; transition: opacity 0.25s; background: rgba(8, 14, 12, 0.55); padding: 8px 18px; border-radius: 999px; border: 1px solid rgba(244, 239, 227, 0.18); }
      #hud .counter { position: absolute; right: 26px; bottom: 44px; font-size: 12px; letter-spacing: 0.12em; opacity: 0.85; }
      #hud .toast { position: absolute; left: 50%; top: 20%; transform: translateX(-50%); font-size: 15px; letter-spacing: 0.05em; opacity: 0; transition: opacity 0.35s; }
      #hud .minimap { position: absolute; right: 16px; top: 16px; width: ${MAP}px; height: ${MAP}px; border-radius: 10px; overflow: hidden; background: rgba(8, 14, 12, 0.55); border: 1px solid rgba(244, 239, 227, 0.16); }
    `;
    document.head.appendChild(css);
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.place = document.createElement('div');
    this.place.className = 'place';
    this.clock = document.createElement('div');
    this.clock.className = 'clock';
    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.textContent = 'Click to look around · WASD move · Shift sprint · Ctrl walk · Space jump · P photo mode · M mute';
    this.badge = document.createElement('div');
    this.badge.className = 'badge';
    this.badge.textContent = 'PHOTO MODE · WASD/QE fly · Shift fast · [ ] lens · P exit';
    this.prompt = document.createElement('div');
    this.prompt.className = 'prompt';
    this.prompt.textContent = 'Press L to light the checkpoint';
    this.counter = document.createElement('div');
    this.counter.className = 'counter';
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.map = document.createElement('canvas');
    this.map.className = 'minimap';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.map.width = MAP * dpr;
    this.map.height = MAP * dpr;
    this.map.style.width = `${MAP}px`;
    this.map.style.height = `${MAP}px`;
    this.mctx = this.map.getContext('2d')!;
    this.mctx.scale(dpr, dpr);
    this.root.append(this.place, this.clock, this.hint, this.badge, this.prompt, this.counter, this.toastEl, this.map);
    document.body.appendChild(this.root);
    this.show(visible);
    setTimeout(() => (this.hint.style.opacity = '0'), 14000);
  }

  show(v: boolean) {
    this.shown = v;
    this.root.style.display = v ? 'block' : 'none';
  }

  photo(on: boolean) {
    this.badge.style.opacity = on ? '0.85' : '0';
    this.place.style.display = this.clock.style.display = this.hint.style.display =
      this.prompt.style.display = this.counter.style.display = this.map.style.display = on ? 'none' : 'block';
    if (on) this.toastEl.style.opacity = '0';
  }

  toast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    this.toastT = 2.6;
  }

  update(
    dt: number,
    x: number,
    z: number,
    hour: number,
    weather: string,
    cp?: { lit: boolean[]; near: number; heading: number },
  ) {
    if (!this.shown) return;
    let best = '';
    let bd = 1e9;
    for (const p of PLACES) {
      const s = SPOTS.find((q) => q.name === p.name)!;
      const d = Math.hypot(x - s.player[0], z - s.player[1]);
      if (d < p.r && d < bd) {
        bd = d;
        best = p.label;
      }
    }
    if (best && best !== this.current) {
      this.current = best;
      this.place.textContent = best;
      this.place.style.opacity = '1';
      this.placeT = 4;
    } else if (!best) this.current = '';
    if (this.placeT > 0) {
      this.placeT -= dt;
      if (this.placeT <= 0) this.place.style.opacity = '0';
    }
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    this.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${weather}`;
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.style.opacity = '0';
    }
    if (cp) {
      this.prompt.style.opacity = cp.near >= 0 ? '1' : '0';
      const n = cp.lit.reduce((a, b) => a + (b ? 1 : 0), 0);
      this.counter.textContent = `CHECKPOINTS ${n}/${cp.lit.length}`;
      this.drawMap(x, z, cp);
    }
  }

  private drawMap(x: number, z: number, cp: { lit: boolean[]; near: number; heading: number }) {
    const ctx = this.mctx;
    const half = WORLD_SIZE / 2;
    const toX = (wx: number) => ((wx + half) / WORLD_SIZE) * MAP;
    const toY = (wz: number) => ((wz + half) / WORLD_SIZE) * MAP;
    ctx.clearRect(0, 0, MAP, MAP);
    ctx.beginPath();
    COAST.forEach((c, i) => {
      const px = toX(c.p[0]), py = toY(c.p[1]);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(46, 74, 44, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(226, 214, 170, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let i = 0; i < CHECKPOINT_SPOTS.length; i++) {
      const s = CHECKPOINT_SPOTS[i];
      const cx = toX(s.player[0]), cy = toY(s.player[1]);
      ctx.beginPath();
      ctx.arc(cx, cy, cp.lit[i] ? 4 : 3, 0, Math.PI * 2);
      if (cp.lit[i]) {
        ctx.fillStyle = '#ffc36b';
        ctx.shadowColor = '#ffb060';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = 'rgba(244, 239, 227, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (cp.near === i) {
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.stroke();
      }
    }
    ctx.save();
    ctx.translate(toX(x), toY(z));
    ctx.rotate(cp.heading);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
