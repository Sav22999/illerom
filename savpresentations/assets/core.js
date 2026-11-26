/** Small helpers shared by every screen: API, elements, dialogs, toasts, the signed-in person. */
import {t} from './i18n.js';

export const state = {user: null, csrf: '', config: {sources: {image: [], video: []}}};

export const uid = () => 'abcdefghijklmnopqrstuvwxyz'[Math.random() * 26 | 0] + Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => (b % 36).toString(36)).join('');
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isApp = /SavPresentationsApp\/Android/.test(navigator.userAgent);
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const mobile = () => matchMedia('(max-width: 900px)').matches;

/** h('div.a#b', {onclick, attr…}, ...children). Text is always text, never HTML. */
export function h(tag, attrs, ...kids) {
    const [, name, rest] = tag.match(/^([a-z0-9-]*)(.*)$/i);
    const el = document.createElement(name || 'div');
    for (const m of rest.matchAll(/([.#])([\w-]+)/g)) m[1] === '.' ? el.classList.add(m[2]) : (el.id = m[2]);
    if (attrs && (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs))) {
        kids.unshift(attrs);
        attrs = null;
    }
    for (const k in attrs || {}) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'prop') Object.assign(el, v);
        else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat(9).filter((k) => k !== null && k !== undefined && k !== false).map((k) => (k instanceof Node ? k : String(k))));
    return el;
}

export const icon = (name, attrs) => h('sav-icon', {name, ...attrs});
export const btn = (label, onclick, attrs = {}) => h('sav-button', {onclick, ...attrs}, label);
/** A button with only an icon: its name is the label for screen readers and the tooltip. */
export const iconBtn = (name, label, onclick, attrs = {}) => h('sav-tooltip', {
    content: label,
    placement: attrs.place || 'bottom',
    delay: 350
}, h('sav-button', {
    icon: name,
    label,
    onclick,
    appearance: 'ghost',
    variant: 'neutral',
    square: true, ...attrs,
    place: null
}));

/** Something to press that shows a picture, a thumbnail or a sample: a card of SavComponents. */
export function tile(label, onclick, attrs = {}, ...kids) {
    const go = (e) => onclick(e);
    return h('sav-card', {
        interactive: true,
        role: 'button',
        tabindex: 0,
        'aria-label': label,
        onclick: go,
        onkeydown: (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault();
                go(e);
            }
        }, ...attrs,
        class: 'tile ' + (attrs.class || '')
    }, ...kids);
}

/** A choice among a few: segmented buttons. options = [[value, icon | '=text', label]] */
export function segmented(label, value, options, onpick, attrs = {}) {
    return h('sav-radio-group', {
        appearance: 'buttons',
        size: 'sm',
        value: String(value),
        'aria-label': label,
        label: attrs.show ? label : null,
        class: 'segm',
        onchange: (e) => onpick(e.currentTarget.value)
    }, ...options.map(([v, ic, l]) => h('sav-radio', {
        value: String(v),
        title: l,
        'aria-label': l
    }, ic[0] === '=' ? ic.slice(1) : icon(ic))));
}

export const item = (value, iconName, label, attrs = {}) => h('sav-menu-item', {value, ...attrs}, iconName && icon(iconName, {slot: 'prefix'}), label, attrs.kbd && h('kbd', {slot: 'suffix'}, attrs.kbd));

export class ApiError extends Error {
    constructor(code, status, data) {
        super(code);
        this.code = code;
        this.status = status;
        this.data = data || {};
        this.network = !status;
    }
}

/** GET when body is undefined; POST otherwise. */
export async function api(action, body, params) {
    const q = new URLSearchParams({r: action, ...params});
    let res;
    try {
        res = await fetch('api/?' + q, body === undefined ? {credentials: 'same-origin'} : {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-Lang': document.documentElement.lang, ...(state.csrf ? {'X-CSRF-Token': state.csrf} : {})
            },
            body: JSON.stringify(body)
        });
    } catch {
        throw new ApiError('network', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new ApiError(data.error || 'server', res.status, data);
    return data;
}

export const get = (action, params) => api(action, undefined, params);

/** Sends a picture (shrunk in the browser first, so big photos travel fast). */
export const MAX_PICTURE = 15 * 1048576;

export async function uploadPicture(file) {
    if (file.size > MAX_PICTURE) throw new ApiError('image_big', 413);
    let blob = file;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || (file.type !== 'image/gif' && file.size > 900000)) {
        try {
            const bmp = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(bmp.width * k));
            c.height = Math.max(1, Math.round(bmp.height * k));
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
            blob = await new Promise((r) => c.toBlob(r, /png|svg|webp/.test(file.type) ? 'image/png' : 'image/jpeg', .88));
        } catch {
            throw new ApiError('image_type', 422);
        }
    }
    if (!blob || blob.size > MAX_PICTURE) throw new ApiError('image_big', 413);
    if (state.local) {
        const bmp = await createImageBitmap(blob).catch(() => null);
        if (!bmp) throw new ApiError('image_type', 422);
        return (await import('./local.js')).local.putMedia(blob, {w: bmp.width, h: bmp.height, name: file.name || ''});
    }
    let res;
    try {
        res = await fetch('api/?' + new URLSearchParams({r: 'media.upload', name: file.name || ''}), {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'Content-Type': blob.type, 'X-CSRF-Token': state.csrf},
            body: blob
        });
    } catch {
        throw new ApiError('network', 0);
    }
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) throw new ApiError(d.error || 'server', res.status);
    return d.media;
}

export const MAX_VIDEO = 150 * 1048576;
/** Sends a video in pieces, with a still taken here. onprogress(0…1); stop.on = true to give up. */
export async function uploadVideo(file, onprogress = () => {}, stop = {}) {
  if (file.size > MAX_VIDEO) throw new ApiError('video_big', 413);
  const v = h('video', { muted: true, playsinline: true, preload: 'auto', prop: { muted: true } }), url = URL.createObjectURL(file);
  const until = (ev, ms) => new Promise((ok2, no) => { v.addEventListener(ev, ok2, { once: true }); v.addEventListener('error', no, { once: true }); setTimeout(no, ms); });
  let poster = '', id = '';
  try {
    v.src = url;
    try { await until('loadeddata', 20000); if (!v.videoWidth) throw new Error('no picture'); } catch { throw new ApiError('video_type', 422); }
    try {
      const seek = until('seeked', 6000);
      v.currentTime = Math.min(1, (v.duration || 4) / 4);
      await seek;
      const k = Math.min(1, 1600 / v.videoWidth), c = h('canvas', { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      poster = (await uploadPicture(new File([await new Promise((r) => c.toBlob(r, 'image/jpeg', .85))], 'poster.jpg', { type: 'image/jpeg' }))).src;
    } catch { /* without a still */ }
    if (state.local) { const L = (await import('./local.js')).local, m = await L.putMedia(file, { w: v.videoWidth, h: v.videoHeight, name: file.name || 'video', video: true }); onprogress(1); return { ...m, poster, video: true }; }
    const b = await api('media.video.begin', { name: file.name || 'video', size: file.size });
    id = b.id;
    for (let at = 0, tries = 0; at < file.size;) {
      if (stop.on) throw new ApiError('stopped', 400);
      try {
        const res = await fetch('api/?' + new URLSearchParams({ r: 'media.video.piece', id, from: at }), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': state.csrf }, body: file.slice(at, at + b.piece) }), d = await res.json();
        if (!res.ok || !d.ok) throw new ApiError(d.error || 'server', res.status);
        if (d.have <= at) throw new ApiError('server', 500);
        at = d.have; tries = 0;
      } catch (e) { if ((e.status && e.status < 500) || ++tries > 4) throw e.status ? e : new ApiError('network', 0); await new Promise((r) => setTimeout(r, 700 * tries)); }
      onprogress(at / file.size);
    }
    return (await api('media.video.end', { id, w: v.videoWidth, h: v.videoHeight, poster })).media;
  } catch (e) {
    if (id) api('media.video.drop', { id }).catch(() => {});
    throw e;
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
}

export const errText = (e) => {
    const k = 'err_' + (e.code || 'server'), s = t(k);
    return s === k ? t('err_server') : s;
};
export const toast = (msg, variant = 'neutral') => window.Sav.toast(msg, {
    variant,
    placement: mobile() ? 'bottom-center' : 'bottom-end',
    duration: 3500
});
export const oops = (e) => {
    if (!(e instanceof ApiError)) console.error(e);
    toast(e instanceof ApiError ? errText(e) : t('err_server'), 'danger');
};
export const ok = (msg) => toast(msg, 'success');

/** A dialog: body is a node; buttons = [[label, value|handler, attrs]]. Resolves with the value (null when closed). */
export function dialog(title, body, buttons = [], opt = {}) {
    return new Promise((resolve) => {
        let value = null;
        const d = h('sav-dialog', {
            label: title,
            'sheet-on-mobile': true,
            style: opt.width ? `--width:${opt.width}` : null,
            class: opt.class,
            persistent: opt.persistent
        });
        d.append(body);
        for (const [label, val, attrs] of buttons) {
            d.append(h('sav-button', {
                slot: 'footer', ...attrs, onclick: async (e) => {
                    if (typeof val !== 'function') {
                        value = val;
                        d.hide();
                        return;
                    }
                    e.currentTarget.loading = true;
                    try {
                        const r = await val();
                        if (r !== false) {
                            value = r ?? true;
                            d.hide();
                        }
                    } catch (err) {
                        oops(err);
                    }
                    e.target.closest('sav-button').loading = false;
                }
            }, label));
        }
        d.addEventListener('sav-after-hide', (e) => {
            if (e.target !== d) return;
            d.remove();
            resolve(value);
        });
        // over a presentation in full screen, the window must be inside it to be seen
        (opt.parent || document.fullscreenElement || document.body).append(d);
        d.close = (v) => {
            value = v;
            d.hide();
        };
        if (opt.ref) opt.ref(d);
        requestAnimationFrame(() => d.show());
    });
}

export const confirmBox = (title, text, yes, danger = true) => dialog(title, h('p.dlg-text', text), [[t('cancel'), null, {
    appearance: 'outline',
    variant: 'neutral'
}], [yes, true, danger ? {variant: 'danger'} : {}]], {width: '27rem'});

/** A link of an element or of a word: a slide of the presentation, or a page outside, opened in a new tab after asking. */
export async function openLink(link, toSlide) {
    if (link.startsWith('#s:')) return toSlide?.(link.slice(3));
    const yes = await dialog(t('link_out'), h('div.stack', h('p.dlg-text', t('link_out_t')), h('code.linkurl', link)), [[t('cancel'), null, {
        appearance: 'outline',
        variant: 'neutral'
    }], [t('link_open'), true, {icon: 'external-link'}]], {width: '28rem'});
    if (yes) window.open(link, '_blank', 'noopener,noreferrer');
}

/** Asks for one line of text. Resolves with it, or null. */
export async function promptBox(title, label, value = '', yes = t('save'), max = 150, empty = false) {
    const inp = h('sav-input', {label, value, maxlength: max, autofocus: true});
    let dlg;
    const done = () => {
        const v = inp.value.trim();
        if (!v && !empty) {
            inp.focus();
            return false;
        }
        return v;
    };
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const v = done();
            if (v !== false) dlg.close(v);
        }
    });
    const p = dialog(title, inp, [[t('cancel'), null, {
        appearance: 'outline',
        variant: 'neutral'
    }], [yes, done]], {width: '26rem', ref: (d) => (dlg = d)});
    setTimeout(() => {
        inp.focus();
        inp.select?.();
    }, 180);
    return p;
}

export const fmtBytes = (b) => (b > 1048576 ? (b / 1048576).toFixed(b > 10485760 ? 0 : 1) + ' MB' : Math.round(b / 1024) + ' KB');

export function ago(iso) {
    if (!iso) return '—';
    const s = (Date.now() - new Date(iso)) / 1000,
        f = new Intl.RelativeTimeFormat(document.documentElement.lang, {numeric: 'auto'});
    if (s < 60) return f.format(0, 'second');
    if (s < 3600) return f.format(-Math.round(s / 60), 'minute');
    if (s < 86400) return f.format(-Math.round(s / 3600), 'hour');
    if (s < 86400 * 14) return f.format(-Math.round(s / 86400), 'day');
    return new Date(iso).toLocaleDateString(document.documentElement.lang, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

/** Saves a file: downloads in the browser, through the Android app when inside it. */
export async function saveBlob(blob, name) {
    if (isApp && window.SavPresentationsAndroid?.saveFile) {
        // the pieces end at a multiple of 4 characters, so each one can be decoded alone
        const b64 = await new Promise((r) => {
            const fr = new FileReader();
            fr.onload = () => r(String(fr.result).split(',')[1]);
            fr.readAsDataURL(blob);
        });
        window.SavPresentationsAndroid.saveBegin(name, blob.type || 'application/octet-stream');
        for (let i = 0; i < b64.length; i += 524288) window.SavPresentationsAndroid.saveFile(b64.slice(i, i + 524288));
        window.SavPresentationsAndroid.saveEnd();
        return;
    }
    const a = h('a', {href: URL.createObjectURL(blob), download: name});
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

export const fileName = (title, ext) => (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80) || 'presentation') + '.' + ext;
export const copyText = async (s) => {
    try {
        await navigator.clipboard.writeText(s);
        ok(t('copied'));
    } catch {
        prompt(t('copy_manual'), s);
    }
};
export const go = (path) => {
    history.pushState(null, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
};
export const userSetting = (k, def) => state.user?.settings?.[k] ?? def;
export const pickFile = (accept, multiple) => new Promise((r) => {
    const i = h('input', {
        type: 'file', accept, multiple, style: 'display:none', onchange: () => {
            r([...i.files]);
            i.remove();
        }
    });
    i.addEventListener('cancel', () => {
        r([]);
        i.remove();
    });
    document.body.append(i);
    i.click();
});
