/**
 * GraphEngine — imperative renderer for the living multiverse graph.
 *
 * React declares WHAT exists (node + edge specs); the engine owns WHERE things
 * are and HOW they move: spring physics, camera, canvas edges/particles, and
 * the fork choreography. Positions are written straight to DOM transforms each
 * frame, so typing in a text field or receiving an API response never
 * re-renders the graph, and graph motion never re-renders React.
 */

export type NodeType = "target" | "event" | "assumption" | "pending" | "verse" | "forecast" | "disagreement";
export type EdgeKind = "assumed" | "inherited" | "pending" | "inferred" | "correlation" | "lineage" | "lineage-active" | "forecast-up" | "forecast-down" | "forecast" | "contradiction";

export interface NodeSpec {
  id: string;
  type: NodeType;
  ax: number;
  ay: number;
  r: number; // collision radius (world units)
  hue?: number;
  pinned?: boolean; // verse nodes: anchored hard
  draggable?: boolean;
}
export interface EdgeSpec {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

interface SimNode extends NodeSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  born: number;
  stagger: number;
  el?: HTMLElement | null;
  rx: number; // rendered position (with idle drift + choreography)
  ry: number;
  lastT?: string;
  dying?: number;
}

interface Pulse {
  edge: string;
  t: number;
  speed: number;
  life: number;
}

interface Star {
  x: number;
  y: number;
  z: number; // depth 0.15..1
  a: number;
}

interface Branch {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  len: number;
  fork: number;
}

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export interface ForkChoreo {
  from: { x: number; y: number };
  to: { x: number; y: number };
  converge: string[]; // node ids pulled into the target
  reduced: boolean;
  onPhase: (p: "commit" | "converge" | "rupture" | "travel" | "arrive" | "reveal") => void;
}

const COLORS = {
  bg: "#050505",
  accent: [124, 214, 255] as const, // icy cyan
  up: [126, 219, 182] as const,
  down: [240, 160, 160] as const,
  warn: [232, 194, 122] as const,
  white: [235, 238, 245] as const,
};

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;

export class GraphEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private world: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  nodes = new Map<string, SimNode>();
  private edges: EdgeSpec[] = [];
  private adjacency = new Map<string, Set<string>>();
  private spawnHints = new Map<string, { x: number; y: number }>();
  private pulses: Pulse[] = [];
  private stars: Star[] = [];
  private branches: Branch[] = [];

  cam: Camera = { x: 0, y: 0, k: 1 };
  private camTarget: Camera = { x: 0, y: 0, k: 1 };
  private flight: { from: Camera; to: Camera; start: number; dur: number; dip: number } | null = null;
  private inertia = { vx: 0, vy: 0 };

  hover: string | null = null;
  focusCluster: { x: number; y: number } = { x: 0, y: 0 };
  private dragging: { id: string; ox: number; oy: number; moved: boolean } | null = null;
  private panning: { sx: number; sy: number; cx: number; cy: number; lx: number; ly: number; lt: number; moved: boolean } | null = null;

  // choreography state
  private fx = { converge: 0, flash: 0, warp: 0, shake: 0, worldFade: 1, worldScale: 1, travel: 0, branch: 0, dimStars: 0 };
  private convergeSet = new Set<string>();
  private ambient = 1;
  reduced = false;
  private frameSubs = new Set<() => void>();
  private zoomBand = "";

  onNodeDragMove?: (id: string, sx: number, sy: number) => void;
  onNodeDrop?: (id: string, sx: number, sy: number) => boolean; // return true if consumed
  onNodeClick?: (id: string, e: PointerEvent) => void;
  onNodeDoubleClick?: (id: string) => void;
  onBackgroundClick?: () => void;

  constructor() {
    for (let i = 0; i < 230; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), z: 0.12 + Math.pow(Math.random(), 2) * 0.88, a: 0.25 + Math.random() * 0.6 });
    }
    for (let i = 0; i < 46; i++) this.branches.push(this.makeBranch(Math.random()));
  }

  private makeBranch(z: number): Branch {
    const a = Math.random() * Math.PI * 2;
    const r = 0.15 + Math.random() * 0.9;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, z, dx: Math.cos(a), dy: Math.sin(a), len: 0.12 + Math.random() * 0.25, fork: Math.random() };
  }

  /* ---------------- lifecycle ---------------- */

  mount(root: HTMLElement, canvas: HTMLCanvasElement, world: HTMLElement) {
    this.root = root;
    this.canvas = canvas;
    this.world = world;
    this.ctx = canvas.getContext("2d");
    this.resize();
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.step(dt, t);
      this.render(t);
      for (const f of this.frameSubs) f();
    };
    this.raf = requestAnimationFrame(loop);
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    this.canvas = this.ctx = this.world = this.root = null;
  }

  resize() {
    if (!this.canvas || !this.root) return;
    const r = this.root.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
  }

  onFrame(f: () => void) {
    this.frameSubs.add(f);
    return () => {
      this.frameSubs.delete(f);
    };
  }

  /* ---------------- graph data ---------------- */

  setGraph(specs: NodeSpec[], edges: EdgeSpec[]) {
    const now = performance.now();
    const keep = new Set(specs.map((s) => s.id));
    let born = 0;
    for (const s of specs) {
      const n = this.nodes.get(s.id);
      if (n) {
        Object.assign(n, s);
        n.dying = undefined;
      } else {
        const hint = this.spawnHints.get(s.id);
        this.spawnHints.delete(s.id);
        const start = hint ?? { x: s.ax + (Math.random() - 0.5) * 30, y: s.ay + (Math.random() - 0.5) * 30 };
        this.nodes.set(s.id, {
          ...s,
          x: start.x,
          y: start.y,
          vx: 0,
          vy: 0,
          phase: Math.random() * Math.PI * 2,
          born: now,
          stagger: hint ? 0 : born++ * 45,
          rx: start.x,
          ry: start.y,
          el: this.nodes.get(s.id)?.el ?? this.pendingEls.get(s.id) ?? null,
        });
      }
    }
    for (const [id] of this.nodes) if (!keep.has(id)) this.nodes.delete(id);
    this.edges = edges;
    this.adjacency.clear();
    for (const e of edges) {
      if (!this.adjacency.has(e.from)) this.adjacency.set(e.from, new Set());
      if (!this.adjacency.has(e.to)) this.adjacency.set(e.to, new Set());
      this.adjacency.get(e.from)!.add(e.to);
      this.adjacency.get(e.to)!.add(e.from);
    }
  }

  neighbors(id: string) {
    return this.adjacency.get(id) ?? new Set<string>();
  }

  private pendingEls = new Map<string, HTMLElement | null>();
  registerEl(id: string, el: HTMLElement | null) {
    const n = this.nodes.get(id);
    if (n) n.el = el;
    else this.pendingEls.set(id, el);
    if (el && n) this.applyNode(n, el);
  }

  spawnAt(id: string, sx: number, sy: number) {
    this.spawnHints.set(id, this.screenToWorld(sx, sy));
  }

  pulseEdgesOf(nodeId: string, count = 1) {
    for (const e of this.edges) {
      if (e.from === nodeId || e.to === nodeId) {
        for (let i = 0; i < count; i++) this.pulses.push({ edge: e.id, t: -i * 0.25, speed: 0.9 + Math.random() * 0.3, life: 1 });
      }
    }
  }

  /* ---------------- camera ---------------- */

  worldToScreen(x: number, y: number) {
    const c = this.cam;
    return { x: this.w / 2 + (x - c.x) * c.k, y: this.h / 2 + (y - c.y) * c.k };
  }
  screenToWorld(sx: number, sy: number) {
    const rect = this.root?.getBoundingClientRect();
    const lx = sx - (rect?.left ?? 0);
    const ly = sy - (rect?.top ?? 0);
    const c = this.cam;
    return { x: c.x + (lx - this.w / 2) / c.k, y: c.y + (ly - this.h / 2) / c.k };
  }
  nodeScreen(id: string) {
    const n = this.nodes.get(id);
    if (!n) return null;
    const rect = this.root?.getBoundingClientRect();
    const p = this.worldToScreen(n.rx, n.ry);
    return { x: p.x + (rect?.left ?? 0), y: p.y + (rect?.top ?? 0), r: n.r * this.cam.k };
  }

  flyTo(x: number, y: number, k: number, dur = 900) {
    if (this.reduced) dur = Math.min(dur, 1);
    k = Math.max(0.15, Math.min(2.6, k));
    const dist = Math.hypot(x - this.cam.x, y - this.cam.y) * Math.min(this.cam.k, k);
    const dip = Math.min(0.45, dist / (this.w * 3 || 3000));
    this.flight = { from: { ...this.cam }, to: { x, y, k }, start: performance.now(), dur, dip };
    this.camTarget = { x, y, k };
    this.inertia = { vx: 0, vy: 0 };
  }

  fitTo(points: { x: number; y: number }[], pad = 160, maxK = 1.15, dur = 900) {
    if (!points.length) return;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs) - pad,
      maxX = Math.max(...xs) + pad,
      minY = Math.min(...ys) - pad,
      maxY = Math.max(...ys) + pad;
    const k = Math.min(maxK, this.w / (maxX - minX), this.h / (maxY - minY));
    this.flyTo((minX + maxX) / 2, (minY + maxY) / 2, k, dur);
  }

  fitAll(dur = 900) {
    this.fitTo([...this.nodes.values()].map((n) => ({ x: n.ax, y: n.ay })), 140, 1.1, dur);
  }

  zoomBy(f: number, sx?: number, sy?: number) {
    const cx = sx ?? this.w / 2;
    const cy = sy ?? this.h / 2;
    const t = this.camTarget;
    const k = Math.max(0.15, Math.min(2.6, t.k * f));
    // keep the world point under the cursor fixed
    const wx = t.x + (cx - this.w / 2) / t.k;
    const wy = t.y + (cy - this.h / 2) / t.k;
    this.flight = null;
    this.camTarget = { k, x: wx - (cx - this.w / 2) / k, y: wy - (cy - this.h / 2) / k };
  }

  panBy(dx: number, dy: number) {
    this.flight = null;
    this.camTarget = { ...this.camTarget, x: this.camTarget.x + dx / this.camTarget.k, y: this.camTarget.y + dy / this.camTarget.k };
  }

  /* ---------------- input ---------------- */

  handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.root!.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.2 || e.deltaMode === 1) {
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomBy(Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top);
    } else {
      this.panBy(e.deltaX, e.deltaY);
    }
  };

  handleBackgroundDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.flight = null;
    this.inertia = { vx: 0, vy: 0 };
    this.panning = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y, lx: e.clientX, ly: e.clientY, lt: performance.now(), moved: false };
    this.camTarget = { ...this.cam };
  };

  beginNodeDrag(id: string, e: PointerEvent) {
    const n = this.nodes.get(id);
    if (!n) return;
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.dragging = { id, ox: n.x - w.x, oy: n.y - w.y, moved: false };
    this.downAt = { x: e.clientX, y: e.clientY };
  }
  private downAt = { x: 0, y: 0 };

  handlePointerMove = (e: PointerEvent) => {
    if (this.dragging) {
      const d = this.dragging;
      if (!d.moved && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 5) return;
      const n = this.nodes.get(d.id);
      if (!n || n.draggable === false) return;
      d.moved = true;
      const w = this.screenToWorld(e.clientX, e.clientY);
      n.x = w.x + d.ox;
      n.y = w.y + d.oy;
      n.vx = n.vy = 0;
      this.onNodeDragMove?.(d.id, e.clientX, e.clientY);
      return;
    }
    if (this.panning) {
      const p = this.panning;
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      if (Math.hypot(dx, dy) > 3) p.moved = true;
      const now = performance.now();
      const dtp = Math.max(1, now - p.lt);
      this.inertia = { vx: ((e.clientX - p.lx) / dtp) * 16, vy: ((e.clientY - p.ly) / dtp) * 16 };
      p.lx = e.clientX;
      p.ly = e.clientY;
      p.lt = now;
      this.cam.x = p.cx - dx / this.cam.k;
      this.cam.y = p.cy - dy / this.cam.k;
      this.camTarget = { ...this.cam };
    }
  };

  handlePointerUp = (e: PointerEvent) => {
    if (this.dragging) {
      const d = this.dragging;
      this.dragging = null;
      if (d.moved) {
        this.onNodeDrop?.(d.id, e.clientX, e.clientY);
      } else {
        this.onNodeClick?.(d.id, e);
      }
      return;
    }
    if (this.panning) {
      const moved = this.panning.moved;
      this.panning = null;
      if (!moved) {
        this.inertia = { vx: 0, vy: 0 };
        this.onBackgroundClick?.();
      }
    }
  };

  isDragging(id?: string) {
    return id ? this.dragging?.id === id && this.dragging.moved : !!this.dragging?.moved;
  }

  /* ---------------- simulation ---------------- */

  private step(dt: number, t: number) {
    const f = dt * 60;
    // camera
    if (this.flight) {
      const fl = this.flight;
      const p = clamp01((t - fl.start) / fl.dur);
      const e = easeInOut(p);
      const kLin = fl.from.k + (fl.to.k - fl.from.k) * e;
      this.cam = {
        x: fl.from.x + (fl.to.x - fl.from.x) * e,
        y: fl.from.y + (fl.to.y - fl.from.y) * e,
        k: kLin * (1 - fl.dip * Math.sin(Math.PI * p)),
      };
      if (p >= 1) {
        this.flight = null;
        this.cam = { ...fl.to };
      }
    } else if (!this.panning) {
      if (Math.abs(this.inertia.vx) + Math.abs(this.inertia.vy) > 0.05) {
        this.camTarget.x -= (this.inertia.vx / this.cam.k) * f;
        this.camTarget.y -= (this.inertia.vy / this.cam.k) * f;
        this.inertia.vx *= Math.pow(0.9, f);
        this.inertia.vy *= Math.pow(0.9, f);
        this.cam.x = this.camTarget.x;
        this.cam.y = this.camTarget.y;
      }
      const s = 1 - Math.exp(-dt * 11);
      this.cam.x += (this.camTarget.x - this.cam.x) * s;
      this.cam.y += (this.camTarget.y - this.cam.y) * s;
      this.cam.k += (this.camTarget.k - this.cam.k) * s;
    }

    // nodes: spring to anchor + local repulsion + drag coupling
    const list = [...this.nodes.values()];
    const drag = this.dragging?.moved ? this.nodes.get(this.dragging.id) : null;
    const dragDx = drag ? drag.x - drag.ax : 0;
    const dragDy = drag ? drag.y - drag.ay : 0;
    const dragNbrs = drag ? this.neighbors(drag.id) : null;
    for (const n of list) {
      if (n === drag) continue;
      const kSpring = n.pinned ? 0.05 : 0.018;
      let fx = (n.ax - n.x) * kSpring;
      let fy = (n.ay - n.y) * kSpring;
      if (dragNbrs?.has(n.id) && !n.pinned) {
        fx += dragDx * 0.012;
        fy += dragDy * 0.012;
      }
      if (!n.pinned) {
        for (const m of list) {
          if (m === n) continue;
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const d2 = dx * dx + dy * dy;
          const min = n.r + m.r + 14;
          if (d2 < min * min && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = ((min - d) / d) * 0.06;
            fx += dx * push;
            fy += dy * push;
          }
        }
      }
      n.vx = (n.vx + fx * f) * Math.pow(0.84, f);
      n.vy = (n.vy + fy * f) * Math.pow(0.84, f);
      n.x += n.vx * f;
      n.y += n.vy * f;
    }

    // pulses
    for (const p of this.pulses) {
      p.t += dt * p.speed;
      if (p.t > 1) p.life -= dt * 4;
    }
    this.pulses = this.pulses.filter((p) => p.life > 0);

    // render positions: idle drift + choreography
    const amp = this.reduced ? 0 : 2.6 * this.ambient;
    const c = this.fx.converge;
    const fc = this.focusCluster;
    for (const n of list) {
      const drift = n === drag ? 0 : amp;
      let x = n.x + Math.sin(t / 2100 + n.phase) * drift;
      let y = n.y + Math.cos(t / 2700 + n.phase * 1.3) * drift;
      if (c > 0 && n.type !== "verse") {
        const pull = this.convergeSet.has(n.id) ? c * 0.86 : n.type === "target" ? 0 : c * 0.16;
        x += (fc.x - x) * pull;
        y += (fc.y - y) * pull;
      }
      n.rx = x;
      n.ry = y;
    }
  }

  /* ---------------- render ---------------- */

  private applyWorld(t: number) {
    if (!this.world) return;
    const c = this.cam;
    let sx = 0,
      sy = 0;
    if (this.fx.shake > 0) {
      sx = Math.sin(t / 23) * this.fx.shake * 3;
      sy = Math.cos(t / 29) * this.fx.shake * 2;
    }
    const k = c.k * this.fx.worldScale;
    const tx = this.w / 2 - c.x * k + sx;
    const ty = this.h / 2 - c.y * k + sy;
    this.world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
    this.world.style.opacity = String(this.fx.worldFade);
    const band = c.k < 0.42 ? "far" : c.k < 0.75 ? "mid" : "near";
    if (band !== this.zoomBand && this.root) {
      this.zoomBand = band;
      this.root.dataset.zoom = band;
    }
  }

  private applyNode(n: SimNode, el: HTMLElement) {
    const now = performance.now();
    const age = now - n.born - n.stagger;
    const appear = this.reduced ? 1 : easeOut(clamp01(age / 650));
    const s = 0.55 + 0.45 * appear;
    const tr = `translate3d(${n.rx.toFixed(2)}px, ${n.ry.toFixed(2)}px, 0) scale(${s.toFixed(3)})`;
    if (tr !== n.lastT) {
      el.style.transform = tr;
      n.lastT = tr;
    }
    const o = this.reduced ? clamp01(age / 200) : appear;
    el.style.opacity = o < 1 ? o.toFixed(3) : "";
  }

  private edgeGeom(e: EdgeSpec) {
    const a = this.nodes.get(e.from);
    const b = this.nodes.get(e.to);
    if (!a || !b) return null;
    const p0 = this.worldToScreenFx(a.rx, a.ry);
    const p1 = this.worldToScreenFx(b.rx, b.ry);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const curve = e.kind.startsWith("lineage") ? 0.08 : e.kind === "inferred" || e.kind === "correlation" ? 0.16 : 0.06;
    const cx = (p0.x + p1.x) / 2 - (dy / len) * len * curve;
    const cy = (p0.y + p1.y) / 2 + (dx / len) * len * curve;
    // trim to node radii so edges meet node rims, not centres
    const ra = (a.r * this.cam.k * this.fx.worldScale) / len;
    const rb = (b.r * this.cam.k * this.fx.worldScale) / len;
    return { p0, p1, cx, cy, ta: Math.min(0.45, ra), tb: Math.max(0.55, 1 - rb), a, b };
  }

  private worldToScreenFx(x: number, y: number) {
    const k = this.cam.k * this.fx.worldScale;
    return { x: this.w / 2 + (x - this.cam.x) * k, y: this.h / 2 + (y - this.cam.y) * k };
  }

  private render(t: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.applyWorld(t);
    for (const n of this.nodes.values()) if (n.el) this.applyNode(n, n.el);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawStars(ctx, t);
    if (this.fx.branch > 0) this.drawBranchTunnel(ctx);
    this.drawOrbits(ctx);
    this.drawEdges(ctx, t);
    this.drawPulses(ctx);

    if (this.fx.flash > 0.001) {
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, 0, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
      g.addColorStop(0, rgba([235, 248, 255], this.fx.flash));
      g.addColorStop(0.45, rgba(COLORS.accent, this.fx.flash * 0.35));
      g.addColorStop(1, rgba(COLORS.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    // vignette — keeps edges of the frame quiet, focus central
    const v = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    v.addColorStop(0, "rgba(5,5,5,0)");
    v.addColorStop(1, `rgba(5,5,5,${0.55 + this.fx.warp * 0.3})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawStars(ctx: CanvasRenderingContext2D, t: number) {
    const warp = this.fx.warp;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const dim = 1 - this.fx.dimStars * 0.7;
    for (const s of this.stars) {
      // parallax wrap in screen space
      const px = (((s.x * this.w * 1.4 - this.cam.x * s.z * 0.12 * this.cam.k) % (this.w * 1.4)) + this.w * 1.4) % (this.w * 1.4) - this.w * 0.2;
      const py = (((s.y * this.h * 1.4 - this.cam.y * s.z * 0.12 * this.cam.k) % (this.h * 1.4)) + this.h * 1.4) % (this.h * 1.4) - this.h * 0.2;
      const tw = this.reduced ? 1 : 0.75 + 0.25 * Math.sin(t / 900 + s.x * 40);
      const a = s.a * s.z * 0.55 * tw * dim;
      if (warp > 0.02) {
        const dx = px - cx;
        const dy = py - cy;
        const len = warp * 140 * s.z;
        const d = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = rgba(COLORS.white, Math.min(0.85, a * (1 + warp * 2)));
        ctx.lineWidth = 0.6 + s.z * 0.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + (dx / d) * len, py + (dy / d) * len);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(COLORS.white, a);
        const r = 0.35 + s.z * 0.75;
        ctx.fillRect(px - r / 2, py - r / 2, r, r);
      }
    }
  }

  /** Travel: a perspective tunnel of forking paths streaming past the camera. */
  private drawBranchTunnel(ctx: CanvasRenderingContext2D) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const S = Math.max(this.w, this.h) * 0.55;
    const speed = 0.018 + this.fx.travel * 0.03;
    ctx.lineCap = "round";
    for (let i = 0; i < this.branches.length; i++) {
      const b = this.branches[i];
      b.z -= speed;
      if (b.z <= 0.04) this.branches[i] = this.makeBranch(1);
      const proj = (x: number, y: number, z: number) => ({ x: cx + (x / z) * S * 0.18, y: cy + (y / z) * S * 0.18 });
      const z0 = b.z;
      const z1 = b.z + b.len;
      const p0 = proj(b.x, b.y, z0);
      const p1 = proj(b.x, b.y, z1);
      const a = this.fx.branch * Math.min(1, (1 - z0) * 2.2) * 0.85;
      if (a <= 0.01) continue;
      ctx.strokeStyle = rgba(COLORS.accent, a);
      ctx.shadowColor = rgba(COLORS.accent, a * 0.8);
      ctx.shadowBlur = 6;
      ctx.lineWidth = Math.min(3.2, 0.9 / z0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p0.x, p0.y);
      // the fork: two short tines splitting toward the viewer
      const spread = 0.08 + b.fork * 0.1;
      const t1 = proj(b.x + (b.dy * spread), b.y - (b.dx * spread), Math.max(0.03, z0 - b.len * 0.5));
      const t2 = proj(b.x - (b.dy * spread), b.y + (b.dx * spread), Math.max(0.03, z0 - b.len * 0.5));
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  private drawOrbits(ctx: CanvasRenderingContext2D) {
    let target: SimNode | undefined;
    for (const n of this.nodes.values()) if (n.type === "target") target = n;
    if (!target) return;
    const p = this.worldToScreenFx(target.ax, target.ay);
    const k = this.cam.k * this.fx.worldScale;
    const a = 0.05 * this.fx.worldFade * (1 - this.fx.converge * 0.6);
    ctx.save();
    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 1;
    for (const r of [150, 255, 400]) {
      ctx.strokeStyle = rgba(COLORS.white, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private edgeStyle(kind: EdgeKind): { c: readonly number[]; a: number; w: number; dash: number[] } {
    switch (kind) {
      case "assumed":
        return { c: COLORS.accent, a: 0.6, w: 1.4, dash: [] };
      case "inherited":
        return { c: COLORS.white, a: 0.28, w: 1.1, dash: [] };
      case "pending":
        return { c: COLORS.accent, a: 0.55, w: 1.2, dash: [3, 5] };
      case "inferred":
        return { c: COLORS.white, a: 0.16, w: 1, dash: [6, 7] };
      case "correlation":
        return { c: COLORS.white, a: 0.16, w: 1, dash: [1.5, 5] };
      case "lineage":
        return { c: COLORS.white, a: 0.13, w: 1, dash: [] };
      case "lineage-active":
        return { c: COLORS.accent, a: 0.38, w: 1.4, dash: [] };
      case "forecast-up":
        return { c: COLORS.up, a: 0.42, w: 1.1, dash: [] };
      case "forecast-down":
        return { c: COLORS.down, a: 0.42, w: 1.1, dash: [] };
      case "forecast":
        return { c: COLORS.white, a: 0.22, w: 1, dash: [] };
      case "contradiction":
        return { c: COLORS.warn, a: 0.5, w: 1.1, dash: [4, 4] };
    }
  }

  private drawEdges(ctx: CanvasRenderingContext2D, t: number) {
    const hov = this.hover;
    const nbr = hov ? this.neighbors(hov) : null;
    const fade = this.fx.worldFade;
    for (const e of this.edges) {
      const g = this.edgeGeom(e);
      if (!g) continue;
      const st = this.edgeStyle(e.kind);
      let alpha = st.a * fade;
      let w = st.w;
      if (hov) {
        const touches = e.from === hov || e.to === hov;
        alpha *= touches ? 2.1 : nbr?.has(e.from) && nbr?.has(e.to) ? 0.6 : 0.28;
        if (touches) w += 0.5;
      }
      // appear with the younger endpoint
      const born = Math.max(g.a.born + g.a.stagger, g.b.born + g.b.stagger);
      const grow = this.reduced ? 1 : easeOut(clamp01((performance.now() - born) / 700));
      if (grow <= 0) continue;
      if (this.convergeSet.has(e.from) || this.convergeSet.has(e.to)) alpha = Math.min(1, alpha * (1 + this.fx.converge * 1.6));
      ctx.strokeStyle = rgba(st.c, Math.min(1, alpha));
      ctx.lineWidth = w;
      ctx.setLineDash(st.dash);
      if (e.kind === "pending") ctx.lineDashOffset = -t / 60;
      ctx.beginPath();
      // draw the trimmed quadratic as a polyline (supports partial growth)
      const steps = 22;
      const tEnd = g.ta + (g.tb - g.ta) * grow;
      for (let i = 0; i <= steps; i++) {
        const u = g.ta + ((tEnd - g.ta) * i) / steps;
        const x = (1 - u) * (1 - u) * g.p0.x + 2 * (1 - u) * u * g.cx + u * u * g.p1.x;
        const y = (1 - u) * (1 - u) * g.p0.y + 2 * (1 - u) * u * g.cy + u * u * g.p1.y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineDashOffset = 0;
    }
    ctx.setLineDash([]);
  }

  private drawPulses(ctx: CanvasRenderingContext2D) {
    for (const p of this.pulses) {
      if (p.t < 0) continue;
      const e = this.edges.find((x) => x.id === p.edge);
      if (!e) continue;
      const g = this.edgeGeom(e);
      if (!g) continue;
      const st = this.edgeStyle(e.kind);
      for (let k = 0; k < 6; k++) {
        const u = Math.min(1, Math.max(0, p.t - k * 0.018));
        const x = (1 - u) * (1 - u) * g.p0.x + 2 * (1 - u) * u * g.cx + u * u * g.p1.x;
        const y = (1 - u) * (1 - u) * g.p0.y + 2 * (1 - u) * u * g.cy + u * u * g.p1.y;
        const a = p.life * (1 - k / 6) * 0.9;
        ctx.fillStyle = rgba(st.c === COLORS.white ? COLORS.accent : st.c, a);
        ctx.beginPath();
        ctx.arc(x, y, 2.2 - k * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* ---------------- choreography ---------------- */

  private tween(dur: number, fn: (p: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        const p = clamp01((performance.now() - start) / dur);
        fn(p);
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  private busy = false;

  /** Runs the full fork sequence. Resolves at arrival; ignores re-entry. */
  async playFork(c: ForkChoreo): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const fx = this.fx;
    try {
      this.convergeSet = new Set(c.converge);
      this.focusCluster = c.from;
      if (c.reduced) {
        c.onPhase("commit");
        await this.tween(160, () => {});
        await this.tween(220, (p) => (fx.worldFade = 1 - p));
        c.onPhase("travel");
        this.cam = { x: c.to.x, y: c.to.y, k: this.cam.k };
        this.camTarget = { ...this.cam };
        this.flight = null;
        c.onPhase("arrive");
        await this.tween(260, (p) => (fx.worldFade = p));
        c.onPhase("reveal");
        return;
      }
      const k0 = this.cam.k;
      // Phase 1 — commitment: pulses travel the assumption edges, target answers
      c.onPhase("commit");
      for (const id of c.converge) this.pulseEdgesOf(id, 3);
      this.flyTo(c.from.x, c.from.y, Math.max(0.8, Math.min(1.15, k0)), 480);
      await this.tween(520, () => {});
      // Phase 2 — convergence: assumptions are drawn into the target; tension builds
      c.onPhase("converge");
      const kc = this.cam.k;
      await this.tween(780, (p) => {
        const e = easeIn(p);
        fx.converge = e;
        fx.dimStars = e * 0.6;
        this.ambient = 1 - e;
        this.cam.k = kc * (1 + 0.14 * easeInOut(p));
        this.camTarget = { ...this.cam };
      });
      // Phase 3 — rupture: luminance pulse, radial stretch, the world recedes in depth
      c.onPhase("rupture");
      await this.tween(430, (p) => {
        fx.flash = Math.sin(Math.PI * Math.min(1, p * 1.6)) * 0.5;
        fx.warp = easeIn(p);
        fx.shake = Math.sin(Math.PI * p) * 0.9;
        fx.worldScale = 1 + easeIn(p) * 0.9;
        fx.worldFade = 1 - easeIn(p);
      });
      fx.shake = 0;
      fx.converge = 0;
      this.convergeSet.clear();
      // Phase 4 — travel: through the branching paths to the new focal point
      c.onPhase("travel");
      this.cam = { x: c.to.x, y: c.to.y, k: kc };
      this.camTarget = { ...this.cam };
      this.focusCluster = c.to;
      await this.tween(1050, (p) => {
        fx.branch = Math.sin(Math.PI * p);
        fx.travel = p;
        fx.warp = 1 - easeOut(p) * 0.85;
        fx.flash = Math.max(0, fx.flash - 0.04);
        fx.worldScale = 1.9 - easeOut(p) * 0.9; // new world approaches from depth
      });
      // Phase 5 — arrival: the new Verse resolves, ambient calm returns
      c.onPhase("arrive");
      await this.tween(720, (p) => {
        const e = easeOut(p);
        fx.worldFade = e;
        fx.worldScale = 1 + (1 - e) * 0.06;
        fx.warp = 0.15 * (1 - e);
        fx.branch = 0;
        fx.dimStars = 0.6 * (1 - e);
        this.ambient = e;
      });
      this.flyTo(c.to.x, c.to.y, Math.max(0.75, Math.min(1.05, k0)), 600);
      c.onPhase("reveal");
    } finally {
      Object.assign(fx, { converge: 0, flash: 0, warp: 0, shake: 0, worldFade: 1, worldScale: 1, travel: 0, branch: 0, dimStars: 0 });
      this.ambient = 1;
      this.convergeSet.clear();
      this.busy = false;
    }
  }

  /** Lighter transition used for ordinary navigation between existing Verses. */
  async travelTo(to: { x: number; y: number }, k?: number) {
    this.focusCluster = to;
    if (this.reduced) {
      this.flyTo(to.x, to.y, k ?? this.cam.k, 1);
      return;
    }
    this.flyTo(to.x, to.y, k ?? Math.max(0.75, Math.min(1.05, this.cam.k)), 1100);
  }
}
