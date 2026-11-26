/**
 * Opening a PPT (PowerPoint 97-2003, binary): the texts of each slide — title and body, also those inside shapes — and the
 * speaker notes, on the layouts of SavPresentations (cover, title and text). Pictures, positions and formatting of those old
 * files are not read: for them, PPTX.
 */
import {cfb} from './cfb.js';
import {makeSlide} from './layouts.js';
import {context} from './themes.js';

// record types of the "PowerPoint Document" stream
const SLIDE = 0x03ee, NOTES = 0x03f0, SLWT = 0x0ff0, PERSIST = 0x03f3, HEADER = 0x0f9f, CHARS = 0x0fa0, BYTES = 0x0fa8, SLIDE_ATOM = 0x03ef;
const WIN = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';
const latin = (u8) => { let s = ''; for (const c of u8) s += c >= 0x80 && c < 0xa0 ? WIN[c - 0x80] : String.fromCharCode(c); return s; };

export function readPpt(bytes, name) {
  const f = cfb(bytes), doc = f.stream('PowerPoint Document');
  if (!doc) throw new Error('unknown file');
  const v = new DataView(doc.buffer, doc.byteOffset, doc.byteLength);
  /** The records inside [start, end): {type, ver, inst, start, len}. */
  const records = (start, end) => {
    const out = [];
    for (let p = start; p + 8 <= end;) {
      const vi = v.getUint16(p, true), type = v.getUint16(p + 2, true), len = v.getUint32(p + 4, true);
      if (len > end - p - 8 + 1) break;
      out.push({type, ver: vi & 0xf, inst: vi >> 4, start: p + 8, len});
      p += 8 + len;
    }
    return out;
  };
  const textOf = (r) => (r.type === CHARS ? new TextDecoder('utf-16le').decode(doc.subarray(r.start, r.start + r.len)) : latin(doc.subarray(r.start, r.start + r.len))).replace(/\r/g, '\n').replace(/[\x0b]/g, '\n').replace(/[\x00-\x08\x0e-\x1f]/g, '');
  /** The texts found inside a container, with their kind (0 title, 1 body, 2 notes, 4 centred body, 5 centred title, 6 half body, 7 quarter body, 8 other). */
  const texts = (start, end, out = []) => {
    let kind = 8;
    for (const r of records(start, end)) {
      if (r.ver === 0xf) texts(r.start, r.start + r.len, out);
      else if (r.type === HEADER) kind = v.getUint32(r.start, true);
      else if (r.type === CHARS || r.type === BYTES) { const t = textOf(r).trim(); if (t && t !== '*') out.push({kind, t}); }
    }
    return out;
  };
  const top = records(0, doc.length);
  // 1) the list of the slides with their texts (the usual place in files of PowerPoint)
  const fromList = [];
  for (const r of top) {
    if (r.ver !== 0xf) continue;
    for (const lst of records(r.start, r.start + r.len).filter((x) => x.type === SLWT && x.inst === 0)) {
      let cur = null, kind = 8;
      for (const x of records(lst.start, lst.start + lst.len)) {
        if (x.type === PERSIST) { cur = []; fromList.push(cur); kind = 8; }
        else if (x.type === HEADER) kind = v.getUint32(x.start, true);
        else if ((x.type === CHARS || x.type === BYTES) && cur) { const t = textOf(x).trim(); if (t) cur.push({kind, t}); }
      }
    }
  }
  // 2) the slides themselves (text kept in their shapes, as newer programs write them), and the notes
  const fromSlides = [], notes = [];
  const scan = (start, end) => { for (const r of records(start, end)) { if (r.type === SLIDE) fromSlides.push(texts(r.start, r.start + r.len)); else if (r.type === NOTES) notes.push(texts(r.start, r.start + r.len).filter((x) => x.kind === 2 || x.kind === 1 || x.kind === 8).map((x) => x.t).join('\n')); else if (r.ver === 0xf && r.type !== SLIDE_ATOM) scan(r.start, r.start + r.len); } };
  scan(0, doc.length);
  const n = Math.max(fromList.length, fromSlides.length);
  if (!n) throw new Error('unknown file');
  const meta = {format: {id: '4-3', w: 1024, h: 768}, theme: {id: 'paper', colors: {bg: '#ffffff', fg: '#111111', accent: '#1f6feb', accent2: '#e8590c', surface: '#f3f4f6'}, fonts: {}}, opts: {}};
  // the size of the slides: DocumentAtom (inside the Document container), in master units (576 per inch)
  for (const r of top) if (r.type === 0x03e8 && r.ver === 0xf) for (const a of records(r.start, r.start + r.len)) if (a.type === 0x03e9 && a.len >= 8) {
    const w = Math.round(v.getInt32(a.start, true) / 6), h = Math.round(v.getInt32(a.start + 4, true) / 6);
    if (w > 200 && h > 200 && w < 4000 && h < 4000) meta.format = {id: Math.abs(w / h - 16 / 9) < .02 ? '16-9' : Math.abs(w / h - 4 / 3) < .02 ? '4-3' : 'custom', w, h};
  }
  const ctx = context(meta), slides = [];
  for (let i = 0; i < n; i++) {
    const list = (fromList[i]?.length ? fromList[i] : fromSlides[i]) || [];
    const title = list.find((x) => x.kind === 0 || x.kind === 5)?.t || '', rest = list.filter((x) => x.t !== title);
    const body = rest.map((x) => x.t).join('\n');
    const cover = i === 0 && rest.length <= 1 && (rest[0]?.t.length || 0) < 120;
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
    const s = cover ? makeSlide('cover', ctx, {title: title || lines[0] || '', subtitle: title ? lines.join(' ') : lines.slice(1).join(' ')}) : makeSlide('title-body', ctx, {title, body: lines.length > 1 ? lines.map((l) => '- ' + l).join('\n') : lines[0] || ''});
    if (notes[i]) s.d.notes = notes[i];
    slides.push({sid: s.sid, pos: i + 1, d: s.d});
  }
  return {title: name.replace(/\.ppt$/i, ''), meta, slides};
}
