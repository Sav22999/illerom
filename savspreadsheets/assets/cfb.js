/**
 * The container of the old Office files (.doc, .ppt, .xls): Compound File Binary, "OLE2". Only reading, without libraries:
 * cfb(bytes).stream('WordDocument') gives the bytes of a stream, or null. The same file is in SavPresentations.
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

/**
 * Writes a compound file with one stream (as Excel 97–2003 keeps its "Workbook"). Sectors of 512 bytes; a stream
 * smaller than 4096 bytes is padded, so no mini stream is needed.
 */
export function cfbWrite(name, data) {
  const SS = 512, END = 0xfffffffe, FREE = 0xffffffff, FATS = 0xfffffffd, DIFS = 0xfffffffc;
  const body = data.length < 4096 ? Object.assign(new Uint8Array(4096), {}) : data;
  if (body !== data) body.set(data);
  const n = Math.ceil(body.length / SS);
  // sectors: the stream, one of directory, the FAT ones, the DIFAT ones (only for big files)
  let m = 1, k = 0;
  for (;;) { const total = n + 1 + m + k, m2 = Math.ceil(total / 128), k2 = m2 > 109 ? Math.ceil((m2 - 109) / 127) : 0; if (m2 === m && k2 === k) break; m = m2; k = k2; }
  const dirSec = n, fatStart = n + 1, difStart = n + 1 + m, total = n + 1 + m + k;
  const out = new Uint8Array(SS * (1 + total)), v = new DataView(out.buffer);
  const sec = (i) => SS * (i + 1);
  out.set(body, sec(0));
  // header
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => { out[i] = b; });
  v.setUint16(24, 0x3e, true); v.setUint16(26, 3, true); v.setUint16(28, 0xfffe, true); v.setUint16(30, 9, true); v.setUint16(32, 6, true);
  v.setUint32(44, m, true); v.setUint32(48, dirSec, true); v.setUint32(56, 4096, true); v.setUint32(60, END, true); v.setUint32(64, 0, true);
  v.setUint32(68, k ? difStart : END, true); v.setUint32(72, k, true);
  for (let i = 0; i < 109; i++) v.setUint32(76 + i * 4, i < m ? fatStart + i : FREE, true);
  // DIFAT sectors: the FAT sectors after the first 109, 127 per sector, then the next one
  for (let d = 0; d < k; d++) { const o = sec(difStart + d); for (let i = 0; i < 127; i++) { const f = 109 + d * 127 + i; v.setUint32(o + i * 4, f < m ? fatStart + f : FREE, true); } v.setUint32(o + 508, d + 1 < k ? difStart + d + 1 : END, true); }
  // FAT
  const fat = new Uint32Array(m * 128).fill(FREE);
  for (let i = 0; i < n; i++) fat[i] = i + 1 < n ? i + 1 : END;
  fat[dirSec] = END;
  for (let i = 0; i < m; i++) fat[fatStart + i] = FATS;
  for (let i = 0; i < k; i++) fat[difStart + i] = DIFS;
  for (let i = 0; i < m; i++) for (let j = 0; j < 128; j++) v.setUint32(sec(fatStart + i) + j * 4, fat[i * 128 + j], true);
  // directory: the root and the stream
  const entry = (i, nm, type, child, start, size) => {
    const o = sec(dirSec) + i * 128;
    for (let j = 0; j < nm.length; j++) v.setUint16(o + j * 2, nm.charCodeAt(j), true);
    v.setUint16(o + 64, (nm.length + 1) * 2, true);
    out[o + 66] = type; out[o + 67] = 1;
    v.setUint32(o + 68, FREE, true); v.setUint32(o + 72, FREE, true); v.setUint32(o + 76, child, true);
    v.setUint32(o + 116, start, true); v.setUint32(o + 120, size, true);
  };
  entry(0, 'Root Entry', 5, 1, END, 0);
  entry(1, name, 2, FREE, 0, body.length);
  for (let i = 2; i < 4; i++) { const o = sec(dirSec) + i * 128; v.setUint32(o + 68, FREE, true); v.setUint32(o + 72, FREE, true); v.setUint32(o + 76, FREE, true); }
  return out;
}
