/**
 * SavNewsletters — the .savnew file: a whole newsletter to keep on the device, send to someone, or open in another group
 * (or on another SavNewsletters), like .savsch of SavSchedules and .savdoc of SavDocuments.
 *
 * A ZIP (assets/zip.js, the same of the other apps of SavOffice) with:
 *   mimetype          application/vnd.savnewsletters.newsletter+zip (first, not compressed)
 *   newsletter.json   {format: "savnew", version: 1, subject, preheader, lang, doc, images: {"img:ID": "images/ID.ext"}}
 *   images/ID.ext     the pictures uploaded to the group that the newsletter shows (they live in the group, not in the
 *                     document: without them the newsletter would open with empty images somewhere else)
 * Opening one makes a new draft in a group: its pictures are uploaded to that group first, then the document points to
 * them. Nothing about the group, its subscribers or the sending travels in the file.
 */
import {text, unzip, zip} from './zip.js?v=25';
import {api} from './ui.js?v=25';

export const SAVNEW = 'application/vnd.savnewsletters.newsletter+zip';
const IMG = /^img:[a-f0-9]{20}$/;
const EXT = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp'};
const MIME = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp'};
const bad = (code) => Object.assign(new Error(code), {code});

export const fileName = (title) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'newsletter') + '.savnew';

/** Inside the Android app: the file goes to the app in pieces, then the system asks where to keep it. */
const inApp = () => /SavNewslettersApp\/Android/.test(navigator.userAgent) && !!(window.SavNewslettersAndroid && window.SavNewslettersAndroid.saveFile);

async function saveInApp(blob, name) {
    // the pieces end at a multiple of 4 characters, so each one can be decoded alone
    const b64 = await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(String(fr.result).split(',')[1]);
        fr.readAsDataURL(blob);
    });
    window.SavNewslettersAndroid.saveBegin(name, blob.type || 'application/octet-stream');
    for (let i = 0; i < b64.length; i += 524288) window.SavNewslettersAndroid.saveFile(b64.slice(i, i + 524288));
    window.SavNewslettersAndroid.saveEnd();
}

export function download(blob, name) {
    if (inApp()) return void saveInApp(blob, name);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/** Every string of the document that is a picture of the group ("img:…"), or the document with them replaced. */
function walk(v, fn) {
    if (typeof v === 'string') return IMG.test(v) ? fn(v) : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, fn));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, fn)]));
    return v;
}

/** The .savnew of a newsletter: {subject, preheader, lang, doc}. */
export async function toSavnew(nl) {
    const refs = new Set();
    walk(nl.doc, (s) => (refs.add(s), s));
    const files = [['mimetype', SAVNEW, {store: true}]], images = {};
    for (const ref of refs) {
        const id = ref.slice(4);
        const r = await fetch('api/?r=img&id=' + id, {credentials: 'same-origin'});
        if (!r.ok) continue; // a picture deleted in the meantime: the newsletter opens without it
        const blob = await r.blob();
        const path = 'images/' + id + '.' + (EXT[blob.type] || 'jpg');
        // pictures are already compressed: stored as they are
        files.push([path, new Uint8Array(await blob.arrayBuffer()), {store: true}]);
        images[ref] = path;
    }
    const json = {format: 'savnew', version: 1, subject: nl.subject || '', preheader: nl.preheader || '', lang: nl.lang || null, doc: nl.doc, images};
    files.splice(1, 0, ['newsletter.json', JSON.stringify(json, null, 1)]);
    return zip(files, SAVNEW);
}

export async function saveSavnew(nl) {
    download(await toSavnew(nl), fileName(nl.subject));
}

/** Reads a .savnew (or only the JSON inside one): {subject, preheader, lang, doc, images: Map ref → Blob}. */
export async function readSavnew(file) {
    if (file.size > 30e6) throw bad('file_big');
    const buf = await file.arrayBuffer();
    let json, files = null;
    try {
        const head = new Uint8Array(buf.slice(0, 2));
        if (head[0] === 0x50 && head[1] === 0x4b) {
            files = await unzip(buf, {maxFiles: 300, maxBytes: 60e6});
            const f = files.get('newsletter.json');
            if (!f) throw 0;
            json = JSON.parse(text(await f()));
        } else json = JSON.parse(text(new Uint8Array(buf)));
    } catch (e) {
        throw bad('file_invalid');
    }
    if (!json || json.format !== 'savnew' || !json.doc || typeof json.doc !== 'object' || !Array.isArray(json.doc.blocks)) throw bad('file_invalid');
    const images = new Map();
    if (files && json.images && typeof json.images === 'object') {
        for (const [ref, path] of Object.entries(json.images)) {
            if (!IMG.test(ref) || typeof path !== 'string' || !files.get(path)) continue;
            const type = MIME[path.split('.').pop().toLowerCase()];
            if (type) images.set(ref, new Blob([await files.get(path)()], {type}));
        }
    }
    return {subject: String(json.subject || '').slice(0, 200), preheader: String(json.preheader || '').slice(0, 200), lang: typeof json.lang === 'string' ? json.lang : null, doc: json.doc, images};
}

const dataUrl = (blob) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(bad('file_invalid'));
    r.readAsDataURL(blob);
});

/** Opens a .savnew as a new draft of the group: its pictures go to the group first. Returns the new newsletter. */
export async function openSavnew(file, group) {
    const f = await readSavnew(file);
    const moved = new Map();
    for (const [ref, blob] of f.images) moved.set(ref, (await api('img.upload', {group: group.id, data: await dataUrl(blob)})).src);
    // a picture that did not travel with the file (only the JSON, or deleted before saving) is left out
    const doc = walk(f.doc, (s) => moved.get(s) || '');
    const lang = f.lang && (group.langs || []).includes(f.lang) ? f.lang : '';
    return (await api('nl.create', {group: group.id, subject: f.subject, preheader: f.preheader, lang, doc})).newsletter;
}

/** Asks for a .savnew on the device. */
export function pickSavnew() {
    return new Promise((ok) => {
        const i = document.createElement('input');
        i.type = 'file';
        i.accept = '.savnew,' + SAVNEW + ',application/zip,application/json';
        i.addEventListener('change', () => ok(i.files && i.files[0] ? i.files[0] : null));
        i.click();
    });
}
