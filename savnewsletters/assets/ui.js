/**
 * SavNewsletters — small UI toolkit shared by the app and the editor: DOM builder, SVG icons, API calls, toasts,
 * dialogs, dates in a group's timezone.
 */

import {getLang, t} from './i18n.js?v=25';

export const S = {config: {}, user: null, csrf: ''};

/** h('div.a.b#id', {attrs}, ...children) */
export function h(tag, attrs, ...kids) {
    const [, name, rest] = tag.match(/^([a-z0-9-]+)(.*)$/i);
    const el = document.createElement(name);
    for (const part of rest.match(/[.#][^.#]+/g) || []) part[0] === '.' ? el.classList.add(part.slice(1)) : (el.id = part.slice(1));
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
        kids.unshift(attrs);
        attrs = null;
    }
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        // SavComponents read value and checked from their attributes (a property set by hand is not always shown)
        else if (k === 'value' && !name.includes('-')) el.value = v;
        else if (k === 'checked' && !name.includes('-')) el.checked = !!v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
}

export function put(parent, ...kids) {
    parent.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
}

const ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.8 3.5 5.7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
    text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
    button: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M8 12h8"/>',
    divider: '<path d="M3 12h18"/><path d="M7 7h10M7 17h10" opacity=".35"/>',
    spacer: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
    quote: '<path d="M7 7h4v6a4 4 0 0 1-4 4M15 7h4v6a4 4 0 0 1-4 4"/>',
    columns: '<rect x="3" y="4" width="7.5" height="16" rx="1.5"/><rect x="13.5" y="4" width="7.5" height="16" rx="1.5"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
    media: '<rect x="3" y="5" width="8" height="14" rx="2"/><path d="M14 8h7M14 12h7M14 16h4"/>',
    card: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 11h18M7 15h6M7 18h4"/>',
    social: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    olist: '<path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 14.5a1 1 0 0 1 2 0c0 1-2 1.5-2 3h2"/>',
    clear: '<path d="M5 5h11M10 5 7 19M4 19h7M15 14l5 5M20 14l-5 5"/>',
    alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    review: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    home: '<path d="M3 11 12 4l9 7M5 10v10h14V10"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
};

export function svg(name, cls = 'ico') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICON[name] || '';
    return s;
}

/** The SavNewsletters mark (same drawing as icons/favicon.svg): an S of two pieces, an envelope and a paper plane. */
export function logo(size = 32) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 64 64');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = LOGO_SVG;
    return s;
}

export const LOGO_SVG = '<defs><linearGradient id="snA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0619f"/><stop offset="1" stop-color="#c2307a"/></linearGradient><linearGradient id="snB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3205f"/><stop offset="1" stop-color="#7d1648"/></linearGradient></defs><path d="M20.500 4H53a5 5 0 0 1 5 5v17.500a5 5 0 0 1-5 5H20.500A13.750 13.750 0 0 1 20.500 4z" fill="url(#snA)"/><path d="M17.500 10l17.250 10.250L52 10" fill="none" stroke="#fff" stroke-opacity=".92" stroke-width="3.400" stroke-linecap="round" stroke-linejoin="round"/><path d="M43.500 60H11a5 5 0 0 1-5-5V37.500a5 5 0 0 1 5-5h32.500a13.750 13.750 0 0 1 0 27.500z" fill="url(#snB)"/><path d="M14 41.500h14M14 50.500h9" stroke="#fff" stroke-opacity=".85" stroke-width="3.400" stroke-linecap="round"/><path d="M32.600 46.400l19.400-8.600-6.800 18.400-4.300-6.400z" fill="#ffd166" stroke="#ffd166" stroke-width="1.600" stroke-linejoin="round"/><path d="M52 37.800L40.900 49.800" stroke="#7d1648" stroke-width="1.700" stroke-linecap="round"/>';

// ---------------------------------------------------------------- API

export class ApiError extends Error {
    constructor(code, status, detail) {
        super(code);
        this.code = code;
        this.status = status;
        this.detail = detail;
    }
}

export async function api(route, body, query = '') {
    const opts = {method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: {}};
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        if (S.csrf) opts.headers['X-CSRF-Token'] = S.csrf;
        opts.body = JSON.stringify(body);
    }
    let res, data;
    try {
        res = await fetch('api/?r=' + route + (query ? '&' + query : ''), opts);
        data = await res.json();
    } catch (e) {
        throw new ApiError(res ? 'server' : 'network', res ? res.status : 0);
    }
    // the session ended (signed out elsewhere, expired): back to signing in, then to the same page
    if (data.error === 'unauthenticated' && S.user && route !== 'auth.logout') {
        S.user = null;
        S.csrf = '';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    if (!data.ok && data.error !== 'needs_signup') throw Object.assign(new ApiError(data.error || 'server', res.status, data.detail), {data});
    return data;
}

export function errText(e) {
    const code = e && e.code ? e.code : 'server';
    const s = t('err_' + code);
    return s === 'err_' + code ? t('err_server') : s;
}

// ---------------------------------------------------------------- SavComponents

/**
 * Every control of the app is a SavComponent, as in the other apps of SavOffice. The icons are SavComponents icons
 * (Lucide); the drawings of ui.js (ICON) that have no Lucide twin there are registered as "sn-…" (blocks of the editor,
 * text formatting, devices).
 */
const ICO = {
    plus: 'plus', trash: 'trash', up: 'chevron-up', down: 'chevron-down', back: 'arrow-left', x: 'x', check: 'check',
    copy: 'copy', eye: 'eye', send: 'send', mail: 'mail', users: 'users', user: 'user', settings: 'settings',
    layout: 'layout-template', link: 'link', code: 'code', clock: 'clock', calendar: 'calendar', shield: 'shield',
    logout: 'log-out', globe: 'globe', image: 'image', star: 'star', grip: 'grip-vertical', upload: 'upload',
    download: 'download', save: 'save', search: 'search', review: 'badge-check', undo: 'undo-2', menu: 'menu',
    chev: 'chevron-right', home: 'home', palette: 'palette', dup: 'copy-plus', text: 'align-left', type: 'type',
};
export const ico = (name) => ICO[name] || (ICON[name] ? 'sn-' + name : name);

export function registerAppIcons() {
    if (!window.Sav || !Sav.registerIcon) return;
    for (const [k, v] of Object.entries(ICON)) Sav.registerIcon('sn-' + k, v);
}

/** sav-icon with the name of the app or of SavComponents. */
export const icon = (name, attrs = {}) => h('sav-icon', {name: ico(name), ...attrs});

/** btn('label', {icon, variant, appearance, size, onclick, href…}): while an async onclick runs the button is busy. */
export function btn(label, o = {}) {
    const {onclick, variant = 'neutral', appearance = 'outline', size, icon: ic, ...rest} = o;
    const b = h('sav-button', {variant, appearance, size, icon: ic ? ico(ic) : null, ...rest}, label);
    if (onclick) b.addEventListener('click', async (ev) => {
        if (b.loading || b.disabled) return;
        const r = onclick(ev, b);
        if (r && r.then) {
            b.loading = true;
            try {
                await r;
            } catch (e) {
                failToast(e);
            } finally {
                b.loading = false;
            }
        }
    });
    return b;
}

export const primary = (label, o = {}) => btn(label, {variant: 'primary', appearance: 'solid', ...o});

/** Only an icon: its name is the label for screen readers and the tooltip. extra: '.class' and/or '.danger-ico'. */
export function iconBtn(name, title, onclick, extra = '') {
    const cls = extra.split('.').filter(Boolean);
    const b = h('sav-button', {
        icon: ico(name), label: title, title, appearance: 'ghost', square: true, size: 'sm',
        variant: cls.includes('danger-ico') ? 'danger' : 'neutral', class: cls.filter((c) => c !== 'danger-ico').join(' ') || null
    });
    if (onclick) b.addEventListener('click', (ev) => {
        if (b.disabled) return;
        const r = onclick(ev, b);
        if (r && r.catch) r.catch(failToast);
    });
    return b;
}

/** A menu of a button. items: [icon, label, run, {danger}] | '-' (divider) | falsy */
export function drop(trigger, items, o = {}) {
    trigger.slot = 'trigger';
    const list = items.filter(Boolean);
    const d = h('sav-dropdown', {placement: o.placement || 'bottom-end', label: o.label || trigger.getAttribute('label') || '', 'sheet-on-mobile': true}, trigger,
        list.map((i, n) => i === '-' ? h('sav-divider') : h('sav-menu-item', {value: String(n), variant: i[3] && i[3].danger ? 'danger' : null},
            i[0] ? icon(i[0], {slot: 'prefix'}) : null, i[1])));
    d.addEventListener('sav-select', (ev) => {
        ev.stopPropagation();
        const i = list[+ev.detail.value];
        if (i && i[2]) setTimeout(() => {
            const r = i[2]();
            if (r && r.catch) r.catch(failToast);
        }, 20);
    });
    // a press on the menu never opens what it sits on (a row, a card)
    d.addEventListener('click', (ev) => ev.stopPropagation());
    return d;
}

export const badge = (text, variant = 'neutral', o = {}) => h('sav-badge', {variant, appearance: o.solid ? null : 'soft', pill: true, class: o.class || null}, o.icon ? icon(o.icon) : null, o.icon ? ' ' : null, text);
export const alert = (text, variant = 'primary', o = {}) => h('sav-alert', {variant, heading: o.heading || null, class: o.class || null}, o.icon ? icon(o.icon, {slot: 'icon'}) : null, text);
export const empty = (ic, heading, text, ...kids) => h('sav-empty-state', {icon: ico(ic), heading, text: text || ''}, ...kids);
export const spinner = () => h('div.loading', h('sav-spinner'));

// ---------------------------------------------------------------- toasts and dialogs

export function toast(msg, kind = 'ok') {
    const variant = kind === 'err' ? 'danger' : kind === 'ok' ? 'success' : kind;
    if (window.Sav && Sav.toast) Sav.toast(msg, {variant, placement: 'bottom-start', duration: 4000});
}

export function failToast(e) {
    toast(errText(e), 'err');
}

/** A dialog (sav-dialog). content: nodes; actions: [{label, primary, danger, icon, onclick(close) -> false keeps it open}] */
export function modal(title, content, actions = [], opts = {}) {
    const width = opts.full ? 'min(1100px, calc(100vw - 2rem))' : opts.wide ? 'min(58rem, calc(100vw - 2rem))' : 'min(32rem, calc(100vw - 2rem))';
    const d = h('sav-dialog', {label: title, 'sheet-on-mobile': opts.full ? null : true, persistent: opts.sticky ? true : null, style: '--width:' + width, class: opts.full ? 'dlg-full' : null});
    d.append(...[content].flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
    const close = () => d.hide();
    let main = null;
    for (const a of actions) {
        const b = h('sav-button', {
            slot: 'footer', icon: a.icon ? ico(a.icon) : null,
            variant: a.danger ? 'danger' : a.primary ? 'primary' : 'neutral', appearance: a.primary || a.danger ? 'solid' : 'outline'
        }, a.label);
        b.addEventListener('click', async () => {
            if (!a.onclick) return close();
            if (b.loading) return;
            b.loading = true;
            try {
                const r = await a.onclick(close);
                if (r !== false) close();
            } finally {
                b.loading = false;
            }
        });
        if (a.primary || a.danger) main = b;
        d.append(b);
    }
    // Enter in a one-line field presses the main button
    d.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && main && ev.target.localName === 'sav-input' && !ev.defaultPrevented) {
            ev.preventDefault();
            main.click();
        }
    });
    d.addEventListener('sav-after-hide', (ev) => {
        if (ev.target !== d) return;
        d.remove();
        if (opts.onclose) opts.onclose();
    });
    document.body.append(d);
    customElements.whenDefined('sav-dialog').then(() => d.show());
    return {close, dialog: d};
}

export function confirmDialog(title, text, label, danger = false) {
    return new Promise((resolve) => {
        let done = false;
        modal(title, [h('p', text)], [
            {label: t('cancel')},
            {
                label, danger, primary: !danger, onclick: () => {
                    done = true;
                    resolve(true);
                }
            },
        ], {
            onclose: () => {
                if (!done) resolve(false);
            }
        });
    });
}

// ---------------------------------------------------------------- forms

const FIELDS = /^sav-(input|textarea|select|number-input|date-picker|time-picker|color-picker|range|password|radio-group)$/;

/** A label (and a help line) for a control: SavComponents fields take them as their own attributes. */
export function field(label, control, hint) {
    if (control && FIELDS.test(control.localName || '')) {
        if (label && !control.hasAttribute('label')) control.setAttribute('label', label);
        if (hint) control.setAttribute('help', hint);
        return control;
    }
    return h('div.field', label ? h('span.field-label', label) : null, control, hint ? h('span.field-hint', hint) : null);
}

/** sav-input. attrs as for an input (value, type, placeholder, maxlength, oninput, onchange, aria-label…). */
export function input(attrs = {}) {
    const {class: cls, value, ...rest} = attrs;
    if (rest.type === 'password') rest['password-toggle'] = true;
    if (rest.type === 'search') rest.clearable = true;
    const el = h('sav-input', rest);
    const c = String(cls || '').replace(/\binput\b/g, '').trim();
    if (c) el.className = c;
    if (value !== undefined && value !== null) el.setAttribute('value', String(value));
    return el;
}

/** sav-textarea, growing with the text. */
export function textarea(attrs = {}, value = '') {
    const el = h('sav-textarea', {resize: 'auto', ...attrs});
    if (value) el.setAttribute('value', String(value));
    return el;
}

/** sav-select shows nothing for an option whose value is empty: "" travels as "~" and comes back as "" (also through .value). */
const NONE = '~';

export function select(options, value, attrs = {}) {
    const s = h('sav-select', attrs, options.map(([v, label]) => h('option', {value: v === '' ? NONE : String(v)}, label)));
    s.setAttribute('value', value === null || value === undefined || value === '' ? NONE : String(value));
    let d = null;
    for (let p = customElements.get('sav-select') && customElements.get('sav-select').prototype; p && !d; p = Object.getPrototypeOf(p)) d = Object.getOwnPropertyDescriptor(p, 'value');
    if (d && d.get) Object.defineProperty(s, 'value', {
        configurable: true,
        get() {
            const v = d.get.call(this);
            return v === NONE ? '' : v;
        },
        set(v) {
            d.set.call(this, (v === '' || v === null || v === undefined) && this.querySelector('option[value="' + NONE + '"]') ? NONE : String(v));
        }
    });
    return s;
}

/** sav-checkbox (or sav-switch with o.switch): label and an optional help line. */
export function check(label, checked, onchange, o = {}) {
    const c = h(o.switch ? 'sav-switch' : 'sav-checkbox', {checked: !!checked, help: o.help || null}, label);
    if (onchange) c.addEventListener('change', () => onchange(c.checked));
    return c;
}

/** A read-only field with Copy (and, with openUrl, a button that opens the page in a new tab). */
export function copyBox(text, multiline = false, openUrl = '') {
    const box = multiline ? textarea({readonly: true, rows: 4, class: 'mono'}, text) : input({readonly: true, value: text, class: 'mono'});
    box.addEventListener('focus', () => box.select && box.select());
    return h('div.copy-box', box, h('div.prow.wrap-start',
        h('sav-copy-button', {value: text, size: 'sm', 'copy-label': t('copy'), 'success-label': t('copied')}, t('copy')),
        openUrl ? btn(t('open_page'), {icon: 'eye', size: 'sm', href: openUrl, target: '_blank'}) : null));
}

// ---------------------------------------------------------------- dates

/** "16 Nov 2026, 18:30" in a timezone (the group's). */
export function fmtDate(iso, tz, withTime = true) {
    if (!iso) return '';
    const o = {day: 'numeric', month: 'short', year: 'numeric', timeZone: tz || undefined};
    if (withTime) Object.assign(o, {hour: '2-digit', minute: '2-digit', hour12: false});
    try {
        return new Intl.DateTimeFormat(getLang(), o).format(new Date(iso));
    } catch (e) {
        return new Date(iso).toLocaleString();
    }
}

/** Date ("2026-11-20") and time ("18:30") of a moment in a timezone. */
export function partsIn(iso, tz) {
    const f = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return {date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`};
}

export function relTime(iso) {
    const d = (new Date(iso).getTime() - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(getLang(), {numeric: 'auto'});
    const a = Math.abs(d);
    if (a < 3600) return rtf.format(Math.round(d / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(d / 3600), 'hour');
    return rtf.format(Math.round(d / 86400), 'day');
}

export function uid() {
    return Math.random().toString(36).slice(2, 10);
}

export function clone(o) {
    return JSON.parse(JSON.stringify(o));
}

export const ROLES = ['user', 'moderator', 'publisher', 'admin', 'owner'];
export const rank = (r) => ROLES.indexOf(r);
export const atLeast = (role, min) => rank(role) >= rank(min);

export const LANG_NAMES = {
    it: 'Italiano',
    en: 'English',
    fr: 'Français',
    de: 'Deutsch',
    es: 'Español',
    pt: 'Português',
    nl: 'Nederlands',
    pl: 'Polski',
    ro: 'Română',
    sv: 'Svenska',
    el: 'Ελληνικά',
    cs: 'Čeština',
    hu: 'Magyar',
    da: 'Dansk',
    fi: 'Suomi',
    hr: 'Hrvatski',
    sl: 'Slovenščina',
    sk: 'Slovenčina',
    bg: 'Български',
    ca: 'Català'
};
