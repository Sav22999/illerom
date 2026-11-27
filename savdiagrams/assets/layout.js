/**
 * Automatic layout of a tree: the nodes reachable from a root through the connectors, placed as a tidy tree. down: an
 * org chart (children under their parent); right: a tree that grows to the right; both: a mind map, the branches shared
 * between the two sides of the root. The root stays where it is; the connectors get the sides that suit the tree.
 */
const GAP = { down: [36, 70], side: [22, 80] }; // [between siblings, between levels]

/** The children of every node reachable from root (each node once, the nearest parent wins). */
export function treeOf(items, root) {
  const nodes = new Map(items.filter((i) => i.t === 'node').map((i) => [i.id, i]));
  const adj = new Map();
  for (const e of items) {
    if (e.t !== 'edge' || !e.a?.n || !e.b?.n || !nodes.has(e.a.n) || !nodes.has(e.b.n)) continue;
    for (const [p, q] of [[e.a.n, e.b.n], [e.b.n, e.a.n]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push([q, e]); }
  }
  const kids = new Map(), seen = new Set([root]), edges = new Map();
  let level = [root];
  while (level.length) {
    const next = [];
    for (const p of level) {
      const list = [];
      // children in their order on the page, so a layout run twice keeps them where they are
      for (const [q, e] of (adj.get(p) || []).slice().sort((x, y) => (nodes.get(x[0]).y - nodes.get(y[0]).y) || (nodes.get(x[0]).x - nodes.get(y[0]).x))) {
        if (seen.has(q)) continue;
        seen.add(q); list.push(q); next.push(q); edges.set(q, [e, p]);
      }
      kids.set(p, list);
    }
    level = next;
  }
  return { nodes, kids, edges, ids: seen };
}

/** {moves: Map id -> {x, y}, ends: Map edge id -> {a, b}} for a tree laid out from root. */
export function layoutTree(items, root, dir = 'down') {
  const { nodes, kids, edges } = treeOf(items, root);
  const r = nodes.get(root);
  if (!r) return { moves: new Map(), ends: new Map() };
  const moves = new Map(), ends = new Map();
  const vertical = dir === 'down';
  const [gs, gl] = vertical ? GAP.down : GAP.side;
  // the size of a subtree across the direction of growth
  const span = new Map();
  const across = (id) => (vertical ? nodes.get(id).w : nodes.get(id).h);
  const along = (id) => (vertical ? nodes.get(id).h : nodes.get(id).w);
  const measure = (id) => { const ks = kids.get(id) || []; const s = ks.reduce((a, k) => a + measure(k), 0) + gs * Math.max(0, ks.length - 1); const v = Math.max(across(id), s); span.set(id, v); return v; };
  // place: id at depth position `at` (along), its subtree from `from` (across); sign: +1 right/down, -1 left
  const place = (id, at, from, sign) => {
    const n = nodes.get(id), list = kids.get(id) || [], mid = from + span.get(id) / 2;
    if (id !== root) moves.set(id, vertical ? { x: mid - n.w / 2, y: at } : { x: sign > 0 ? at : at - n.w, y: mid - n.h / 2 });
    const childAt = sign > 0 ? at + along(id) + gl : at - along(id) - gl;
    const total = list.reduce((a, k) => a + span.get(k), 0) + gs * Math.max(0, list.length - 1);
    let c = mid - total / 2;
    for (const k of list) {
      place(k, childAt, c, sign);
      c += span.get(k) + gs;
      const [e, p] = edges.get(k);
      const fwd = e.a.n === p;
      const out = vertical ? 'b' : sign > 0 ? 'r' : 'l', inn = vertical ? 't' : sign > 0 ? 'l' : 'r';
      ends.set(e.id, fwd ? { a: { n: p, p: out }, b: { n: k, p: inn } } : { a: { n: k, p: inn }, b: { n: p, p: out } });
    }
  };
  measure(root);
  if (dir === 'both') {
    // the branches go right and left, as even as their sizes allow
    const list = kids.get(root) || [], right = [], left = [];
    let sr = 0, sl = 0;
    for (const k of list) { if (sr <= sl) { right.push(k); sr += span.get(k) + gs; } else { left.push(k); sl += span.get(k) + gs; } }
    const cy = r.y + r.h / 2;
    const run = (group, sign) => {
      const total = group.reduce((a, k) => a + span.get(k), 0) + gs * Math.max(0, group.length - 1);
      let c = cy - total / 2;
      for (const k of group) {
        place(k, sign > 0 ? r.x + r.w + gl : r.x - gl, c, sign);
        c += span.get(k) + gs;
        const [e] = edges.get(k), fwd = e.a.n === root;
        ends.set(e.id, fwd ? { a: { n: root, p: sign > 0 ? 'r' : 'l' }, b: { n: k, p: sign > 0 ? 'l' : 'r' } } : { a: { n: k, p: sign > 0 ? 'l' : 'r' }, b: { n: root, p: sign > 0 ? 'r' : 'l' } });
      }
    };
    run(right, 1); run(left, -1);
  } else if (vertical) place(root, r.y, r.x + r.w / 2 - span.get(root) / 2, 1);
  else place(root, r.x, r.y + r.h / 2 - span.get(root) / 2, 1);
  return { moves, ends };
}

/** The root of the tree a node belongs to: the node with no parent above it (the first one found climbing up the arrows). */
export function rootOf(items, id) {
  const parent = new Map();
  for (const e of items) if (e.t === 'edge' && e.a?.n && e.b?.n && !parent.has(e.b.n)) parent.set(e.b.n, e.a.n);
  const seen = new Set();
  let cur = id;
  while (parent.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parent.get(cur); }
  return cur;
}
