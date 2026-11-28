/**
 * The Vault (#/vault, #/vault/<folder>): a place of the drive where files and names are encrypted in this browser before
 * they leave it. The server (lib/vault.php) keeps only what it cannot read.
 *
 * It opens with a PIN of 6 or 8 digits, asked every time the person comes into the Vault ("Remember for 30 minutes" keeps
 * it open meanwhile). A PIN is short: whoever holds the database can try all of them offline, so it keeps the Vault from
 * people who get the files, a backup or a session, not from a determined operator of the server (8 digits slow them down).
 *
 * Keys (Web Crypto, nothing else):
 *   - the master key: 32 random bytes made here the first time, never sent in clear and never kept anywhere but in memory
 *     while the Vault is open (as keys that cannot be read back); it is sent wrapped (AES-GCM) with a key derived from the
 *     PIN (PBKDF2-SHA-256, 600 000 rounds, random salt) and with a recovery password (20 random bytes shown once, at the
 *     start, as 32 letters and digits; HKDF-SHA-256; it stays valid when the PIN changes)
 *   - PIN and recovery password both lost: a reset deletes the Vault after 30 days unless it is stopped (lib/vault.php)
 *   - from the master key (HKDF): the key of the names, and a proof the server asks for every change (it keeps only its
 *     SHA-256: a stolen session alone cannot empty, rename or lock the Vault)
 *   - every file has its own random key, kept inside its encrypted name; the file is encrypted in pieces (AES-256-GCM, one
 *     piece = one piece of the upload, 4 MB less the tag), the nonce is the number of the piece and a mark on the last one,
 *     so pieces cannot be reordered, cut or swapped between files
 *   - the names (with type, size and the key of the file) are padded to 32 bytes before they are encrypted
 * The Vault closes when the person leaves it (unless remembered), after some minutes without anything done in the page,
 * when the person presses Lock, signs out or closes the page. What the server can see: how many files and folders, their encrypted sizes, the folders they
 * are in, when they changed.
 */
import { btn, bytes, confirm, copyText, ctxAt, dialog, drop, dropBtn, empty, errText, fail, h, icon, iconBtn, menuAt, mobile, primary, put, segmented, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, request } from './store.js';
import { commands, go, prefs, setPrefs } from './account.js';
import { kindOf, pickFiles, queueUploads, showSpace, walkDrop } from './drive.js';

// ------------------------------------------------------------------ crypto

const subtle = globalThis.crypto?.subtle;
const te = new TextEncoder(), td = new TextDecoder();
const ITERATIONS = 600000;
const AAD_MK = te.encode('savdrive-vault-master-v1');
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const cat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.byteLength, 0)); let o = 0; for (const x of a) { out.set(new Uint8Array(x.buffer || x, x.byteOffset || 0, x.byteLength), o); o += x.byteLength; } return out; };
const b64 = (buf) => { const u = new Uint8Array(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const gcm = (iv, aad) => (aad ? { name: 'AES-GCM', iv, additionalData: aad } : { name: 'AES-GCM', iv });

// the recovery password: 20 bytes as 32 letters and digits (Crockford's base 32), in groups of four
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function toB32(bytes) {
  let bits = 0, v = 0, out = '';
  for (const x of bytes) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  return out.match(/.{1,4}/g).join('-');
}
function fromB32(s) {
  const clean = s.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{32}$/.test(clean)) return null;
  const out = [];
  let bits = 0, v = 0;
  for (const c of clean) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}

async function passKey(pass, salt, iterations) {
  const base = await subtle.importKey('raw', te.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** The key of the recovery password (160 random bits: no salt or slow derivation is needed, and it stays valid when the PIN changes). */
async function recoveryKey(raw) {
  const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: te.encode('savdrive-vault-recovery-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const wrap = async (kek, mk) => { const iv = rand(12); return b64(cat(iv, await subtle.encrypt(gcm(iv, AAD_MK), kek, mk))); };
const unwrap = async (kek, s) => { const u = unb64(s); return new Uint8Array(await subtle.decrypt(gcm(u.subarray(0, 12), AAD_MK), kek, u.subarray(12))); };

/** The keys of an open Vault, from the master key (whose bytes are wiped right after). */
async function keysOf(mk) {
  const base = await subtle.importKey('raw', mk, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const salt = new Uint8Array(32);
  const meta = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('savdrive-vault-names-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const proof = hex(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode('savdrive-vault-proof-v1') }, base, 256));
  return { meta, proof };
}
/** The master key from the PIN (null when it is not the right one). */
async function masterFrom(st, pass) {
  try { return await unwrap(await passKey(pass, unb64(st.key.salt), st.key.iterations), st.key.wrapPass); } catch { return null; }
}
async function masterFromRecovery(st, code) {
  const raw = fromB32(code);
  if (!raw || !st.key.wrapRecovery) return null;
  try { return await unwrap(await recoveryKey(raw), st.key.wrapRecovery); } catch { return null; } finally { raw.fill(0); }
}

/** A name (and the rest of what describes a file) encrypted with the key of the names, padded so its length tells little. */
async function seal(obj) {
  let json = JSON.stringify(obj);
  json += ' '.repeat((32 - (te.encode(json).length % 32)) % 32);
  const iv = rand(12);
  return b64(cat(iv, await subtle.encrypt(gcm(iv), K.meta, te.encode(json))));
}
async function unseal(s) {
  const u = unb64(s);
  return JSON.parse(td.decode(await subtle.decrypt(gcm(u.subarray(0, 12)), K.meta, u.subarray(12))));
}
/** The nonce of a piece: its number, and 1 at the end on the last one. */
const nonce = (i, last) => { const n = new Uint8Array(12); new DataView(n.buffer).setUint32(7, i); n[11] = last ? 1 : 0; return n; };
const fileKey = (raw, use) => subtle.importKey('raw', raw, 'AES-GCM', false, [use]);

// ------------------------------------------------------------------ the open Vault (only in memory)

let K = null, lockTimer = 0, busy = 0, rememberUntil = 0;
const REMEMBER = 30 * 60000; // "Remember for 30 minutes": open until then, also when the person leaves the Vault
const nodes = new Map(); // id -> {id, kind, parent, name, mime, size (in clear), csize (on disk), seg, key, created, updated}
const onLock = new Set();
const AUTO = [5, 10, 30, 60];
const autoMin = () => (AUTO.includes(prefs().vaultLock) ? prefs().vaultLock : 10);
/** Closes the Vault: the keys and the names go from memory. */
export function lock() {
  K = null;
  rememberUntil = 0;
  nodes.clear();
  clearTimeout(lockTimer);
  for (const f of [...onLock]) f();
}
S.vaultLock = lock;
/**
 * Remembered: open until the 30 minutes are over. Otherwise it closes when the person leaves the Vault, or after some
 * minutes without anything done in the page (a transfer still going on keeps it open).
 */
function touch() {
  if (!K) return;
  clearTimeout(lockTimer);
  const wait = rememberUntil ? rememberUntil - Date.now() : autoMin() * 60000;
  lockTimer = setTimeout(() => { if (busy && !rememberUntil) touch(); else { lock(); toast(t('vault_locked_auto'), 'neutral'); } }, Math.max(0, wait));
}
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, touch, { capture: true, passive: true });
addEventListener('pagehide', lock);

async function vapi(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) Object.assign(headers, { 'Content-Type': 'application/json', 'X-CSRF-Token': S.csrf }, K ? { 'X-Vault-Proof': K.proof } : {});
  let res, d;
  try { res = await request(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); } catch (e) { throw e.code ? e : Object.assign(new Error('network'), { code: 'network' }); }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server' }); }
  if (!res.ok || d.ok === false) {
    if (d.error === 'vault_locked') lock();
    throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  }
  return d;
}

/** A row of the server, as the browser reads it. */
async function plain(x) {
  let m = {};
  try { m = await unseal(x.meta); } catch { m = { n: t('vault_unreadable'), bad: true }; }
  return { id: x.id, kind: x.kind, parent: x.parent || null, name: String(m.n || '—'), mime: m.t || '', size: x.kind === 'file' ? (m.s ?? x.size) : 0, csize: x.size, seg: m.b, key: m.k, modified: m.m || null, created: x.created, updated: x.updated, bad: !!m.bad };
}
async function loadAll() {
  const r = await vapi('vault.list');
  const list = await Promise.all(r.items.map(plain));
  nodes.clear();
  for (const x of list) nodes.set(x.id, x);
  showSpace(r.used, r.quota, r.parts);
  return r;
}
const kids = (parent) => [...nodes.values()].filter((x) => (x.parent || null) === (parent || null));
function inside(id, depth = 0) {
  const out = [];
  for (const x of kids(id)) { out.push(x); if (x.kind === 'folder' && depth < 40) out.push(...inside(x.id, depth + 1)); }
  return out;
}
function pathOf(id) {
  const path = [];
  for (let x = nodes.get(id), i = 0; x && i < 40; x = nodes.get(x.parent), i++) path.unshift(x);
  return path;
}

// ------------------------------------------------------------------ sending and getting back files

/** Sends one file of the Vault: encrypted here piece by piece, through the uploads of the drive (upload.chunk). */
async function sendFile(file, folder, { onProgress, signal, name } = {}, st) {
  if (!K) throw Object.assign(new Error('vault_locked'), { code: 'vault_locked' });
  const seg = (st.chunk || S.config.chunk || 4194304) - 16, n = Math.max(1, Math.ceil(file.size / seg)), csize = file.size + 16 * n;
  const raw = rand(32), meta = { n: name || file.name, t: file.type || '', s: file.size, b: seg, k: b64(raw), m: file.lastModified || 0 };
  const key = await fileKey(raw, 'encrypt');
  raw.fill(0);
  const start = await vapi('vault.upload', { parent: folder || null, meta: await seal(meta), size: csize });
  const id = start.upload;
  let i = 0, tries = 0;
  busy++;
  try {
    while (i < n) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
      const piece = await file.slice(i * seg, Math.min(file.size, (i + 1) * seg)).arrayBuffer();
      const body = await subtle.encrypt(gcm(nonce(i, i === n - 1)), key, piece);
      let res, d;
      try {
        res = await request(`api/?r=upload.chunk&id=${id}&offset=${i * (seg + 16)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': S.csrf, 'X-Lang': getLang() }, body, signal, cache: 'no-store' });
        d = await res.json();
      } catch (e) {
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
        if (e.code === 'rate_limited') throw e;
        if (++tries > 5) throw Object.assign(new Error('network'), { code: 'network' });
        await new Promise((r) => setTimeout(r, 1000 * tries));
        continue;
      }
      if (d.error === 'offset') { i = Math.floor(d.received / (seg + 16)); continue; }
      if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
      tries = 0;
      touch();
      if (d.done) {
        onProgress?.(file.size);
        d.item = { ...d.item, name: meta.n, mime: meta.t, size: file.size, csize, seg, key: meta.k, modified: meta.m };
        return d;
      }
      i++;
      onProgress?.(Math.min(file.size, i * seg));
    }
    throw Object.assign(new Error('server'), { code: 'server' });
  } catch (e) {
    api('upload.cancel', { id }).catch(() => {});
    throw e;
  } finally { busy--; }
}

/** The file in clear, as a Blob: the encrypted bytes come in a stream and every piece is checked and decrypted here. */
async function getFile(x, { onProgress, signal } = {}) {
  if (!x.key || !x.seg) throw Object.assign(new Error('vault_corrupt'), { code: 'vault_corrupt' });
  busy++;
  try {
    const res = await request(`api/?r=vault.get&id=${encodeURIComponent(x.id)}`, { credentials: 'same-origin', cache: 'no-store', signal });
    if (!res.ok) throw Object.assign(new Error('not_found'), { code: res.status === 404 ? 'not_found' : 'server' });
    const raw = unb64(x.key), key = await fileKey(raw, 'decrypt');
    raw.fill(0);
    const segC = x.seg + 16, n = Math.max(1, Math.ceil(x.size / x.seg)), parts = [];
    const reader = res.body.getReader();
    let held = [], heldN = 0, i = 0, got = 0;
    const take = (len) => { const out = new Uint8Array(len); let o = 0; while (o < len) { const c = held[0], k = Math.min(c.length, len - o); out.set(c.subarray(0, k), o); o += k; if (k === c.length) held.shift(); else held[0] = c.subarray(k); } heldN -= len; return out; };
    const open = async (bytesC) => {
      try { parts.push(await subtle.decrypt(gcm(nonce(i, i === n - 1)), key, bytesC)); } catch { throw Object.assign(new Error('vault_corrupt'), { code: 'vault_corrupt' }); }
      i++;
      onProgress?.(Math.min(x.size, i * x.seg));
      touch();
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      held.push(value); heldN += value.length; got += value.length;
      while (heldN >= segC && i < n - 1) await open(take(segC));
    }
    if (i !== n - 1 || heldN < 16 || got !== x.csize) throw Object.assign(new Error('vault_corrupt'), { code: 'vault_corrupt' });
    await open(take(heldN));
    return new Blob(parts, { type: x.mime || 'application/octet-stream' });
  } finally { busy--; }
}
/** A progress shown at the bottom while a file is decrypted (it can be stopped). */
function progressToast(name) {
  const ctl = new AbortController(), bar = h('sav-progress-bar', { value: 0, max: 100, 'aria-label': name });
  const tt = toast(t('vault_decrypting', { name }), 'neutral', { duration: 0, closable: false, icon: 'lock' });
  tt.append?.(h('div.vtprog', bar, h('sav-button', { size: 'sm', appearance: 'outline', variant: 'neutral', onclick: () => ctl.abort() }, t('cancel'))));
  return { signal: ctl.signal, set: (v) => { bar.value = Math.round(v * 100); }, done: () => tt.remove?.() };
}
const save = (blob, name) => { const u = URL.createObjectURL(blob), a = h('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); };
async function download(x) {
  const p = progressToast(x.name);
  try { save(await getFile(x, { signal: p.signal, onProgress: (s) => p.set(x.size ? s / x.size : 1) }), x.name); } catch (e) { if (e.name !== 'AbortError') fail(e); } finally { p.done(); }
}
/** A folder (or many things) as a ZIP made here, in clear: what is decrypted never goes back to the server. */
async function downloadZip(list, zipName) {
  const files = [];
  const walk = (x, base) => { if (x.kind === 'file') files.push([base + x.name, x]); else for (const c of kids(x.id)) walk(c, base + x.name + '/'); };
  for (const x of list) walk(x, '');
  if (!files.length) return toast(t('zip_empty'), 'neutral');
  const total = files.reduce((n, [, x]) => n + x.size, 0);
  if (total > 1.5e9) return toast(t('vault_zip_big'), 'danger');
  const p = progressToast(zipName);
  try {
    const { zip } = await import('./zip.js');
    let doneB = 0;
    const entries = [];
    for (const [path, x] of files) {
      const blob = await getFile(x, { signal: p.signal, onProgress: (s) => p.set(total ? (doneB + s) / total : 1) });
      entries.push([path, new Uint8Array(await blob.arrayBuffer()), { store: true }]);
      doneB += x.size;
    }
    save(await zip(entries, 'application/zip'), zipName);
  } catch (e) { if (e.name !== 'AbortError') fail(e); } finally { p.done(); }
}

// ------------------------------------------------------------------ the screen

const FACTS = [['lock', 'vf_enc', 'vf_enc_t'], ['key', 'vf_pass', 'vf_pass_t'], ['eye-off', 'vf_none', 'vf_none_t'], ['hard-drive', 'vf_space', 'vf_space_t']];
const facts = () => h('ul.vfacts', FACTS.map(([ic, a, b]) => h('li', h('span.vfi', icon(ic)), h('div', h('b', t(a)), h('small', t(b))))));
const err = () => h('sav-alert.verr', { variant: 'danger', hidden: true });
const showErr = (box, msg) => { box.textContent = msg; box.hidden = !msg; };
const pwInput = (label, auto = 'current-password') => h('sav-input', { label, type: 'password', 'password-toggle': true, autocomplete: auto });
/** The PIN: only digits, one box each (the OTP field of SavComponents), never shown. */
const DIGITS = [6, 8];
const pinField = (label, digits) => h('sav-otp.vpin', { label, length: digits, type: 'numeric', mask: true });
const pinOk = (v, digits) => new RegExp(`^\\d{${digits}}$`).test(v || '');
const no = (code) => Object.assign(new Error(code), { code });
/** 6 or 8 digits: changes the boxes of the fields given. */
const digitsChoice = (value, fields, onpick) => segmented(t('vault_pin_len'), value, DIGITS.map((d) => [d, '=' + t('vault_digits', { n: d }), t('vault_digits', { n: d })]), (v) => { for (const f of fields) f.setAttribute('length', v); onpick(+v); }, { show: true, class: 'vlen' });

/** Shows the recovery password once: it can be copied or saved as a text file, and the person says they kept it. */
function showRecovery(code) {
  return new Promise((res) => {
    const kept = h('sav-checkbox', {}, t('vault_rec_kept'));
    const file = () => save(new Blob([`${t('vault_rec_file', { email: S.user?.email || '' })}\n\n${code}\n`], { type: 'text/plain' }), 'savdrive-vault-recovery-password.txt');
    dialog({ title: t('vault_rec_title'), width: '32rem', body: h('div.form', h('p', t('vault_rec_text')), h('code.vcode', code), h('div.prow.wrap', btn(t('copy'), { icon: 'copy', size: 'sm', onclick: () => copyText(code, t('vault_rec_copied')) }), btn(t('vault_rec_save'), { icon: 'download', size: 'sm', onclick: file })),
      h('sav-alert', { variant: 'warning' }, t('vault_rec_warn')), kept),
    actions: [{ label: t('done'), primary: true, run: () => { if (!kept.checked) throw no('vault_rec_confirm'); } }], onclose: res });
  });
}
const newRecovery = async (mk) => { const raw = rand(20), code = toB32(raw), w = await wrap(await recoveryKey(raw), mk); raw.fill(0); return { code, wrap: w }; };
/** What the server keeps of a new PIN: the master key wrapped with it (new salt). */
const pinWrap = async (pin, digits, mk) => { const salt = rand(16); return { digits, iterations: ITERATIONS, salt: b64(salt), wrapPass: await wrap(await passKey(pin, salt, ITERATIONS), mk) }; };

export async function vaultHome({ page, hbody, head, body, main, newSlot, folder }) {
  let alive = true, st = null, dragging = null;
  const sel = new Set();
  const view = () => prefs().view || (mobile() ? 'list' : 'grid');
  const navItem = hbody.querySelector('sav-menu-item[value="vault"]'), navIcon = navItem?.querySelector('sav-icon');
  if (mobile()) requestAnimationFrame(() => navItem?.scrollIntoView({ block: 'nearest', inline: 'center' })); // the places are a row on phones
  const digitsOf = () => (DIGITS.includes(st?.key?.digits) ? st.key.digits : 6);

  if (!subtle) { put(body, h('div.dempty', empty('lock', t('vault_no_crypto'), t('vault_no_crypto_t')))); put(head, h('h1', t('vault'))); return () => {}; }

  // --- New (in the side menu): only while the Vault is open
  const newBtn = primary(t('new'), { icon: 'plus', size: 'lg', block: true, class: 'newb' });
  const newDrop = drop(newBtn, () => [['folder-plus', t('new_folder'), () => newFolder()], ['upload', t('upload_files'), () => upFiles()], ['folder-up', t('upload_folder'), () => upDir()]], { label: t('new') });
  newDrop.style.display = 'block';
  put(newSlot, newDrop);
  const upFiles = () => pickFiles().then((fs) => uploadList(fs.map((file) => ({ file, path: '' })), folder));
  const upDir = () => pickFiles({ dir: true }).then((fs) => uploadList(fs.map((file) => ({ file, path: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/') })), folder));

  function redraw() {
    if (!alive) return;
    newBtn.disabled = !K;
    if (navIcon) navIcon.name = K ? 'unlock' : 'lock';
    sel.clear();
    if (!st.setup) return setupView();
    if (!K) return unlockView();
    if (folder && !nodes.has(folder)) { folder = null; history.replaceState(null, '', '#/vault'); }
    draw();
  }
  onLock.add(redraw);

  // ---------------------------------------------------------------- first time: a PIN (and the recovery password, shown once)

  function setupView() {
    commands([t('places'), [['hard-drive', t('my_drive'), '#/'], ['trash-2', t('trash'), '#/trash']]]);
    put(head, h('h1', t('vault')), h('span.grow'));
    let digits = 6;
    const pin = pinField(t('vault_pin'), digits), again = pinField(t('vault_pin_again'), digits);
    const len = digitsChoice(digits, [pin, again], (d) => { digits = d; });
    const understood = h('sav-checkbox', {}, t('vault_understand'));
    const box = err();
    const create = primary(t('vault_create'), { icon: 'lock', onclick: async () => {
      showErr(box, '');
      if (!pinOk(pin.value, digits)) return showErr(box, t('vault_pin_short', { n: digits }));
      if (pin.value !== again.value) return showErr(box, t('vault_pin_differ'));
      if (!understood.checked) return showErr(box, t('vault_understand_need'));
      const mk = rand(32);
      try {
        const w = await pinWrap(pin.value, digits, mk);
        const r = await newRecovery(mk);
        const keys = await keysOf(mk);
        await vapi('vault.setup', { kdf: 'pbkdf2-sha256', ...w, wrapRecovery: r.wrap, proof: keys.proof });
        K = keys;
        nodes.clear();
        st = await vapi('vault.state');
        touch();
        await showRecovery(r.code);
        toast(t('vault_ready'), 'success');
        redraw();
      } catch (e) { showErr(box, errText(e)); } finally { mk.fill(0); }
    } });
    put(body, h('div.vwrap', h('sav-card.vlcard', { appearance: 'outlined' },
      h('div.vhero', h('span.vbig', icon('lock')), h('div', h('h2', t('vault_setup_title')), h('p.muted', t('vault_setup_text')))), facts(),
      h('div.form.vform', len, pin, again, h('small.muted', t('vault_pin_help')), h('sav-alert', { variant: 'neutral', heading: t('vault_rec_next') }, icon('key', { slot: 'icon' }), t('vault_rec_next_t', { days: st.resetDays || 30 })),
        understood, box, h('div.prow', h('span.grow'), create)))));
  }

  // ---------------------------------------------------------------- locked: the PIN, every time the Vault is opened

  const longDate = (iso) => new Date(iso).toLocaleString(getLang(), { dateStyle: 'long', timeStyle: 'short' });
  /** A reset under way (PIN and recovery password lost): when it deletes everything, and the way to stop it. */
  function resetAlert() {
    if (!st.reset) return null;
    return h('sav-alert.vreset', { variant: 'danger', heading: t('vault_reset_on') }, icon('alert-triangle', { slot: 'icon' }),
      h('p', t('vault_reset_on_t', { date: longDate(st.reset.due) })), btn(t('vault_reset_stop'), { size: 'sm', icon: 'undo-2', onclick: () => keepVault(true) }));
  }
  async function keepVault(say) {
    const r = await vapi('vault.keep', {});
    st.reset = r.reset;
    if (say) toast(t('vault_reset_stopped'), 'success');
    redraw();
  }
  function unlockView() {
    commands([t('places'), [['hard-drive', t('my_drive'), '#/'], ['trash-2', t('trash'), '#/trash']]]);
    put(head, h('h1', t('vault')), h('span.grow'), h('sav-badge', { variant: 'neutral', appearance: 'soft', pill: true }, icon('lock'), t('vault_locked')));
    // a wrong PIN: a new empty field takes the place of the old one
    const fresh = () => { const f = pinField(t('vault_pin'), digitsOf()); f.addEventListener('sav-complete', () => go2.click()); return f; }; // the last digit opens it, as a code does
    let pin = fresh();
    const box = err();
    const remember = h('sav-checkbox', { checked: prefs().vaultRemember ? true : null }, t('vault_remember'));
    let trying = false;
    const go2 = primary(t('vault_unlock'), { icon: 'unlock', onclick: async () => {
      if (trying || !pinOk(pin.value, digitsOf())) return;
      trying = true;
      showErr(box, '');
      try {
        const mk = await masterFrom(st, pin.value);
        if (!mk) { await new Promise((r) => setTimeout(r, 800)); showErr(box, t('vault_wrong')); const f = fresh(); pin.replaceWith(f); pin = f; setTimeout(() => pin.focus?.(), 30); return; }
        if (!!prefs().vaultRemember !== remember.checked) setPrefs({ vaultRemember: remember.checked }).catch(() => {});
        await openWith(mk, remember.checked);
      } finally { trying = false; }
    } });
    put(body, h('div.vwrap', h('sav-card.vlcard.vsmall', { appearance: 'outlined' },
      h('div.vhero', h('span.vbig', icon('lock')), h('div', h('h2', t('vault_unlock_title')), h('p.muted', t('vault_unlock_text', { n: st.count, d: digitsOf() })))),
      h('div.form.vform', resetAlert(), pin, remember, box, h('div.prow.wrap', btn(t('vault_forgot'), { appearance: 'ghost', size: 'sm', onclick: forgot }), h('span.grow'), go2)),
      h('sav-details.vabout', { summary: t('vault_about'), appearance: 'plain' }, facts()))));
    setTimeout(() => pin.focus?.(), 80);
  }
  /** Open: whoever opens the Vault remembers it, so a reset under way stops by itself. */
  async function openWith(mk, remember = false) {
    try { K = await keysOf(mk); } finally { mk.fill(0); }
    rememberUntil = remember ? Date.now() + REMEMBER : 0;
    touch();
    if (st.reset) { try { await keepVault(false); toast(t('vault_reset_stopped'), 'success'); } catch (e) { fail(e); } }
    try { await loadAll(); } catch (e) { fail(e); }
    redraw();
  }
  /** A lost PIN: the recovery password sets a new one (and opens the Vault). */
  function forgot() {
    let digits = digitsOf();
    const code = h('sav-input', { label: t('vault_rec_key'), placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false' });
    const pin = pinField(t('vault_pin_new'), digits), again = pinField(t('vault_pin_again'), digits);
    const lost = btn(t('vault_lost_all'), { appearance: 'ghost', size: 'sm', icon: 'help-circle', onclick: () => { d.hide(); setTimeout(forgetAll, 300); } });
    const d = dialog({ title: t('vault_forgot'), width: '32rem', body: h('div.form', h('p.muted', t('vault_forgot_text')), code, digitsChoice(digits, [pin, again], (x) => { digits = x; }), pin, again, st.reset ? null : h('div.prow', lost)),
      actions: [{ label: t('cancel') }, { label: t('vault_unlock'), primary: true, run: async () => {
        if (!pinOk(pin.value, digits)) throw no('vault_pin_short');
        if (pin.value !== again.value) throw no('vault_pin_differ');
        const mk = await masterFromRecovery(st, code.value);
        if (!mk) throw no('vault_rec_wrong');
        try {
          K = await keysOf(mk);
          await vapi('vault.rekey', await pinWrap(pin.value, digits, mk));
          st = await vapi('vault.state'); // the recovery password keeps working (a new one can be made in the settings of the Vault)
        } catch (e) { K = null; throw e; } finally { mk.fill(0); }
        rememberUntil = 0;
        touch();
        if (st.reset) await keepVault(false).catch(fail);
        await loadAll().catch(fail);
        toast(t('vault_pin_changed'), 'success');
        redraw();
      } }] });
  }
  /**
   * PIN and recovery password both lost: nobody can open the Vault, so the only way is to empty it. It is not done at once
   * (a stolen session must never destroy it): it starts a countdown, told by email, that opening the Vault or a press
   * stops; at its end the server deletes everything and a new Vault can be made.
   */
  function forgetAll() {
    const days = st.resetDays || 30, due = longDate(new Date(Date.now() + days * 86400000).toISOString());
    const pw = S.user.hasPassword ? pwInput(t('vault_account_pw')) : null, sure = h('sav-checkbox', {}, t('vault_lost_sure', { date: due }));
    dialog({ title: t('vault_lost_title'), width: '32rem', body: h('div.form', h('p', t('vault_lost_t', { days })), h('ul.vsteps', ['vault_lost_1', 'vault_lost_2', 'vault_lost_3'].map((k) => h('li', t(k, { days, date: due })))), pw, sure),
      actions: [{ label: t('cancel') }, { label: t('vault_lost_go'), danger: true, run: async () => {
        if (!sure.checked) throw no('vault_lost_confirm');
        const r = await vapi('vault.forget', { password: pw?.value || '' });
        st.reset = r.reset;
        toast(t('vault_reset_started', { date: longDate(r.reset.due) }), 'neutral', { duration: 8000 });
        redraw();
      } }] });
  }

  // ---------------------------------------------------------------- settings of the Vault

  /** Asks the PIN again (changes need the master key, which is never kept as bytes). */
  const withMaster = (title, intro, extra, run) => {
    const pin = pinField(t('vault_pin_current'), digitsOf());
    dialog({ title, width: '30rem', body: h('div.form', intro ? h('p.muted', intro) : null, pin, extra), actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: async () => {
      const mk = await masterFrom(st, pin.value);
      if (!mk) throw no('vault_wrong');
      try { return await run(mk); } finally { mk.fill(0); }
    } }] });
  };
  function changePin() {
    let digits = digitsOf();
    const pin = pinField(t('vault_pin_new'), digits), again = pinField(t('vault_pin_again'), digits);
    withMaster(t('vault_change_pin'), t('vault_change_pin_t'), [digitsChoice(digits, [pin, again], (d) => { digits = d; }), pin, again], async (mk) => {
      if (!pinOk(pin.value, digits)) throw no('vault_pin_short');
      if (pin.value !== again.value) throw no('vault_pin_differ');
      await vapi('vault.rekey', await pinWrap(pin.value, digits, mk)); // the recovery password keeps working
      st = await vapi('vault.state');
      toast(t('vault_pin_changed'), 'success');
    });
  }
  /** A new recovery password (the old one stops working), shown once. */
  const newRecoveryPassword = () => withMaster(t('vault_rec_new'), t('vault_rec_new_t'), null, async (mk) => {
    const r = await newRecovery(mk);
    await vapi('vault.rekey', { wrapRecovery: r.wrap });
    st = await vapi('vault.state');
    setTimeout(() => showRecovery(r.code), 300);
  });
  /** At once, from an open Vault only (the server asks the proof) and with the password of the account. */
  function resetVault() {
    const pw = S.user.hasPassword ? pwInput(t('vault_account_pw')) : null, sure = h('sav-checkbox', {}, t('vault_delete_sure'));
    dialog({ title: t('vault_delete'), width: '30rem', body: h('div.form', h('p', t('vault_delete_t')), pw, sure), actions: [{ label: t('cancel') }, { label: t('vault_delete'), danger: true, run: async () => {
      if (!sure.checked) throw no('vault_delete_confirm');
      const r = await vapi('vault.reset', { password: pw?.value || '' });
      showSpace(r.used, r.quota, r.parts);
      lock();
      st = await vapi('vault.state');
      toast(t('vault_deleted'), 'neutral');
      redraw();
    } }] });
  }
  const aboutVault = () => dialog({ title: t('vault_about'), width: '34rem', body: h('div.form', h('p.muted', t('vault_setup_text')), facts(), h('p.small.muted', t('vault_tech'))), actions: [{ label: t('close'), primary: true }] });
  const settingsItems = () => [{ head: t('vault') }, ['key', t('vault_change_pin'), changePin], ['refresh', t('vault_rec_new'), newRecoveryPassword],
    { head: t('vault_auto') }, ...AUTO.map((m) => ['', t('vault_auto_n', { n: m }), () => { setPrefs({ vaultLock: m }).catch(() => {}); touch(); }, { check: autoMin() === m }]),
    '-', ['info', t('vault_about'), aboutVault], ['trash-2', t('vault_delete'), resetVault, { danger: true }]];

  // ---------------------------------------------------------------- the open Vault: folders and files

  const coll = () => new Intl.Collator(getLang(), { numeric: true, sensitivity: 'base' });
  function items() {
    const s = prefs().sort || 'name', c = coll();
    const by = { name: (x, y) => c.compare(x.name, y.name), updated: (x, y) => (y.updated || '').localeCompare(x.updated || ''), size: (x, y) => total(y) - total(x) }[s] || ((x, y) => c.compare(x.name, y.name));
    return kids(folder).sort((x, y) => (x.kind === y.kind ? by(x, y) : x.kind === 'folder' ? -1 : 1));
  }
  const total = (x) => (x.kind === 'file' ? x.size : inside(x.id).reduce((n, y) => n + (y.kind === 'file' ? y.size : 0), 0));
  const meta = (x) => { if (x.kind === 'folder') { const n = kids(x.id).length; return n ? `${t(n === 1 ? 'n_items_1' : 'n_items', { n })} · ${bytes(total(x))}` : t('folder_empty'); } return `${bytes(x.size)} · ${when(x.updated)}`; };
  const thumbOf = (x, big) => {
    if (x.kind === 'folder') return h('span.fic.fstack', { style: '--fc:#5f7d95' }, h('i.fs.fs1'), h('i.fs.fs2'), h('span.ftile', icon('folder')));
    const k = kindOf(x), e = (/\.([a-z0-9]+)$/i.exec(x.name)?.[1] || '').toLowerCase();
    return h('span.tic', { style: `--fc:${x.bad ? '#c93a2f' : k.c}` }, icon(x.bad ? 'alert-triangle' : k.ic), big && e ? h('em', e.slice(0, 5)) : null);
  };
  const check = (x) => { const c = h('sav-checkbox.pick', { checked: sel.has(x.id) || null, 'aria-label': t('select_item', { name: x.name }) }); c.addEventListener('click', (e) => e.stopPropagation()); c.addEventListener('change', () => { if (c.checked) sel.add(x.id); else sel.delete(x.id); draw(); }); return c; };
  const more = (x) => { const b = drop(h('sav-button', { icon: 'more-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm' }), () => menuOf(x), { placement: 'bottom-end', label: x.name }); b.addEventListener('click', (e) => e.stopPropagation()); return b; };
  function wire(n, x) {
    n.tabIndex = 0;
    n.setAttribute('role', 'listitem');
    n.setAttribute('aria-label', x.name);
    n.classList.toggle('on', sel.has(x.id));
    n.dataset.id = x.id;
    n.addEventListener('click', (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || sel.size) { if (sel.has(x.id)) sel.delete(x.id); else sel.add(x.id); draw(); return; } openItem(x); });
    n.addEventListener('keydown', (e) => { if (e.target !== n) return; if (e.key === 'Enter') openItem(x); else if (e.key === ' ') { e.preventDefault(); if (sel.has(x.id)) sel.delete(x.id); else sel.add(x.id); draw(); } });
    if (!mobile()) {
      n.draggable = true;
      n.addEventListener('dragstart', (e) => { dragging = sel.has(x.id) ? [...sel] : [x.id]; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.name); });
      n.addEventListener('dragend', () => { dragging = null; });
      if (x.kind === 'folder') dropTarget(n, () => x.id, x.id);
    }
    return n;
  }
  function dropTarget(n, idOf, self) {
    n.addEventListener('dragover', (e) => { if (!dragging || (self && dragging.includes(self))) return; e.preventDefault(); e.stopPropagation(); n.classList.add('over'); });
    n.addEventListener('dragleave', () => n.classList.remove('over'));
    n.addEventListener('drop', (e) => { n.classList.remove('over'); if (!dragging) return; e.preventDefault(); e.stopPropagation(); const ids = dragging; dragging = null; move(ids, idOf()); });
  }
  const lockTag = () => h('span.cglobe', { title: t('vault_enc_badge') }, icon('lock'));
  const card = (x) => wire(h('div.dcard' + (x.kind === 'folder' ? '.isfo' : ''), check(x), x.kind === 'folder'
    ? [h('div.dthumb.fthumb', { style: '--fc:#5f7d95' }, thumbOf(x, true)), h('div.dinfo', h('div.dname', h('b', { title: x.name }, x.name), h('small', meta(x))), more(x))]
    : [h('div.dthumb', thumbOf(x, true), lockTag()), h('div.dinfo', h('div.dname', h('b', { title: x.name }, x.name), h('small', meta(x))), more(x))]), x);
  const row = (x) => wire(h('div.drow', check(x), h('div.rname', thumbOf(x), h('div', h('b', { title: x.name }, x.name), h('small.rmeta', meta(x)))),
    h('span.lc-m', when(x.updated)), h('span.lc-s', x.kind === 'folder' ? (kids(x.id).length ? bytes(total(x)) : '—') : bytes(x.size)), h('span.ract', more(x))), x);

  function menuOf(x) {
    return [x.kind === 'folder' ? ['folder-open', t('open'), () => openItem(x)] : canShow(x) ? ['eye', t('preview'), () => preview(x)] : null,
      x.kind === 'file' ? ['download', t('download'), () => download(x)] : ['download', t('download_zip'), () => downloadZip([x], x.name + '.zip')],
      '-', ['edit', t('rename'), () => rename(x)], ['folder-input', t('move'), () => moveDialog([x.id])],
      '-', ['trash-2', t('delete_forever'), () => destroy([x.id]), { danger: true }]];
  }

  function title() {
    const crumbs = [{ id: null, name: t('vault') }, ...pathOf(folder).map((x) => ({ id: x.id, name: x.name }))];
    const bc = h('sav-breadcrumb.crumbs', { label: t('path') }, crumbs.map((c, i) => { const x = h('sav-breadcrumb-item', { href: i === crumbs.length - 1 ? null : c.id ? '#/vault/' + c.id : '#/vault' }, c.name); if (i < crumbs.length - 1) dropTarget(x, () => c.id); return x; }));
    return h('div.crumbwrap', bc, h('sav-badge.lvl.venc', { variant: 'success', appearance: 'soft', pill: true, title: t('vault_enc_t') }, icon('lock'), t('vault_enc_badge')));
  }
  function draw() {
    if (!alive || !K) return;
    const list = items();
    setCommands(list);
    if (sel.size) {
      const chosen = [...sel].map((id) => nodes.get(id)).filter(Boolean);
      put(head, h('div.selbar', iconBtn('x', t('clear_sel'), () => { sel.clear(); draw(); }), h('b', t('n_selected', { n: sel.size })), h('span.grow'),
        iconBtn('download', t('download'), () => (chosen.length === 1 && chosen[0].kind === 'file' ? download(chosen[0]) : downloadZip(chosen, (pathOf(folder).pop()?.name || t('vault')) + '.zip'))),
        iconBtn('folder-input', t('move'), () => moveDialog([...sel])), iconBtn('trash-2', t('delete_forever'), () => destroy([...sel]))));
    } else {
      const until = rememberUntil ? new Date(rememberUntil).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' }) : '';
      put(head, title(), h('span.grow'), until ? h('sav-badge.vuntil', { variant: 'neutral', appearance: 'soft', pill: true, title: t('vault_until_t') }, icon('clock'), t('vault_until', { time: until })) : null, dropSort(), segmented(t('view'), view(), [['grid', 'grid', t('v_grid')], ['list', 'list', t('v_list')]], (v) => { setPrefs({ view: v }).catch(() => {}); draw(); }),
        iconBtn('lock', t('vault_lock'), () => { lock(); toast(t('vault_locked_now'), 'neutral'); }), dropBtn('settings', t('vault_settings'), settingsItems, { caret: false, placement: 'bottom-end' }));
    }
    const note = prefs().vaultNote === false ? null : h('sav-alert.vnote', { variant: 'neutral', closable: true }, icon('lock', { slot: 'icon' }), t('vault_note'));
    note?.addEventListener('sav-close', () => setPrefs({ vaultNote: false }).catch(() => {}));
    if (!list.length) {
      put(body, note, h('div.dempty', empty('lock', folder ? t('folder_empty') : t('vault_empty'), t('vault_empty_t'), h('div.prow.wrap.cen', primary(t('upload_files'), { icon: 'upload', onclick: upFiles }), btn(t('new_folder'), { icon: 'folder-plus', onclick: () => newFolder() })))));
      return;
    }
    const folders = list.filter((x) => x.kind === 'folder'), files = list.filter((x) => x.kind === 'file');
    if (view() === 'list') put(body, note, h('div.dlist', { role: 'list' }, h('div.lhead', h('span'), h('span', t('name')), h('span.lc-m', t('modified')), h('span.lc-s', t('size')), h('span')), list.map(row)));
    else put(body, note, folders.length ? [h('h2.dsec', t('folders')), h('div.dgrid.fgrid', { role: 'list' }, folders.map(card))] : null, files.length ? [h('h2.dsec', t('files')), h('div.dgrid', { role: 'list' }, files.map(card))] : null);
  }
  const dropSort = () => drop(h('sav-button', { icon: 'sliders', size: 'sm', appearance: 'ghost', variant: 'neutral', caret: true, title: t('sort'), label: t('sort') }, h('span.lbl', t('sort_' + (prefs().sort || 'name')))),
    () => ['name', 'updated', 'size'].map((k) => ['', t('sort_' + k), () => { setPrefs({ sort: k }).catch(() => {}); draw(); }, { check: (prefs().sort || 'name') === k }]), { placement: 'bottom-end', label: t('sort') });
  function setCommands(list) {
    commands([t('vault'), [['folder-plus', t('new_folder'), () => newFolder()], ['upload', t('upload_files'), upFiles], ['folder-up', t('upload_folder'), upDir], ['lock', t('vault_lock'), () => lock()]]],
      [t('places'), [['hard-drive', t('my_drive'), '#/'], ['clock', t('recent'), '#/recent'], ['trash-2', t('trash'), '#/trash']]],
      list.length ? [t('in_here'), list.slice(0, 60).map((x) => [x.kind === 'folder' ? 'folder' : kindOf(x).ic, x.name, () => openItem(x), null, x.kind === 'folder' ? t('folder_l') : bytes(x.size)])] : null);
  }

  // ---------------------------------------------------------------- actions

  const canShow = (x) => x.kind === 'file' && !x.bad && x.size < 300e6 && (/^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/(mp4|webm|ogg)|audio\/)/.test(x.mime) || kindOf(x).k === 'text');
  function openItem(x) {
    if (x.kind === 'folder') return go('#/vault/' + x.id);
    if (canShow(x)) return preview(x);
    download(x);
  }
  /** A picture, a video, music or a text, decrypted here and shown from memory (nothing of it goes to the server). */
  async function preview(x) {
    const stage = h('div.pvstage', h('sav-spinner')), info = h('div.pvinfo');
    let url = '';
    const d = dialog({ title: x.name, width: '72rem', cls: 'pv', body: [h('div.pvwrap', stage), info], onclose: () => { if (url) URL.revokeObjectURL(url); } });
    put(info, h('small.muted', `${bytes(x.size)} · ${t('modified')} ${when(x.updated)}`), h('span.grow'), h('sav-badge', { variant: 'success', appearance: 'soft', pill: true }, icon('lock'), t('vault_local')),
      btn(t('download'), { size: 'sm', icon: 'download', onclick: () => download(x) }), btn(t('delete_forever'), { size: 'sm', icon: 'trash-2', variant: 'danger', appearance: 'outline', onclick: () => { d.hide(); destroy([x.id]); } }));
    try {
      const blob = await getFile(x);
      if (!d.isConnected) return;
      const k = kindOf(x);
      if (k.k === 'text') { const txt = await blob.slice(0, 400000).text(); put(stage, h('pre.vtext', txt + (blob.size > 400000 ? '\n…' : ''))); return; }
      url = URL.createObjectURL(blob);
      if (x.mime.startsWith('image/')) put(stage, h('img.pvimg', { src: url, alt: x.name }));
      else if (x.mime.startsWith('video/')) put(stage, h('sav-video.pvvid', { src: url, label: x.name }));
      else put(stage, h('div.pvaud', icon('music'), h('sav-audio', { src: url, label: x.name })));
    } catch (e) { put(stage, empty('alert-triangle', x.name, errText(e))); }
  }
  const nameDialog = (title2, value, ok) => new Promise((res) => {
    let out = null;
    const i = h('sav-input', { label: t('name'), value, maxlength: 255, autofocus: true });
    dialog({ title: title2, width: '26rem', body: i, actions: [{ label: t('cancel') }, { label: ok, primary: true, run: () => { const v = i.value.trim().replace(/[\\/\x00-\x1f]/g, '_'); if (!v) return false; out = v; return undefined; } }], onclose: () => res(out) });
  });
  async function newFolder(parent = folder) {
    const name = await nameDialog(t('new_folder'), t('untitled_folder'), t('create'));
    if (!name || !K) return;
    try { const r = await vapi('vault.folder', { parent, meta: await seal({ n: name }) }); nodes.set(r.item.id, await plain(r.item)); draw(); } catch (e) { fail(e); }
  }
  async function rename(x) {
    const name = await nameDialog(t('rename'), x.name, t('save'));
    if (!name || name === x.name || !K) return;
    const m = x.kind === 'file' ? { n: name, t: x.mime, s: x.size, b: x.seg, k: x.key, m: x.modified } : { n: name };
    try { await vapi('vault.rename', { id: x.id, meta: await seal(m) }); x.name = name; x.updated = new Date().toISOString(); draw(); } catch (e) { fail(e); }
  }
  async function move(ids, to) {
    try { await vapi('vault.move', { ids, to: to || null }); for (const id of ids) { const x = nodes.get(id); if (x) x.parent = to || null; } sel.clear(); toast(t('moved', { n: ids.length }), 'success'); draw(); } catch (e) { fail(e); }
  }
  async function destroy(ids) {
    if (!(await confirm(t('delete_forever'), t(ids.length === 1 ? 'vault_delete_items_1' : 'vault_delete_items', { n: ids.length }), t('delete_forever')))) return;
    try {
      const r = await vapi('vault.delete', { ids });
      for (const id of ids) for (const y of [nodes.get(id), ...inside(id)]) if (y) nodes.delete(y.id);
      showSpace(r.used, r.quota, r.parts);
      sel.clear();
      draw();
    } catch (e) { fail(e); }
  }
  function moveDialog(ids) {
    const moving = new Set(ids);
    let target = null;
    const list = h('sav-menu.mtree', { label: t('move_to'), selectable: true });
    list.append(h('sav-menu-item', { value: '' }, icon('lock', { slot: 'prefix' }), t('vault')));
    const add = (parent, depth, blocked) => {
      for (const f of kids(parent).filter((x) => x.kind === 'folder').sort((a, b) => coll().compare(a.name, b.name))) {
        const no = blocked || moving.has(f.id);
        list.append(h('sav-menu-item', { value: f.id, disabled: no || null, style: `padding-left:${0.4 + depth * 1.1}rem` }, h('span', { slot: 'prefix', class: 'mfi', style: '--fc:#5f7d95' }, icon('folder')), f.name));
        add(f.id, depth + 1, no);
      }
    };
    add(null, 1, false);
    list.addEventListener('sav-select', (e) => { target = e.detail.value || null; list.querySelectorAll('sav-menu-item').forEach((m) => m.toggleAttribute('current', m.getAttribute('value') === (target || ''))); });
    dialog({ title: t('move_n', { n: ids.length }), width: '28rem', body: h('div.mbox', list), actions: [{ label: t('cancel') }, { label: t('move_here'), primary: true, run: () => move(ids, target) }] });
  }
  /** Files (and the folders of their paths, made again in the Vault) go through the panel of the uploads of the drive. */
  async function uploadList(list, parent) {
    list = list.filter((x) => !/(^|\/)(__MACOSX|\.Spotlight-V100|\.Trashes|\.fseventsd)(\/|$)/.test(x.path || ''));
    if (!list.length || !K) return;
    try {
      const ids = { '': parent || null };
      for (const p of [...new Set(list.map((x) => x.path))].filter(Boolean).sort()) {
        let cur = '';
        for (const part of p.split('/')) {
          const next = cur ? `${cur}/${part}` : part;
          if (!(next in ids)) {
            const same = kids(ids[cur]).find((x) => x.kind === 'folder' && x.name === part); // a folder uploaded again goes into the same one
            if (same) ids[next] = same.id;
            else { const r = await vapi('vault.folder', { parent: ids[cur], meta: await seal({ n: part }) }); const n = await plain(r.item); nodes.set(n.id, n); ids[next] = n.id; }
          }
          cur = next;
        }
      }
      draw();
      const stNow = st;
      queueUploads(list.map((x) => ({ file: x.file, folder: ids[x.path] || null, send: (file, f, opts) => sendFile(file, f, opts, stNow), after: arrived })));
    } catch (e) { fail(e); }
  }
  let redrawSoon = 0;
  function arrived(q) {
    if (!K || !q.item) return;
    nodes.set(q.item.id, { id: q.item.id, kind: 'file', parent: q.item.parent || null, name: q.item.name, mime: q.item.mime, size: q.item.size, csize: q.item.csize, seg: q.item.seg, key: q.item.key, modified: q.item.modified, created: q.item.created, updated: q.item.updated });
    if (!alive) return;
    clearTimeout(redrawSoon);
    redrawSoon = setTimeout(() => { if (!sel.size) draw(); }, 300);
  }

  // ---------------------------------------------------------------- the page: files dropped in, keys, the right button

  const onDragOver = (e) => { if (dragging || !K || !e.dataTransfer.types.includes('Files')) return; e.preventDefault(); main.classList.add('dropping'); };
  const onDragLeave = (e) => { if (!hbody.contains(e.relatedTarget)) main.classList.remove('dropping'); };
  const onDrop = async (e) => { main.classList.remove('dropping'); if (dragging || !K || !e.dataTransfer.types.includes('Files')) return; e.preventDefault(); const c = e.target.closest?.('[data-id]'), x = c && nodes.get(c.dataset.id); uploadList(await walkDrop(e.dataTransfer), x?.kind === 'folder' ? x.id : folder); };
  hbody.addEventListener('dragover', onDragOver);
  hbody.addEventListener('dragleave', onDragLeave);
  hbody.addEventListener('drop', onDrop);
  const onKey = (e) => {
    if (!K || e.target.closest?.('sav-input, input, textarea, sav-dialog, sav-password')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); destroy([...sel]); }
    else if (e.key === 'Escape' && sel.size) { sel.clear(); draw(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); items().forEach((x) => sel.add(x.id)); draw(); }
  };
  addEventListener('keydown', onKey);
  const onMenu = (e) => {
    if (!K || e.target.closest('sav-dialog, sav-popover, sav-dropdown, .ctxm, sav-input, sav-password') || !main.contains(e.target)) return;
    e.preventDefault();
    const it = e.target.closest('[data-id]'), x = it && nodes.get(it.dataset.id);
    if (x) return ctxAt(e.clientX, e.clientY, menuOf(x), { label: x.name });
    ctxAt(e.clientX, e.clientY, [['folder-plus', t('new_folder'), () => newFolder()], ['upload', t('upload_files'), upFiles], ['folder-up', t('upload_folder'), upDir], '-',
      items().length ? ['check', t('select_all'), () => { items().forEach((y) => sel.add(y.id)); draw(); }] : null, ['refresh', t('refresh'), () => loadAll().then(draw, fail)], ['lock', t('vault_lock'), () => lock()]], { label: t('vault') });
  };
  page.addEventListener('contextmenu', onMenu);

  put(body, h('div.dwait', h('sav-spinner', { style: 'font-size:2rem' })));
  try {
    st = await vapi('vault.state');
    showSpace(st.used, st.quota, st.parts);
    if (K) await loadAll();
  } catch (e) {
    put(body, empty('cloud-off', errText(e), '', btn(t('retry'), { onclick: () => go('#/vault') })));
    return () => { alive = false; onLock.delete(redraw); };
  }
  document.title = t('vault') + ' – SavDrive';
  redraw();
  return () => {
    alive = false;
    onLock.delete(redraw);
    if (!rememberUntil) lock(); // the PIN is asked every time the Vault is opened again, unless it was remembered
    clearTimeout(redrawSoon);
    hbody.removeEventListener('dragover', onDragOver);
    hbody.removeEventListener('dragleave', onDragLeave);
    hbody.removeEventListener('drop', onDrop);
    removeEventListener('keydown', onKey);
    page.removeEventListener('contextmenu', onMenu);
  };
}
