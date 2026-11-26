/**
 * Kind "assign": everyone says, for each slot, whether they are available (2), could free themselves (1) or are not
 * available (nothing); then each person gets one slot of their own. This module finds the ways of doing it.
 *
 * The best solution is a minimum-cost assignment (Hungarian method). In order of importance it:
 *   1. places as many people as possible;
 *   2. forces as few people as possible into a slot they said they are not available for (only when forcing is allowed);
 *   3. uses as few "I could free myself" as possible;
 *   4. when someone must free themselves or be forced, it is preferably who answered last: answering first gives priority.
 * The other solutions come in order of cost from Murty's method (each one differs from the others in at least one person),
 * within a time budget, so that a large schedule never freezes the page.
 */

const BIG = Infinity; // a forbidden pair

/**
 * Minimum-cost assignment of n rows to m ≥ n columns (e-maxx Hungarian, O(n²m)). cost[i][j] ≥ BIG means forbidden.
 * Returns {cols: column of each row, cost} or null when there is no allowed assignment.
 */
function hungarian(cost, n, m) {
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0], row = cost[i0 - 1];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = row[j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      if (j1 === 0 || delta === Infinity) return null;
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const cols = new Int32Array(n);
  for (let j = 1; j <= m; j++) if (p[j]) cols[p[j] - 1] = j - 1;
  let total = 0;
  for (let i = 0; i < n; i++) { const c = cost[i][cols[i]]; if (c >= BIG) return null; total += c; }
  return { cols, cost: total };
}

/**
 * people: [{id, choices: {optionId: 1|2}}] in the order they answered (the first has priority).
 * options: [{id}] (the slots, one person each). force: a person may get a slot they are not available for.
 * Returns {best, more(limit, ms) → further solutions, describe(map)}; a solution is
 * {map: Map(personId → optionId), placed, available, maybe, forced, out: [personId], cost}.
 */
export function solver(people, options, { force = false } = {}) {
  const n = people.length, m = options.length, cols = m + n; // a column per slot, then one "left out" column per person
  // each level costs more than everything below it put together, so the order of importance holds for any n
  const MAYBE = n * n + 1, FORCED = n * (MAYBE + 2 * n) + 1, OUT = n * (FORCED + 2 * n) + 1;
  const base = people.map((p, r) => {
    const w = n - r; // who answered first weighs more: their sacrifices cost more
    const row = new Float64Array(cols).fill(BIG);
    options.forEach((o, j) => { const v = p.choices[o.id]; row[j] = v === 2 ? 0 : v === 1 ? MAYBE + w : force ? FORCED + w : BIG; });
    row[m + r] = OUT + w;
    return row;
  });
  const solve = (fixed, banned) => {
    // fixed: [row, col] pairs that must stay; banned: [row, col] pairs that may not be used
    const cost = base.map((r) => Float64Array.from(r));
    for (const [i, j] of banned) cost[i][j] = BIG;
    for (const [i, j] of fixed) { for (let c = 0; c < cols; c++) if (c !== j) cost[i][c] = BIG; for (let k = 0; k < n; k++) if (k !== i) cost[k][j] = BIG; }
    return n ? hungarian(cost, n, cols) : { cols: new Int32Array(0), cost: 0 };
  };
  const describe = (map) => {
    const out = [];
    let available = 0, maybe = 0, forced = 0;
    for (const p of people) {
      const o = map.get(p.id);
      if (o == null) { out.push(p.id); continue; }
      const v = p.choices[o];
      if (v === 2) available++; else if (v === 1) maybe++; else forced++;
    }
    return { placed: n - out.length, available, maybe, forced, out };
  };
  const toSolution = (res) => {
    const map = new Map();
    people.forEach((p, i) => { const c = res.cols[i]; if (c < m) map.set(p.id, options[c].id); });
    return { map, cost: res.cost, ...describe(map) };
  };

  const first = solve([], []);
  const best = first ? toSolution(first) : { map: new Map(), cost: 0, ...describe(new Map()) };
  // Murty: a queue of subproblems, each with its best solution; the cheapest one is the next solution
  const queue = first ? [{ res: first, fixed: [], banned: [] }] : [];
  let found = 0, worse = false;
  /** The next solutions as good as the best in what matters (as many placed, as few forced); fewer "could free myself" may differ. */
  const more = (limit = 20, ms = 900) => {
    const until = performance.now() + ms, out = [];
    while (queue.length && !worse && out.length < limit && performance.now() < until) {
      queue.sort((a, b) => a.res.cost - b.res.cost);
      const { res, fixed, banned } = queue.shift();
      const sol = toSolution(res);
      // in order of cost: once one places fewer people or forces more, all the next ones do too
      if (sol.placed < best.placed || sol.forced > best.forced) { worse = true; break; }
      if (found++) out.push(sol);
      const fixedRows = new Set(fixed.map(([i]) => i));
      const nextFixed = [...fixed];
      for (let i = 0; i < n; i++) {
        if (fixedRows.has(i)) continue;
        const nb = [...banned, [i, res.cols[i]]];
        const r2 = solve(nextFixed, nb);
        if (r2) queue.push({ res: r2, fixed: [...nextFixed], banned: nb });
        nextFixed.push([i, res.cols[i]]);
        if (performance.now() > until + ms) break; // a very large schedule: stop splitting, keep what is there
      }
    }
    return out;
  };
  return { best, more, describe, done: () => worse || !queue.length };
}

/** How many people sit in a different slot in b than in a. */
export const changes = (a, b) => { let k = 0; for (const [p, o] of b) if (a.get(p) !== o) k++; for (const p of a.keys()) if (!b.has(p)) k++; return k; };
