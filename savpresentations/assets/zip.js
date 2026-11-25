/** Reading and writing ZIP files (PPTX, ODP and SAVPRE are ZIPs) with the browser's own compression. */
const te = new TextEncoder();
const CRC = (() => {
    const tb = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        tb[i] = c >>> 0;
    }
    return tb;
})();
export const crc32 = (b) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
};

export async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export const deflateRaw = (b) => pipe(b, new CompressionStream('deflate-raw'));
export const deflate = (b) => pipe(b, new CompressionStream('deflate'));
export const inflate = (b) => pipe(b, new DecompressionStream('deflate'));

/** files: [[name, string | Uint8Array | Blob, {store}]] */
export async function zip(files, type = 'application/zip') {
    const parts = [], dir = [];
    let off = 0;
    for (const [name, data, opt] of files) {
        const raw = typeof data === 'string' ? te.encode(data) : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
        const store = opt?.store || /\.(png|jpe?g|gif|webp|mp4)$/i.test(name),
            body = store ? raw : await deflateRaw(raw), n = te.encode(name), crc = crc32(raw);
        const head = new DataView(new ArrayBuffer(30));
        head.setUint32(0, 0x04034b50, true);
        head.setUint16(4, 20, true);
        head.setUint16(6, 0x0800, true);
        head.setUint16(8, store ? 0 : 8, true);
        head.setUint16(10, 0, true);
        head.setUint16(12, 0x5a21, true);
        head.setUint32(14, crc, true);
        head.setUint32(18, body.length, true);
        head.setUint32(22, raw.length, true);
        head.setUint16(26, n.length, true);
        parts.push(head.buffer, n, body);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(10, store ? 0 : 8, true);
        c.setUint16(14, 0x5a21, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, body.length, true);
        c.setUint32(24, raw.length, true);
        c.setUint16(28, n.length, true);
        c.setUint32(42, off, true);
        dir.push(c.buffer, n);
        off += 30 + n.length + body.length;
    }
    const size = dir.reduce((a, d) => a + (d.byteLength ?? d.length), 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, off, true);
    return new Blob([...parts, ...dir, end.buffer], {type});
}

/** Opens a ZIP: {names, bytes(name), text(name)}. Sizes are limited, so a malicious file cannot fill the memory. */
export async function unzip(blob, max = 300e6) {
    const buf = new Uint8Array(await blob.arrayBuffer()), v = new DataView(buf.buffer);
    let e = buf.length - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a zip');
    const n = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true), total = 0;
    const files = new Map();
    for (let i = 0; i < n && p + 46 <= buf.length; i++) {
        if (v.getUint32(p, true) !== 0x02014b50) break;
        const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
        const f = {
            method: v.getUint16(p + 10, true),
            csize: v.getUint32(p + 20, true),
            size: v.getUint32(p + 24, true),
            off: v.getUint32(p + 42, true)
        };
        total += f.size;
        if (total > max) throw new Error('too big');
        files.set(new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl)), f);
        p += 46 + nl + xl + cl;
    }
    const bytes = async (name) => {
        const f = files.get(name);
        if (!f) return null;
        const s = f.off + 30 + v.getUint16(f.off + 26, true) + v.getUint16(f.off + 28, true),
            raw = buf.subarray(s, s + f.csize);
        if (!f.method) return raw;
        const out = await pipe(raw, new DecompressionStream('deflate-raw'));
        if (out.length > f.size + 1024) throw new Error('bad zip');
        return out;
    };
    return {
        names: [...files.keys()], bytes, text: async (name) => {
            const b = await bytes(name);
            return b ? new TextDecoder().decode(b) : null;
        }
    };
}
