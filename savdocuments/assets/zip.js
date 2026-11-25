/** A small ZIP reader and writer (deflate done by the browser), enough for .savdoc and .docx. */
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c; } return t; })();
const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
const enc = new TextEncoder();
export const text = (b) => new TextDecoder().decode(b);

async function pipe(bytes, stream, max = Infinity) {
  const out = [];
  let n = 0;
  const w = stream.writable.getWriter();
  const sent = w.write(bytes).then(() => w.close()).catch(() => {});
  const r = stream.readable.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.length;
    if (n > max) { r.cancel(); throw new Error('zip_too_big'); }
    out.push(value);
  }
  await sent;
  const b = new Uint8Array(n);
  let p = 0;
  for (const c of out) { b.set(c, p); p += c.length; }
  return b;
}

/** files: [[name, string | Uint8Array, {store}]] */
export async function zip(files, type) {
  const parts = [], dir = [];
  let pos = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, data, opt] of files) {
    const raw = typeof data === 'string' ? enc.encode(data) : data, nm = enc.encode(name), crc = crc32(raw);
    const body = opt?.store ? raw : await pipe(raw, new CompressionStream('deflate-raw'));
    const method = opt?.store ? 0 : 8;
    const head = (sig, central) => {
      const v = new DataView(new ArrayBuffer(central ? 46 : 30));
      let o = 0;
      const u16 = (x) => { v.setUint16(o, x, true); o += 2; }, u32 = (x) => { v.setUint32(o, x >>> 0, true); o += 4; };
      u32(sig); if (central) u16(20); u16(20); u16(0x0800); u16(method); u16(time); u16(date); u32(crc); u32(body.length); u32(raw.length); u16(nm.length); u16(0);
      if (central) { u16(0); u16(0); u16(0); u32(0); u32(pos); }
      return new Uint8Array(v.buffer);
    };
    const local = head(0x04034b50, false);
    dir.push(head(0x02014b50, true), nm);
    parts.push(local, nm, body);
    pos += local.length + nm.length + body.length;
  }
  const size = dir.reduce((a, x) => a + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, pos, true);
  return new Blob([...parts, ...dir, new Uint8Array(end.buffer)], { type });
}

/** A Map name -> () => Promise<Uint8Array>. Limits stop files built to fill the memory. */
export async function unzip(buffer, { maxFiles = 3000, maxBytes = 200e6 } = {}) {
  const b = new Uint8Array(buffer), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('file_invalid');
  const count = v.getUint16(e + 10, true);
  if (count > maxFiles) throw new Error('zip_too_big');
  let p = v.getUint32(e + 16, true), left = maxBytes;
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('file_invalid');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = text(b.subarray(p + 46, p + 46 + nl));
    out.set(name, async () => {
      const s = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true), data = b.slice(s, s + csize);
      const raw = method === 0 ? data : await pipe(data, new DecompressionStream('deflate-raw'), left);
      left -= raw.length;
      if (left < 0) throw new Error('zip_too_big');
      return raw;
    });
    p += 46 + nl + xl + cl;
  }
  return out;
}
