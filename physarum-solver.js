/* The actual Physarum Solver -- the real adaptive-network model, not a
   growth heuristic. Implements the equations from:

   Tero, A., Kobayashi, R., & Nakagaki, T. (2007). "A mathematical model
   for adaptive transport network in path finding by true slime mold."
   Journal of Theoretical Biology, 244(4), 553-564.

   Tero, A., Takagi, S., Saigusa, T., Ito, K., Bebber, D. P., Fricker, M.
   D., Yumiki, K., Kobayashi, R., & Nishiguchi, T. (2010). "Rules for
   biologically inspired adaptive network design." Science, 327(5964),
   439-442.

   THE MODEL (this is the entire algorithm -- no agents, no tips, no
   branching probabilities anywhere in this file):

   The network is a graph of tubes. Every edge (i,j) has a fixed length
   L_ij and a conductivity D_ij(t) that starts equal on every edge and
   evolves over time. At every instant the tube network is treated like an
   electrical/plumbing circuit obeying Poiseuille flow and Kirchhoff's
   current law:

     Q_ij = (D_ij / L_ij) * (p_i - p_j)          -- flux through edge (i,j)
     sum_j Q_ij = I_i for every node i            -- conservation of flow

   where I_i is the external flux injected (+) or withdrawn (-) at node i
   (the source(s)/sink(s); zero everywhere else, and sum(I) = 0). Solving
   that linear system for the pressures p_i is exactly solving a weighted
   graph Laplacian -- done here with matrix-free conjugate gradient
   (solvePressures) since the road graph is large and sparse.

   Once every edge's flux Q_ij is known, the tube network adapts:

     dD_ij/dt = f(|Q_ij|) - D_ij ,      f(Q) = Q^gamma / (1 + Q^gamma)

   f is a saturating, monotonically increasing function of flow -- tubes
   carrying more flow are reinforced, but with diminishing returns. The
   "- D_ij" term is a constant decay: every tube costs upkeep, and a tube
   getting no flow simply starves back toward zero and vanishes. gamma
   controls how decisive that feedback is -- Tero et al. 2007 show that
   for a single source/sink pair, gamma > 1 makes the network converge to
   the single shortest path (reproducing Nakagaki, Yamada & Toth's 2000
   maze-solving result), while lower gamma preserves redundant loops, more
   like the real fault-tolerant rail network the 2010 Science paper
   measured. That's exposed directly on this site as the "network
   selectivity" slider -- it IS gamma, not a cosmetic knob.

   This file is graph-agnostic (no map/canvas/DOM code at all) so both
   app.js (single source, single sink) and network.js (single source,
   multiple sinks -- the 2010 paper's own simplification for the
   multi-city case, see network.js) can share one real implementation. */

(() => {

  // ---------- Graph construction from the bundled OSM data ----------
  // Shared by app.js and network.js so both build the exact same graph the
  // exact same way -- previously each file had its own hand-copied version
  // of this logic.

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Builds the full bundled road network exactly once: numeric node
  // indices, lat/lon arrays, an adjacency list (for BFS/connectivity), and
  // a deduplicated edge list with real-world lengths in meters (used
  // directly as L_ij in the model above -- never pixel distance).
  function buildFullGraph(roadsData) {
    const ids = Object.keys(roadsData.nodes);
    const index = new Map();
    const lat = new Float64Array(ids.length);
    const lon = new Float64Array(ids.length);
    ids.forEach((id, i) => {
      index.set(id, i);
      const [la, lo] = roadsData.nodes[id];
      lat[i] = la;
      lon[i] = lo;
    });

    const adj = Array.from({ length: ids.length }, () => []);
    const edges = [];
    const seen = new Set();
    for (const way of roadsData.ways) {
      for (let i = 0; i < way.length - 1; i++) {
        const a = index.get(String(way[i]));
        const b = index.get(String(way[i + 1]));
        if (a === undefined || b === undefined || a === b) continue;
        const key = a < b ? a * ids.length + b : b * ids.length + a;
        if (seen.has(key)) continue;
        seen.add(key);
        const length = haversineMeters(lat[a], lon[a], lat[b], lon[b]);
        if (length <= 0) continue;
        edges.push({ a, b, length });
        adj[a].push(b);
        adj[b].push(a);
      }
    }
    return { ids, index, lat, lon, adj, edges };
  }

  function nearestNode(graph, lat, lon) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < graph.ids.length; i++) {
      const d = haversineMeters(lat, lon, graph.lat[i], graph.lon[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  // BFS out from one node -- used to restrict the working graph to the
  // connected component the terminals actually live in (an OSM extract can
  // contain small disconnected fragments; solving Kirchhoff's law over a
  // component the source can never reach is both wrong and numerically
  // singular). Also a fair biological parallel: the real experiments only
  // ever cover the agar plate with the map area that matters.
  function connectedComponent(graph, seedIdx) {
    const seen = new Uint8Array(graph.ids.length);
    const queue = [seedIdx];
    seen[seedIdx] = 1;
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      for (const nb of graph.adj[cur]) {
        if (!seen[nb]) {
          seen[nb] = 1;
          queue.push(nb);
        }
      }
    }
    return seen;
  }

  // Same as connectedComponent, but traversal may only pass through nodes
  // where allowMask is truthy -- used to crop the working graph to a
  // padded region around the query points (the real experiments only ever
  // covered the agar plate with the map area that mattered) before
  // finding the component within that crop.
  function connectedComponentMasked(graph, seedIdx, allowMask) {
    const seen = new Uint8Array(graph.ids.length);
    if (!allowMask[seedIdx]) return seen;
    const queue = [seedIdx];
    seen[seedIdx] = 1;
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      for (const nb of graph.adj[cur]) {
        if (allowMask[nb] && !seen[nb]) {
          seen[nb] = 1;
          queue.push(nb);
        }
      }
    }
    return seen;
  }

  // Remaps a masked subset of the full graph down to a dense 0..k-1
  // numbering (what the solver actually operates on) -- keeps the solver's
  // arrays sized to only what's reachable instead of the whole 34k-node
  // bundle every time.
  function subgraphFromMask(graph, mask) {
    const remap = new Int32Array(graph.ids.length).fill(-1);
    let k = 0;
    for (let i = 0; i < graph.ids.length; i++) if (mask[i]) remap[i] = k++;
    const edges = [];
    for (const e of graph.edges) {
      if (mask[e.a] && mask[e.b]) edges.push({ a: remap[e.a], b: remap[e.b], length: e.length });
    }
    const unmap = new Int32Array(k);
    for (let i = 0; i < graph.ids.length; i++) if (mask[i]) unmap[remap[i]] = i;
    return { count: k, edges, remap, unmap };
  }

  // Graph-distance from a single source to every node, by real edge length
  // (Dijkstra, O(n^2) array-scan -- graphs here are at most a couple thousand
  // nodes, computed once per demo reset, not per frame, so simplicity beats
  // a heap here). Used purely for the demos' pre-relaxation growth-front
  // animation (see maze.js/network-builder.js "exploring" phase) -- NOT part
  // of the Tero/Nakagaki model itself, just a way to time when each tube
  // visually starts thickening so the network appears to grow outward from
  // the source the way the real plasmodium does, before the real Kirchhoff/
  // Poiseuille + reinforcement-decay relaxation (unchanged, below) takes over.
  function dijkstraDistances(count, edges, sourceIdx) {
    const adj = Array.from({ length: count }, () => []);
    for (const e of edges) {
      adj[e.a].push([e.b, e.length]);
      adj[e.b].push([e.a, e.length]);
    }
    const dist = new Float64Array(count).fill(Infinity);
    const visited = new Uint8Array(count);
    dist[sourceIdx] = 0;
    for (let iter = 0; iter < count; iter++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < count; i++) {
        if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
      }
      if (u === -1) break;
      visited[u] = 1;
      for (const [v, w] of adj[u]) {
        const nd = dist[u] + w;
        if (nd < dist[v]) dist[v] = nd;
      }
    }
    return dist;
  }

  // ---------- The solver itself ----------

  const D0 = 1;          // initial conductivity, identical on every edge (Tero et al. 2007)
  const DMIN = 1e-3;      // numerical floor so D/L never divides by zero; treated as "vanished" for rendering
  const CG_TOL = 1e-4;    // conjugate-gradient residual tolerance (I0 is scaled to 1, so this is effectively relative)

  class PhysarumSolver {
    // edges: [{a,b,length}] with a,b in [0,count). gamma: the model's
    // reinforcement exponent (see file header). fluxScale: NOT from either
    // paper -- our own calibration constant, documented here rather than
    // presented as a published value (see the site's References section).
    // f(Q) = Q^gamma/(1+Q^gamma) has its characteristic "knee" at Q ~ 1, but
    // total injected flux is fixed at 1 unit while a real irregular road
    // graph can split that unit flux across many parallel streets before it
    // funnels through an actual bottleneck -- so most individual edges
    // never carry flux anywhere near 1, and never reach the sigmoid's
    // decisive region, however long the simulation runs. fluxScale rescales
    // the input to f() (Q/fluxScale) so that the knee sits where this
    // graph's typical per-edge flux actually lives, which is what makes
    // reinforcement/decay decisive in open grid areas and not just at
    // genuine chokepoints. Equivalent in effect to choosing a larger I0;
    // done this way so I0 itself can stay the clean, dimensionless 1 used
    // in the flux bookkeeping below.
    constructor(count, edges, gamma, fluxScale) {
      this.n = count;
      this.edges = edges; // kept for consumers (rendering); hot loops below use the typed arrays instead
      this.m = edges.length;
      this.gamma = gamma;
      this.fluxScale = fluxScale || 1;
      this.D = new Float64Array(this.m).fill(D0);
      this.Q = new Float64Array(this.m);
      this.L = new Float64Array(this.m);
      // Struct-of-arrays instead of an array of {a,b,length} objects --
      // _applyL runs this every single CG iteration (dozens of times per
      // Euler step, hundreds of Euler steps), so avoiding per-edge object
      // property lookups in that inner loop matters a lot at graph sizes
      // in the tens of thousands of edges.
      this.edgeA = new Int32Array(this.m);
      this.edgeB = new Int32Array(this.m);
      for (let e = 0; e < this.m; e++) {
        this.edgeA[e] = edges[e].a;
        this.edgeB[e] = edges[e].b;
        this.L[e] = edges[e].length;
      }

      this.p = new Float64Array(this.n);   // pressures -- persists across steps (warm start for CG)
      this.I = new Float64Array(this.n);   // external flux (source +, sink -)
      this.ground = 0;
      this._Ap = new Float64Array(this.n);
      this._r = new Float64Array(this.n);
      this._d = new Float64Array(this.n);
      this._z = new Float64Array(this.n);
      this._diag = new Float64Array(this.n); // Jacobi preconditioner, rebuilt once per solve (see solvePressures)
      this.lastCgIters = 0;
    }

    // sources/sinks: Map<nodeIndex, flux>. Fluxes must sum to (approximately) zero.
    // groundIdx: node pinned to p=0 -- conventionally the/a source (see Tero
    // et al. 2010: the choice of which terminal is the mathematical
    // "source" vs. "sink" is arbitrary and doesn't change the resulting
    // network, since only relative pressure matters).
    setFlux(fluxMap, groundIdx) {
      this.I.fill(0);
      for (const [idx, val] of fluxMap) this.I[idx] = val;
      this.ground = groundIdx;
      this.p.fill(0);
    }

    // Matrix-free application of the conductance-weighted graph Laplacian:
    // (L*p)_i = sum_j (D_ij/L_ij)(p_i - p_j). This IS Kirchhoff's current
    // law -- no explicit matrix is ever built, just one pass over the edge list.
    _applyL(pVec, out) {
      out.fill(0);
      const { edgeA, edgeB, D, L, m } = this;
      for (let e = 0; e < m; e++) {
        const a = edgeA[e], b = edgeB[e];
        const w = D[e] / L[e];
        const diff = pVec[a] - pVec[b];
        out[a] += w * diff;
        out[b] -= w * diff;
      }
    }

    // Recomputes the Laplacian's diagonal (each node's total incident
    // conductance) -- used as a Jacobi preconditioner below. Cheap (O(m)),
    // so it's fine to rebuild once per solve even though D changes every
    // Euler step.
    _buildDiagonal() {
      const { edgeA, edgeB, D, L, m, n } = this;
      const diag = this._diag;
      diag.fill(0);
      for (let e = 0; e < m; e++) {
        const w = D[e] / L[e];
        diag[edgeA[e]] += w;
        diag[edgeB[e]] += w;
      }
      for (let i = 0; i < n; i++) if (diag[i] <= 0) diag[i] = 1; // isolated-node guard, shouldn't occur post-cropping
      return diag;
    }

    // Jacobi-preconditioned conjugate gradient, with the ground node's
    // row/column pinned to zero (standard technique for solving a
    // Laplacian system, whose null space is otherwise the constant vector
    // -- pressures only matter up to an additive constant, so we fix one).
    // The preconditioner matters a lot here: a real road graph's D_ij/L_ij
    // weights span several orders of magnitude (short, heavily reinforced
    // tubes vs. long, nearly-decayed ones), which makes the *un*-
    // preconditioned system converge far too slowly to be usable at graph
    // sizes in the thousands of edges -- plain CG was observed hitting a
    // 90-iteration cap on every single step without converging before this
    // was added. Also warm-started from the previous timestep's pressures,
    // since D changes only slightly per Euler step -- combined with
    // preconditioning, this is what keeps per-step cost low after the
    // first solve.
    solvePressures(maxIter) {
      const n = this.n;
      const ground = this.ground;
      const p = this.p;
      const r = this._r;
      const d = this._d;
      const z = this._z;
      const Ap = this._Ap;
      const diag = this._buildDiagonal();

      p[ground] = 0;
      this._applyL(p, Ap);
      for (let i = 0; i < n; i++) r[i] = this.I[i] - Ap[i];
      r[ground] = 0;

      for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
      z[ground] = 0;
      d.set(z);

      let rz_old = 0;
      let rNorm2 = 0;
      for (let i = 0; i < n; i++) { rz_old += r[i] * z[i]; rNorm2 += r[i] * r[i]; }
      if (Math.sqrt(rNorm2) < CG_TOL) return 0;

      let iters = 0;
      for (; iters < maxIter; iters++) {
        this._applyL(d, Ap);
        Ap[ground] = 0;
        let dAp = 0;
        for (let i = 0; i < n; i++) dAp += d[i] * Ap[i];
        if (dAp === 0 || !isFinite(dAp)) break;
        const alpha = rz_old / dAp;
        let rNormNew2 = 0;
        for (let i = 0; i < n; i++) {
          p[i] += alpha * d[i];
          r[i] -= alpha * Ap[i];
          rNormNew2 += r[i] * r[i];
        }
        p[ground] = 0;
        r[ground] = 0;
        if (Math.sqrt(rNormNew2) < CG_TOL) {
          iters++;
          break;
        }
        for (let i = 0; i < n; i++) z[i] = r[i] / diag[i];
        z[ground] = 0;
        let rz_new = 0;
        for (let i = 0; i < n; i++) rz_new += r[i] * z[i];
        const beta = rz_new / rz_old;
        for (let i = 0; i < n; i++) d[i] = z[i] + beta * d[i];
        d[ground] = 0;
        rz_old = rz_new;
      }
      return iters;
    }

    // One Euler step of the tube-adaptation ODE dD/dt = f(|Q|) - D.
    // Returns the largest single-edge change in D this step -- used
    // upstream as a convergence signal (the network has "settled" once
    // this stays tiny).
    stepEuler(dt, cgMaxIter) {
      this.lastCgIters = this.solvePressures(cgMaxIter);
      const { edgeA, edgeB, D, L, Q, gamma, fluxScale, m, p } = this;
      let maxDelta = 0;
      for (let e = 0; e < m; e++) {
        const a = edgeA[e], b = edgeB[e];
        const w = D[e] / L[e];
        const flux = w * (p[a] - p[b]);
        Q[e] = flux;
        const scaledQ = Math.abs(flux) / fluxScale;
        const f = Math.pow(scaledQ, gamma) / (1 + Math.pow(scaledQ, gamma));
        let next = D[e] + dt * (f - D[e]);
        if (next < DMIN) next = DMIN;
        const delta = Math.abs(next - D[e]);
        if (delta > maxDelta) maxDelta = delta;
        D[e] = next;
      }
      return maxDelta;
    }
  }

  window.PhysarumGraph = {
    haversineMeters,
    buildFullGraph,
    nearestNode,
    connectedComponent,
    connectedComponentMasked,
    subgraphFromMask,
    dijkstraDistances,
    D0,
    DMIN,
  };
  window.PhysarumSolver = PhysarumSolver;
})();
