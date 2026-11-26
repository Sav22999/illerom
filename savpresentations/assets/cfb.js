/**
 * The container of the old Office files (.doc, .ppt, .xls): Compound File Binary, "OLE2". Only reading, without libraries:
 * cfb(bytes).stream('WordDocument') gives the bytes of a stream, or null. The same file is in SavDocuments.
 */
export function cfb(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 512 || v.getUint32(0, true) !== 0xe011cfd0 || v.getUint32(4, true) !== 0xe11ab1a1) throw new Error('file_invalid');
  const ss = 1 << v.getUint16(30, true), ms = 1 << v.getUint16(32, true), END = 0xfffffffa;
  const nFat = v.getUint32(44, true), dirStart = v.getUint32(48, true), cutoff = v.getUint32(56, true), miniStart = v.getUint32(60, true), difStart = v.getUint32(68, true), nDif = v.getUint32(72, true);
  const off = (s) => (s + 1) * ss, u32 = (o) => (o + 4 <= b.length ? v.getUint32(o, true) : END);
  // the sectors of the allocation table: 109 in the header, the others in a chain of their own
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(u32(76 + i * 4));
  for (let d = difStart, k = 0; k < nDif && d < END; k++) { for (let i = 0; i < ss / 4 - 1 && fatSecs.length < nFat; i++) fatSecs.push(u32(off(d) + i * 4)); d = u32(off(d) + ss - 4); }
  const fat = new Uint32Array(fatSecs.length * (ss / 4));
  fatSecs.forEach((s, k) => { for (let i = 0; i < ss / 4; i++) fat[k * (ss / 4) + i] = u32(off(s) + i * 4); });
  const chain = (start, table) => { const out = [], seen = new Set(); for (let s = start; s < END && s < table.length && !seen.has(s); s = table[s]) { seen.add(s); out.push(s); } return out; };
  const big = (start, size) => {
    const secs = chain(start, fat), out = new Uint8Array(size ?? secs.length * ss);
    let p = 0;
    for (const s of secs) { const n = Math.min(ss, out.length - p); if (n <= 0) break; out.set(b.subarray(off(s), off(s) + n), p); p += n; }
    return out;
  };
  // the directory: 128 bytes for each entry
  const dir = big(dirStart), dv = new DataView(dir.buffer), entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = dv.getUint16(o + 64, true), type = dir[o + 66];
    if (!type || len < 2) continue;
    let name = '';
    for (let i = 0; i < len - 2; i += 2) name += String.fromCharCode(dv.getUint16(o + i, true));
    entries.push({ name, type, start: dv.getUint32(o + 116, true), size: dv.getUint32(o + 120, true) });
  }
  const root = entries.find((e) => e.type === 5);
  const mini = root ? big(root.start, root.size) : new Uint8Array(0), miniFatBytes = big(miniStart), miniFat = new Uint32Array(miniFatBytes.buffer, 0, miniFatBytes.length >> 2);
  const small = (start, size) => {
    const out = new Uint8Array(size);
    let p = 0;
    for (const s of chain(start, miniFat)) { const n = Math.min(ms, size - p); if (n <= 0) break; out.set(mini.subarray(s * ms, s * ms + n), p); p += n; }
    return out;
  };
  return {
    names: entries.map((e) => e.name),
    stream(name) {
      const e = entries.find((x) => x.type === 2 && x.name.toLowerCase() === name.toLowerCase());
      if (!e) return null;
      return e.size < cutoff ? small(e.start, e.size) : big(e.start, e.size);
    },
  };
}
