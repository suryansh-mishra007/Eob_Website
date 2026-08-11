/* Shared rendering/animation helpers for the matte, real-plate look of both
   demos (maze.js, network-builder.js) -- vein coloring and a protoplasm
   particle system. Pure visual code: nothing in this file touches the
   Tero/Nakagaki equations or PhysarumSolver -- it only reads D/Q/p values
   the solver already computed and animates how they're drawn. See
   physarum-solver.js for the actual model.

   Rendering reference (2026-08-08): matched directly against real Physarum
   photos/time-lapses (Tero et al. 2010 rail-network figure included) --
   thin branching veins, no bloom/glow, dark agar visible between every
   vein, a single yellow-green hue fading to near-invisible rather than a
   multi-hue "hot" gradient. See PROJECT_NOTES.md for the full before/after. */

(() => {

  // Single-hue fade: near-invisible dark agar tone (t=0) -> solid
  // yellow-green (t=1, #a8c93a) -- matches real Physarum's actual pigment
  // color under lab light, not a stylized "heat" gradient. Combined with
  // an alpha ramp in the caller (see maze.js/network-builder.js drawTube)
  // so low-D tubes don't just look dark, they look genuinely faint/absent.
  const DIM = { r: 22, g: 32, b: 26 };
  const LIVE = { r: 168, g: 201, b: 58 };

  function activityColor(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return {
      r: Math.round(DIM.r + (LIVE.r - DIM.r) * t),
      g: Math.round(DIM.g + (LIVE.g - DIM.g) * t),
      b: Math.round(DIM.b + (LIVE.b - DIM.b) * t),
    };
  }

  // Undirected adjacency list from parallel edgeA/edgeB typed arrays --
  // used to walk the graph node-by-node for particle routing.
  function buildAdjacency(count, edgeA, edgeB) {
    const adj = Array.from({ length: count }, () => []);
    for (let e = 0; e < edgeA.length; e++) {
      adj[edgeA[e]].push({ edge: e, to: edgeB[e] });
      adj[edgeB[e]].push({ edge: e, to: edgeA[e] });
    }
    return adj;
  }

  // A small pool of "protoplasm" dots that hop from node to node along
  // graph edges. Each hop's destination is chosen by a caller-supplied
  // chooseNext(nodeIdx, incidentList, cameFromEdge) -> {edge, to, speed} |
  // null callback, so the two demos can bias routing differently (frontier-
  // following while the growth front is still spreading, real-flux-weighted
  // once relaxation is solving genuine pressures) without this file needing
  // to know about D/Q/gamma at all.
  class ParticleFlow {
    constructor({ adj, nodeX, nodeY, maxParticles }) {
      this.adj = adj;
      this.nodeX = nodeX;
      this.nodeY = nodeY;
      this.maxParticles = maxParticles || 80;
      this.particles = []; // {edge, from, to, prog, speed, life}
    }

    spawn(sourceIdx, chooseNext) {
      if (this.particles.length >= this.maxParticles) return;
      const incident = this.adj[sourceIdx];
      if (!incident || !incident.length) return;
      const choice = chooseNext(sourceIdx, incident, -1);
      if (!choice) return;
      this.particles.push({
        edge: choice.edge, from: sourceIdx, to: choice.to,
        prog: 0, speed: choice.speed, life: 0,
      });
    }

    // dtFrames: frame-equivalents elapsed this tick (usually 1) -- lets
    // callers keep particle motion in step with the speed slider the same
    // way the physics stepping does.
    update(dtFrames, chooseNext, isSink) {
      if (!this.particles.length) return;
      const kept = [];
      for (const p of this.particles) {
        p.life++;
        p.prog += p.speed * dtFrames;
        if (p.prog >= 1) {
          const arrivedAt = p.to;
          if (!isSink(arrivedAt)) {
            const incident = this.adj[arrivedAt];
            const choice = incident && incident.length ? chooseNext(arrivedAt, incident, p.edge) : null;
            if (choice) {
              p.edge = choice.edge;
              p.from = arrivedAt;
              p.to = choice.to;
              p.prog = 0;
              p.speed = choice.speed;
              kept.push(p);
            }
            // else: dead end, already faded near-invisible by the prog>0.82
            // rule below on its last-drawn frame -- just let it vanish.
          }
          continue;
        }
        kept.push(p);
      }
      this.particles = kept;
    }

    // Matte dots, no shadow/glow -- same "clean line, no bloom" rule as the
    // tubes (see the file header). Reference photos don't show visible flow
    // particles at all (they're a still/time-lapse photo, not live video),
    // so these stay deliberately small and understated -- a hint of motion,
    // not a light show.
    draw(ctx, colorRgb) {
      for (const p of this.particles) {
        const ax = this.nodeX[p.from], ay = this.nodeY[p.from];
        const bx = this.nodeX[p.to], by = this.nodeY[p.to];
        const x = ax + (bx - ax) * p.prog;
        const y = ay + (by - ay) * p.prog;
        const fadeIn = Math.min(1, p.life / 8);
        const fadeOut = p.prog > 0.82 ? Math.max(0, (1 - p.prog) / 0.18) : 1;
        const alpha = fadeIn * fadeOut;
        if (alpha <= 0.02) continue;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorRgb},${(0.8 * alpha).toFixed(3)})`;
        ctx.fill();
      }
    }
  }

  window.PhysarumFX = { activityColor, buildAdjacency, ParticleFlow };
})();
