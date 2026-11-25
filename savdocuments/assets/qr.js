/** QR codes: byte mode, error correction M, versions 1 to 14 (about 360 characters). Returns rows of booleans. */
const EC = [[10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5], [30, 5], [22, 8], [22, 9], [24, 9]]; // per version: codewords of correction per block, blocks
const EXP = [], LOG = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 285; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rs(data, n) {
  let g = [1];
  for (let i = 0; i < n; i++) { const q = Array(g.length + 1).fill(0); g.forEach((c, j) => { q[j] ^= c; q[j + 1] ^= mul(c, EXP[i]); }); g = q; }
  const r = [...data, ...Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) { const f = r[i]; if (f) g.forEach((c, j) => { r[i + j] ^= mul(c, f); }); }
  return r.slice(data.length);
}
const modules = (v) => { // data modules of a version
  let n = (16 * v + 128) * v + 64;
  if (v > 1) { const a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v > 6) n -= 36; }
  return n;
};
const aligns = (v) => {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, size = v * 4 + 17, step = Math.ceil((size - 13) / (2 * n - 2)) * 2, out = [6];
  for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
};
export const QR_MAX = 350;
export function qr(text) {
  const bytes = [...new TextEncoder().encode(text.slice(0, QR_MAX))];
  let v = 1;
  const room = (x) => Math.floor(modules(x) / 8) - EC[x - 1][0] * EC[x - 1][1];
  while (v < 14 && room(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
  const cap = room(v), bits = [];
  const push = (x, n) => { for (let i = n - 1; i >= 0; i--) bits.push((x >> i) & 1); };
  bytes.length = Math.min(bytes.length, cap - (v < 10 ? 2 : 3));
  push(4, 4); push(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => push(b, 8)); push(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 236; data.length < cap; p ^= 253) data.push(p);
  // blocks, short ones first
  const [ecn, nb] = EC[v - 1], total = Math.floor(modules(v) / 8), short = nb - (total % nb), len = Math.floor(total / nb) - ecn, blocks = [];
  for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k += len + (i >= short ? 1 : 0)); blocks.push({ d, e: rs(d, ecn) }); }
  const all = [];
  for (let i = 0; i <= len; i++) blocks.forEach((b) => { if (i < b.d.length) all.push(b.d[i]); });
  for (let i = 0; i < ecn; i++) blocks.forEach((b) => all.push(b.e[i]));
  // drawing
  const S = v * 4 + 17, m = Array.from({ length: S }, () => Array(S).fill(null)), fn = Array.from({ length: S }, () => Array(S).fill(false));
  const set = (x, y, d) => { if (x >= 0 && y >= 0 && x < S && y < S) { m[y][x] = d; fn[y][x] = true; } };
  for (let i = 0; i < S; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [S - 4, 3], [3, S - 4]]) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const d = Math.max(Math.abs(x), Math.abs(y)); set(cx + x, cy + y, d !== 2 && d !== 4); }
  const al = aligns(v);
  al.forEach((y, i) => al.forEach((x, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) set(x + a, y + b, Math.max(Math.abs(a), Math.abs(b)) !== 1); }));
  const format = (mask) => {
    const d = mask; // M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >> 9) * 0x537);
    const f = ((d << 10) | r) ^ 0x5412, bit = (i) => ((f >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(S - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, S - 15 + i, bit(i));
    set(8, S - 8, true);
  };
  format(0);
  if (v > 6) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >> 11) * 0x1F25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const a = S - 11 + (i % 3), c = Math.floor(i / 3), d = ((b >> i) & 1) === 1; set(a, c, d); set(c, a, d); }
  }
  let k = 0;
  for (let right = S - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < S; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? S - 1 - vert : vert;
      if (!fn[y][x]) { m[y][x] = k < all.length * 8 ? ((all[k >> 3] >> (7 - (k & 7))) & 1) === 1 : false; k++; }
    }
  }
  const MASK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const apply = (i) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!fn[y][x] && MASK[i](x, y)) m[y][x] = !m[y][x]; };
  const score = () => {
    let s = 0, dark = 0;
    for (const t of [(a, b) => m[a][b], (a, b) => m[b][a]]) for (let a = 0; a < S; a++) { let run = 1; for (let b = 1; b < S; b++) { if (t(a, b) === t(a, b - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; } }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (m[y][x]) dark++; if (x && y && m[y][x] === m[y - 1][x] && m[y][x] === m[y][x - 1] && m[y][x] === m[y - 1][x - 1]) s += 3; }
    return s + Math.floor(Math.abs((dark * 20) / (S * S) - 10)) * 10;
  };
  let best = 0, low = Infinity;
  for (let i = 0; i < 8; i++) { apply(i); format(i); const s = score(); if (s < low) { low = s; best = i; } apply(i); }
  apply(best); format(best);
  return m;
}
