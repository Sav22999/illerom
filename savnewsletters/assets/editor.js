/**
 * SavNewsletters — the drag-and-drop editor of a newsletter.
 *
 * Left: the blocks (drag them onto the page, or tap to add them under the selected one). Centre: the email as it will
 * look, edited in place (titles, texts, buttons are typed right on the page). Right: the settings of the selected block,
 * or of the whole newsletter (subject line preview, audience, colours, font). Blocks move by dragging their grip or
 * with the arrows; Ctrl/⌘+Z undoes.
 *
 * The document is saved a moment after each change (nl.save, with the revision it started from: if someone else
 * saved meanwhile the editor stops and offers to reload). The real email is rendered by the server (lib/render.php):
 * "Preview" and "Send a test" show exactly what subscribers will get.
 */

import {saveSavnew} from './files.js?v=25';
import {t} from './i18n.js?v=25';
import {
    api,
    ApiError,
    atLeast,
    btn,
    check as checkbox,
    clone,
    confirmDialog,
    ico,
    icon,
    failToast,
    field,
    fmtDate,
    h,
    iconBtn,
    input,
    LANG_NAMES,
    modal,
    partsIn,
    prefs,
    primary,
    put,
    select,
    setPrefs,
    svg,
    textarea,
    toast,
    uid
} from './ui.js?v=25';

const BLOCKS = ['heading', 'text', 'image', 'button', 'columns', 'media', 'card', 'quote', 'divider', 'spacer', 'social'];
// blocks that can go inside a column (INNER_TYPES in lib/render.php)
const INNER = ['heading', 'text', 'image', 'button', 'divider', 'spacer', 'quote', 'card', 'social'];
const COLUMN_LAYOUTS = {2: ['50-50', '33-67', '67-33', '40-60', '60-40'], 3: ['33-33-33', '25-50-25']};
const SOCIALS = ['website', 'facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'mastodon', 'telegram', 'whatsapp', 'custom'];
// the networks with a fixed name ('custom' links have their own label, and a block may have several)
const NETWORKS = SOCIALS.filter((k) => k !== 'custom');
// what each address looks like (shown in the empty fields)
const SOCIAL_PH = {
    website: 'www.example.com',
    facebook: 'facebook.com/…',
    instagram: 'instagram.com/…',
    x: 'x.com/…',
    linkedin: 'linkedin.com/in/…',
    youtube: 'youtube.com/@…',
    tiktok: 'tiktok.com/@…',
    mastodon: 'mastodon.social/@…',
    telegram: 't.me/…',
    whatsapp: 'wa.me/…'
};
const SOCIAL_NAMES = {
    website: 'Web',
    facebook: 'Facebook',
    instagram: 'Instagram',
    x: 'X',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
    tiktok: 'TikTok',
    mastodon: 'Mastodon',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp'
};
// Typefaces every mail client has: same keys and stacks as FONTS in lib/render.php
const FONT_CSS = {
    sans: 'Helvetica, Arial, sans-serif',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    tahoma: 'Tahoma, Verdana, sans-serif',
    rounded: '"Trebuchet MS", "Segoe UI", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    palatino: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    garamond: 'Garamond, Baskerville, "Baskerville Old Face", Georgia, serif',
    mono: '"Courier New", Courier, monospace',
};
const FONT_NAMES = {
    sans: 'Helvetica / Arial',
    system: 'System UI',
    verdana: 'Verdana',
    tahoma: 'Tahoma',
    rounded: 'Trebuchet',
    serif: 'Georgia',
    times: 'Times New Roman',
    palatino: 'Palatino',
    garamond: 'Garamond',
    mono: 'Courier'
};
// Default text size and line height per block (BLOCK_TEXT / HEADING_SIZES in lib/render.php)
const BLOCK_TEXT = {
    heading: [0, 1.22],
    text: [16, 1.6],
    quote: [19, 1.5],
    button: [16, 1.2],
    card: [15, 1.55],
    media: [15, 1.55],
    social: [13, 1.2]
};
const HEADING_SIZES = {1: 30, 2: 23, 3: 18};

/** Space and style of a block when the author has not changed them (default_style() in lib/render.php).
 *  Inside a column there are no side margins. */
function defaultStyle(type, inner = false) {
    const v = type === 'divider' ? 12 : 8;
    return {pt: v, pb: v, px: inner ? 0 : 32, font: '', size: 0, lh: 0, weight: '', color: '', bg: ''};
}

function styleOf(b, inner = false) {
    if (b.type === 'spacer') return null;
    // filled in place: the style panel keeps a reference to this same object while the block is redrawn
    if (!b.style || typeof b.style !== 'object') b.style = {};
    for (const [k, v] of Object.entries(defaultStyle(b.type, inner))) if (!(k in b.style)) b.style[k] = v;
    return b.style;
}

const PRESET_COLORS = ['#C2307A', '#0E8A6A', '#E2553B', '#D97706', '#2563EB', '#5B3DF5', '#111827', '#8A5A2B'];

function newBlock(type) {
    const b = {id: uid(), type};
    switch (type) {
        case 'heading':
            return {...b, text: t('ph_heading'), level: 2, align: 'left'};
        case 'text':
            return {...b, html: '<p>' + t('ph_text') + '</p>', align: 'left'};
        case 'image':
            return {...b, src: '', alt: '', href: '', width: 100, align: 'center', rounded: true};
        case 'button':
            return {...b, label: t('ph_button'), href: 'https://', align: 'center', color: '', full: false};
        case 'card':
            return {
                ...b,
                src: '',
                title: t('ph_card_title'),
                html: '<p>' + t('ph_card_text') + '</p>',
                label: t('ph_card_link'),
                href: 'https://'
            };
        case 'quote':
            return {...b, text: t('ph_quote'), cite: ''};
        case 'media':
            return {
                ...b,
                src: '',
                alt: '',
                title: t('ph_card_title'),
                html: '<p>' + t('ph_card_text') + '</p>',
                label: t('ph_card_link'),
                href: 'https://',
                side: 'left',
                imgWidth: 40,
                valign: 'middle',
                rounded: true,
                gap: 20
            };
        case 'divider':
            return {...b, color: '', thickness: 1};
        case 'columns':
            return {
                ...b,
                count: 2,
                layout: '50-50',
                gap: 24,
                valign: 'top',
                stack: true,
                cols: [{blocks: []}, {blocks: []}]
            };
        case 'spacer':
            return {...b, size: 24};
        case 'social':
            return {...b, links: [], align: 'center'};
    }
    return b;
}

/** Same rule as social_url() in lib/render.php: the address that will be in the email, or '' when it is incomplete. */
function socialUrl(url) {
    url = (url || '').trim();
    if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url) && /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(url)) url = 'https://' + url;
    return /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(url) && !/[\s<>"]/.test(url) ? url : '';
}

/** Class of a block type. Ad blockers hide elements whose class contains "social" (their social-widget filters):
 *  the social links block is "links" in CSS, everywhere in the editor. */
function cssType(type) {
    return type === 'social' ? 'netlinks' : type;
}

function imgUrl(src) {
    return src && src.startsWith('img:') ? 'api/?r=img&id=' + src.slice(4) : src;
}

/** Text from contenteditable, without the HTML. */
function plain(el) {
    return el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Paste as plain text into the editable fields (no styles from Word or web pages). */
function plainPaste(ev) {
    ev.preventDefault();
    const text = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
}

/** Pictures are resized in the browser before upload: at most 1200 px wide, JPEG unless they need transparency. */
async function prepareImage(file) {
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new ApiError('image_invalid');
    if (file.type === 'image/gif' && file.size < 1400000) return await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(file);
    });
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (file.type === 'image/png') {
        const png = c.toDataURL('image/png');
        if (png.length < 1900000) return png;
    }
    const tmp = document.createElement('canvas');
    tmp.width = c.width;
    tmp.height = c.height;
    const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, c.width, c.height);
    tctx.drawImage(c, 0, 0);
    return tmp.toDataURL('image/jpeg', 0.86);
}

/** Next 30-minute slot from now, as date/time in the group's timezone. */
function nextSlot(tz, hoursAhead = 1) {
    const step = 30 * 60 * 1000;
    const ts = Math.ceil((Date.now() + hoursAhead * 3600000) / step) * step;
    return partsIn(new Date(ts).toISOString(), tz);
}

export function slotOptions() {
    const out = [];
    for (let hh = 0; hh < 24; hh++) for (const mm of ['00', '30']) out.push(String(hh).padStart(2, '0') + ':' + mm);
    return out;
}

/** Dialog that picks a date and a 30-minute slot. Resolves {date, time, direct} or null. */
export function slotDialog(group, {title, action, initial, allowDirect = false, note = ''}) {
    return new Promise((resolve) => {
        const start = initial || nextSlot(group.timezone);
        const today = partsIn(new Date().toISOString(), group.timezone).date;
        const date = h('sav-date-picker', {value: start.date, min: today, 'sheet-on-mobile': true});
        const time = select(slotOptions().map((s) => [s, s]), start.time);
        const direct = allowDirect ? checkbox(t('direct_schedule'), true, null, {help: t('direct_schedule_hint')}) : null;
        let done = false;
        modal(title, h('div.form',
            h('div.grid2', field(t('date'), date), field(t('time'), time)),
            h('p.muted.small', icon('globe'), ' ', t('slot_tz', {tz: group.timezone})),
            note ? h('sav-alert', {variant: 'neutral'}, note) : null,
            direct), [
            {label: t('cancel')},
            {
                label: action, primary: true, icon: 'send', onclick: () => {
                    if (!date.value) return false;
                    done = true;
                    resolve({date: date.value, time: time.value, direct: !!(direct && direct.checked)});
                }
            },
        ], {
            onclose: () => {
                if (!done) resolve(null);
            }
        });
    });
}

export function previewDialog(html, title) {
    const frame = h('iframe.preview-frame', {
        title,
        sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
        referrerpolicy: 'no-referrer'
    });
    frame.srcdoc = html;
    const wrap = h('div.preview-wrap', frame);
    const sizes = h('sav-radio-group', {appearance: 'buttons', size: 'sm', value: 'desktop', 'aria-label': t('preview'), class: 'psizes'},
        h('sav-radio', {value: 'desktop'}, icon('desktop'), ' ', t('desktop')), h('sav-radio', {value: 'phone'}, icon('phone'), ' ', t('phone')));
    sizes.addEventListener('change', () => wrap.classList.toggle('phone', sizes.value === 'phone'));
    modal(title, [sizes, wrap], [], {full: true});
}

// =====================================================================================================================

/**
 * The editor. With nl it edits a newsletter; with tpl ({id, name, doc}; id 0 = new) it edits a template of the group:
 * the title field is the template's name, it saves to tpl.save and has no sending actions.
 */
export function editorView(root, {group, nl, tpl, role, onBack, onChange}) {
    const isTpl = !!tpl;
    const narrow = () => matchMedia('(max-width: 900px)').matches; // a phone: no customising of the bars, as in the other apps
    if (isTpl) nl = {id: 0, rev: 0, subject: tpl.name, preheader: '', lang: '', doc: tpl.doc};
    const E = {
        tplId: isTpl ? tpl.id : 0,
        id: nl.id, rev: nl.rev, subject: nl.subject, preheader: nl.preheader, lang: nl.lang || '',
        doc: clone(nl.doc), selected: null, timer: null, saving: false, dirty: false, stopped: false,
        undo: [], redo: [], snapTimer: null, lastSnap: null,
    };
    const R = {};

    // ---------------------------------------------------------------- saving

    function changed(snapshot = true) {
        E.dirty = true;
        setState('dirty');
        if (snapshot) snap();
        clearTimeout(E.timer);
        E.timer = setTimeout(save, 1200);
    }

    /** History: one step per change; typing in the same field within 1.5 s is one step. */
    function snap() {
        const cur = JSON.stringify({doc: E.doc, subject: E.subject, preheader: E.preheader, lang: E.lang});
        if (cur === E.lastSnap) return;
        clearTimeout(E.snapTimer);
        E.snapTimer = setTimeout(() => {
            E.pendingSnap = false;
        }, 1500);
        if (!E.pendingSnap && E.lastSnap) {
            E.undo.push(E.lastSnap);
            if (E.undo.length > 100) E.undo.shift();
            E.redo = [];
        }
        E.pendingSnap = true;
        E.lastSnap = cur;
        drawHistory();
    }

    function restore(json) {
        const s = JSON.parse(json);
        E.doc = s.doc;
        E.subject = s.subject;
        E.preheader = s.preheader;
        E.lang = s.lang;
        E.lastSnap = json;
        R.subject.value = E.subject;
        if (E.selected && !find(E.selected)) E.selected = null;
        drawCanvas();
        drawInspector();
        drawHistory();
        changed(false);
    }

    function undo() {
        if (!E.undo.length) return;
        E.redo.push(E.lastSnap);
        E.pendingSnap = false;
        restore(E.undo.pop());
    }

    function redo() {
        if (!E.redo.length) return;
        E.undo.push(E.lastSnap);
        E.pendingSnap = false;
        restore(E.redo.pop());
    }

    async function save() {
        clearTimeout(E.timer);
        if (E.stopped || !E.dirty) return true;
        if (E.saving) {
            E.timer = setTimeout(save, 400);
            return false;
        }
        E.saving = true;
        E.dirty = false;
        setState('saving');
        try {
            if (isTpl) {
                const r = await api('tpl.save', {
                    group: group.id,
                    id: E.tplId,
                    name: E.subject.trim() || t('untitled_tpl'),
                    doc: E.doc
                });
                E.tplId = r.id;
            } else {
                const r = await api('nl.save', {
                    id: E.id,
                    base: E.rev,
                    subject: E.subject,
                    preheader: E.preheader,
                    lang: E.lang || null,
                    doc: E.doc
                });
                E.rev = r.rev;
            }
            setState(E.dirty ? 'dirty' : 'saved');
            return true;
        } catch (e) {
            E.dirty = true;
            if (e.code === 'nl_conflict' || e.code === 'nl_locked') {
                E.stopped = true;
                setState('error');
                modal(t('conflict_title'), [h('p', t(e.code === 'nl_locked' ? 'locked_text' : 'conflict_text'))], [{
                    label: t('reload'),
                    primary: true,
                    onclick: () => location.reload()
                }], {sticky: true});
            } else {
                setState('error');
                failToast(e);
                E.timer = setTimeout(save, 5000);
            }
            return false;
        } finally {
            E.saving = false;
        }
    }

    function setState(s) {
        if (!R.state) return;
        R.state.dataset.state = s;
        put(R.state, s === 'saving' ? h('sav-spinner') : icon(s === 'error' ? 'x' : 'check'), t('save_' + s));
    }

    window.addEventListener('beforeunload', (ev) => {
        if (E.dirty && !E.stopped && document.body.contains(root.firstChild)) {
            save();
            ev.preventDefault();
        }
    });

    // ---------------------------------------------------------------- model helpers

    const blocks = () => E.doc.blocks;

    /** Where a block is: {list, i, owner} — owner is the columns block when it sits inside a column. */
    function locate(id, list = blocks(), owner = null) {
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.id === id) return {list, i, owner};
            if (b.type === 'columns') for (const c of b.cols) {
                const r = locate(id, c.blocks, b);
                if (r) return r;
            }
        }
        return null;
    }

    const find = (id) => {
        const r = locate(id);
        return r ? r.list[r.i] : null;
    };
    const isInner = (id) => !!(locate(id) || {}).owner;

    /** The list (and position) a new block goes to: right after the selected block, in the same column if it is in one. */
    function target(type) {
        const r = E.selected ? locate(E.selected) : null;
        if (!r) return {list: blocks(), at: blocks().length};
        const sel = r.list[r.i];
        if (sel.type === 'columns' && INNER.includes(type)) {
            // a columns block is selected: into the column clicked last, otherwise the first empty one (or the first)
            const k = E.targetCol && E.targetCol.id === sel.id ? E.targetCol.k : Math.max(0, sel.cols.findIndex((c) => !c.blocks.length));
            return {list: sel.cols[k].blocks, at: sel.cols[k].blocks.length};
        }
        if (r.owner && !INNER.includes(type)) { // columns cannot go inside a column: after the columns block
            const o = locate(r.owner.id);
            return {list: o.list, at: o.i + 1};
        }
        return {list: r.list, at: r.i + 1};
    }

    /** Side margins follow where a block is: 32 px on the page, 0 inside a column (if the author never changed them). */
    function fitMargins(b, inner) {
        if (!b.style || b.type === 'spacer') return;
        if (inner && b.style.px === 32) b.style.px = 0;
        if (!inner && b.style.px === 0) b.style.px = 32;
    }

    function insert(type, at, list) {
        const b = newBlock(type);
        if (list === undefined) ({list, at} = target(type));
        if (list !== blocks() && !INNER.includes(type)) return toast(t('col_not_allowed'), 'err');
        if (list !== blocks()) b.style = defaultStyle(type, true);
        list.splice(at, 0, b);
        E.selected = b.id;
        changed();
        drawCanvas();
        drawInspector();
        requestAnimationFrame(() => {
            const el = R.mail.querySelector(`[data-id="${b.id}"]`);
            if (el) {
                el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
                const ed = el.querySelector('[contenteditable]');
                if (ed && type !== 'text') ed.focus();
            }
        });
    }

    /** Moves a block to position `to` of `list` (the page or a column). */
    function move(id, to, list = null) {
        const r = locate(id);
        if (!r) return;
        list = list || r.list;
        const b = r.list[r.i];
        if (list !== blocks() && !INNER.includes(b.type)) return toast(t('col_not_allowed'), 'err');
        r.list.splice(r.i, 1);
        if (list === r.list && to > r.i) to--;
        list.splice(Math.max(0, Math.min(to, list.length)), 0, b);
        fitMargins(b, list !== blocks());
        changed();
        drawCanvas();
    }

    function remove(id) {
        const r = locate(id);
        if (!r) return;
        r.list.splice(r.i, 1);
        if (E.selected === id || (r.list[r.i] && false)) E.selected = null;
        if (E.selected && !find(E.selected)) E.selected = null;
        changed();
        drawCanvas();
        drawInspector();
    }

    function duplicate(id) {
        const r = locate(id);
        const copy = clone(r.list[r.i]);
        const renew = (x) => {
            x.id = uid();
            if (x.type === 'columns') x.cols.forEach((c) => c.blocks.forEach(renew));
        };
        renew(copy);
        r.list.splice(r.i + 1, 0, copy);
        E.selected = copy.id;
        changed();
        drawCanvas();
        drawInspector();
    }

    function selectBlock(id) {
        if (E.selected === id) return;
        E.selected = id;
        R.mail.querySelectorAll('.ed-block').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
        drawInspector();
    }

    function redrawBlock(b) {
        const old = R.mail.querySelector(`[data-id="${b.id}"]`);
        if (old) old.replaceWith(blockEl(b));
    }

    // ---------------------------------------------------------------- layout

    // the bar of the editor, as in SavDocuments and SavSchedules: the app (back), the title in a field without borders,
    // the state of the saving, then the actions
    const back = h('sav-tooltip', {content: t('back'), placement: 'bottom'}, h('a.ehome', {
        href: '#/g/' + group.id + (isTpl ? '/templates' : ''), 'aria-label': t('back'), onclick: async (ev) => {
            ev.preventDefault();
            await save();
            onBack();
        }
    }, h('img', {src: 'icons/favicon.svg', width: 34, height: 34, alt: ''})));
    R.subject = h('sav-input.dtitle', {
        value: E.subject,
        placeholder: t(isTpl ? 'template_name' : 'subject_ph'),
        maxlength: isTpl ? 80 : 200,
        'aria-label': t(isTpl ? 'template_name' : 'subject'),
        oninput: () => {
            E.subject = R.subject.value;
            changed();
            drawInspectorHead();
        }
    });
    R.state = h('span.save-state');
    R.undoBtn = iconBtn('undo', t('undo'), undo, '.hist');
    R.redoBtn = iconBtn('redo-2', t('redo'), redo, '.hist');
    const canSchedule = atLeast(role, 'publisher');
    const discard = isTpl ? null : iconBtn('trash', t('delete_draft'), async () => {
        if (!(await confirmDialog(t('delete_nl_title'), t('delete_nl_text_named', {subject: E.subject || t('untitled')}), t('delete'), true))) return;
        clearTimeout(E.timer);
        E.stopped = true;
        try {
            await api('nl.delete', {id: E.id});
            toast(t('deleted_ok'));
            onBack();
        } catch (e) {
            E.stopped = false;
            failToast(e);
        }
    }, '.danger-ico');
    const previewBtn = btn(h('span.lbl', t('preview')), {icon: 'eye', size: 'sm', label: t('preview'), onclick: preview});
    // what is not in the bar is in the menu of the three dots (always the same, on every screen)
    const moreMenu = isTpl ? null : h('sav-dropdown', {placement: 'bottom-end', label: t('more'), 'sheet-on-mobile': true},
        h('sav-button', {slot: 'trigger', icon: 'ellipsis-vertical', label: t('more'), title: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true}),
        h('sav-menu-item', {value: 'test'}, icon('mail', {slot: 'prefix'}), t('send_test')),
        h('sav-menu-item', {value: 'tpl'}, icon('layout', {slot: 'prefix'}), t('save_template')),
        h('sav-menu-item', {value: 'file'}, icon('download', {slot: 'prefix'}), t('download_savnew')),
        narrow() || !window.SavOffice?.bars ? null : h('sav-menu-item', {value: 'bar'}, icon('settings-2', {slot: 'prefix'}), window.SavOffice.bars.menuLabel()),
        h('sav-divider'),
        h('sav-menu-item', {value: 'delete', variant: 'danger'}, icon('trash', {slot: 'prefix'}), t('delete_draft')));
    if (moreMenu) moreMenu.addEventListener('sav-select', (ev) => {
        const v = ev.detail.value;
        setTimeout(() => (v === 'test' ? sendTest() : v === 'tpl' ? saveTemplate() : v === 'file' ? downloadFile() : v === 'bar' ? toolsDialog() : discard.click()), 20);
    });
    const tplMore = isTpl && !narrow() && window.SavOffice?.bars ? h('sav-dropdown', {placement: 'bottom-end', label: t('more'), 'sheet-on-mobile': true},
        h('sav-button', {slot: 'trigger', icon: 'ellipsis-vertical', label: t('more'), title: t('more'), appearance: 'ghost', variant: 'neutral', size: 'sm', square: true}),
        h('sav-menu-item', {value: 'bar'}, icon('settings-2', {slot: 'prefix'}), window.SavOffice.bars.menuLabel())) : null;
    if (tplMore) tplMore.addEventListener('sav-select', () => setTimeout(toolsDialog, 20));
    const actions = isTpl ? h('div.ed-actions', R.undoBtn, R.redoBtn, previewBtn, tplMore,
        primary(t('done'), {
            icon: 'check', size: 'sm', onclick: async () => {
                if (await save() !== false || !E.dirty) onBack();
            }
        })) : h('div.ed-actions',
        R.undoBtn, R.redoBtn, previewBtn, moreMenu,
        primary(h('span', t(canSchedule ? 'schedule' : 'propose')), {icon: canSchedule ? 'calendar' : 'send', size: 'sm', onclick: submit}));

    R.palette = h('aside.ed-palette', h('h3', t('blocks')), h('p.muted.small.hide-sm', t('blocks_hint')), h('div.palette-grid', BLOCKS.map((type) => {
        const item = h('button.palette-item', {
            type: 'button',
            draggable: 'true',
            title: t('add_block'),
            onclick: () => insert(type)
        }, icon(type), h('span', t('block_' + type)));
        item.addEventListener('dragstart', (ev) => {
            ev.dataTransfer.setData('text/x-on-new', type);
            E.drag = {type};
            ev.dataTransfer.effectAllowed = 'copy';
            R.stage.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            R.stage.classList.remove('dragging');
            hideDrop();
        });
        return item;
    })));

    R.mail = h('div.ed-mail');
    R.canvas = h('div.ed-canvas', R.mail);
    R.drop = h('div.drop-line');
    R.stage = h('div.ed-stage', R.canvas);
    R.inspector = h('aside.ed-inspector');
    R.tabs = h('sav-radio-group.ed-mobile-tabs.show-sm', {appearance: 'buttons', size: 'sm', value: 'page', 'aria-label': t('page')},
        h('sav-radio', {value: 'page'}, icon('eye'), ' ', t('page')),
        h('sav-radio', {value: 'blocks'}, icon('plus'), ' ', t('blocks')),
        h('sav-radio', {value: 'settings'}, icon('settings'), ' ', t('settings')));
    R.tabs.addEventListener('change', () => mobileTab(R.tabs.value));
    const shell = h('div.editor', {'data-mobile': 'page'},
        h('header.ed-bar', back, h('div.ed-title', R.subject, R.state), actions),
        h('div.ed-main', R.palette, R.stage, R.inspector), R.tabs);
    put(root, shell);

    function mobileTab(tab) {
        shell.dataset.mobile = tab;
        if (R.tabs.value !== tab) R.tabs.value = tab;
    }

    // ---- drag and drop: new blocks from the palette, existing ones by their grip; onto the page or into a column.
    // dataTransfer cannot be read while dragging, so what is being dragged is kept in E.drag.
    function dropZone(ev) {
        const col = ev.target.closest && ev.target.closest('.ed-col');
        const draggingColumns = E.drag && (E.drag.type === 'columns' || (E.drag.id && (find(E.drag.id) || {}).type === 'columns'));
        if (col && !draggingColumns && !(E.drag && E.drag.id && col.closest(`[data-id="${E.drag.id}"]`))) {
            const owner = find(col.dataset.owner);
            if (owner) return {el: col, list: owner.cols[Number(col.dataset.col)].blocks};
        }
        return {el: R.mail, list: blocks()};
    }

    R.stage.addEventListener('dragover', (ev) => {
        const types = ev.dataTransfer.types;
        if (!types.includes('text/x-on-new') && !types.includes('text/x-on-move')) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = types.includes('text/x-on-new') ? 'copy' : 'move';
        const z = dropZone(ev);
        showDrop(z.el, dropIndex(z.el, ev.clientY));
    });
    R.stage.addEventListener('dragleave', (ev) => {
        if (!R.stage.contains(ev.relatedTarget)) hideDrop();
    });
    R.stage.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const z = dropZone(ev);
        const at = dropIndex(z.el, ev.clientY);
        hideDrop();
        R.stage.classList.remove('dragging');
        const type = ev.dataTransfer.getData('text/x-on-new');
        const id = ev.dataTransfer.getData('text/x-on-move');
        E.drag = null;
        if (type) insert(type, at, z.list);
        else if (id) move(id, at, z.list);
    });

    function dropIndex(container, y) {
        const els = [...container.querySelectorAll(':scope > .ed-block')];
        for (let i = 0; i < els.length; i++) {
            const r = els[i].getBoundingClientRect();
            if (y < r.top + r.height / 2) return i;
        }
        return els.length;
    }

    function showDrop(container, i) {
        const els = [...container.querySelectorAll(':scope > .ed-block')];
        if (els[i]) container.insertBefore(R.drop, els[i]);
        else container.insertBefore(R.drop, container.querySelector(':scope > .col-empty') || null);
        R.drop.classList.add('on');
    }

    function hideDrop() {
        R.drop.classList.remove('on');
        R.drop.remove();
    }

    document.addEventListener('keydown', function onKey(ev) {
        if (!document.body.contains(shell)) return document.removeEventListener('keydown', onKey);
        const mod = ev.metaKey || ev.ctrlKey;
        if (mod && ev.key.toLowerCase() === 'z' && !ev.target.closest('[contenteditable], input, textarea')) {
            ev.preventDefault();
            ev.shiftKey ? redo() : undo();
        }
        if (mod && ev.key.toLowerCase() === 's') {
            ev.preventDefault();
            save();
        }
    });

    function drawHistory() {
        R.undoBtn.disabled = !E.undo.length;
        R.redoBtn.disabled = !E.redo.length;
    }

    // ---------------------------------------------------------------- the page

    function applyTheme() {
        const th = E.doc.theme;
        Object.assign(R.canvas.style, {background: th.bg});
        R.mail.style.cssText = `--t-text:${th.text};--t-accent:${th.accent};--t-card:${th.card};--t-radius:${th.radius}px;--t-font:${FONT_CSS[th.font] || FONT_CSS.sans};max-width:${th.width}px`;
    }

    function drawCanvas() {
        applyTheme();
        const els = blocks().map(blockEl);
        const empty = !els.length ? h('div.ed-empty', icon('plus'), h('p', t('canvas_empty'))) : null;
        const foot = h('div.ed-footer', h('p', t('footer_preview_why', {group: group.name})), h('p', h('u', t('footer_preview_unsub'))),
            h('p.ed-footer-made', t('footer_preview_made'), ' ', h('img', {
                src: 'icons/favicon.svg',
                width: 14,
                height: 14,
                alt: ''
            }), ' ', h('strong', 'SavNewsletters')));
        put(R.mail, els, empty);
        R.canvas.querySelector('.ed-footer')?.remove();
        R.canvas.append(foot);
        foot.style.maxWidth = E.doc.theme.width + 'px';
        foot.style.color = E.doc.theme.text;
    }

    /** A contenteditable bound to a field of the block. rich: keeps the safe formatting. */
    function editable(tag, b, key, {rich = false, ph = ''} = {}) {
        const el = h(tag + '.ce', {contenteditable: 'true', spellcheck: 'true', 'data-ph': ph});
        if (rich) el.innerHTML = b[key] || '';
        else el.textContent = b[key] || '';
        el.addEventListener('input', () => {
            b[key] = rich ? el.innerHTML : plain(el);
            changed();
        });
        el.addEventListener('focus', () => selectBlock(b.id));
        if (!rich) {
            el.addEventListener('paste', plainPaste);
            if (tag !== 'div') el.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) ev.preventDefault();
            });
        } else {
            el.addEventListener('paste', (ev) => {
                // pasted HTML keeps only bold, italics and links (the server cleans it anyway)
                const html = (ev.clipboardData || window.clipboardData).getData('text/html');
                if (!html) return;
                ev.preventDefault();
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                tmp.querySelectorAll('script,style,meta,link,title').forEach((n) => n.remove());
                tmp.querySelectorAll('*').forEach((n) => {
                    if (!['B', 'STRONG', 'I', 'EM', 'U', 'A', 'BR', 'P', 'UL', 'OL', 'LI'].includes(n.tagName)) n.replaceWith(...n.childNodes);
                    else [...n.attributes].forEach((a) => {
                        if (!(n.tagName === 'A' && a.name === 'href')) n.removeAttribute(a.name);
                    });
                });
                document.execCommand('insertHTML', false, tmp.innerHTML);
            });
        }
        return el;
    }

    function blockEl(b) {
        const tools = h('div.blk-tools',
            h('span.blk-grip', {title: t('drag'), 'aria-label': t('drag')}, icon('grip')),
            h('span.blk-name', t('block_' + b.type)),
            iconBtn('up', t('move_up'), (ev) => {
                ev.stopPropagation();
                const r = locate(b.id);
                if (r.i > 0) move(b.id, r.i - 1);
            }),
            iconBtn('down', t('move_down'), (ev) => {
                ev.stopPropagation();
                const r = locate(b.id);
                if (r.i < r.list.length - 1) move(b.id, r.i + 2);
            }),
            iconBtn('dup', t('duplicate'), (ev) => {
                ev.stopPropagation();
                duplicate(b.id);
            }),
            iconBtn('trash', t('delete'), (ev) => {
                ev.stopPropagation();
                remove(b.id);
            }));
        const el = h('div.ed-block.blk-' + cssType(b.type) + (E.selected === b.id ? '.sel' : ''), {
            'data-id': b.id,
            onclick: (ev) => {
                ev.stopPropagation();
                selectBlock(b.id);
            }
        }, tools, blockBody(b));
        const grip = tools.querySelector('.blk-grip');
        grip.addEventListener('pointerdown', () => {
            el.draggable = true;
        });
        el.addEventListener('dragstart', (ev) => {
            if (!el.draggable) return;
            ev.stopPropagation();
            ev.dataTransfer.setData('text/x-on-move', b.id);
            E.drag = {id: b.id};
            ev.dataTransfer.effectAllowed = 'move';
            el.classList.add('moving');
            R.stage.classList.add('dragging');
        });
        el.addEventListener('dragend', () => {
            el.draggable = false;
            el.classList.remove('moving');
            R.stage.classList.remove('dragging');
            hideDrop();
        });
        grip.addEventListener('pointerup', () => {
            el.draggable = false;
        });
        return el;
    }

    /** Inline style of a block's cell: the same values lib/render.php uses (block_style()). */
    function cellStyle(b) {
        const s = styleOf(b, isInner(b.id));
        if (!s) return {};
        const th = E.doc.theme;
        const [dSize, dLh] = BLOCK_TEXT[b.type] || [0, 0];
        const size = s.size || (b.type === 'heading' ? HEADING_SIZES[b.level] : dSize);
        const o = {padding: `${s.pt}px ${s.px}px ${s.pb}px`, fontFamily: FONT_CSS[s.font || th.font] || FONT_CSS.sans};
        if (s.bg) o.background = s.bg;
        if (s.color) o.color = s.color;
        if (size) o.fontSize = size + 'px';
        if (s.lh || dLh) o.lineHeight = String(s.lh || dLh);
        const weight = s.weight || (b.type === 'heading' ? '800' : '');
        if (weight) o.fontWeight = weight;
        return o;
    }

    function blockBody(b) {
        const cs = cellStyle(b);
        const pad = (extra, ...kids) => h('div.blk-pad', {style: {...cs, ...extra}}, ...kids);
        switch (b.type) {
            case 'heading':
                return pad({textAlign: b.align}, editable('h' + b.level, b, 'text', {ph: t('ph_heading')}));
            case 'text':
                return pad({textAlign: b.align}, editable('div.rich', b, 'html', {rich: true, ph: t('ph_text')}));
            case 'image':
                if (!b.src) return pad({}, h('div.img-empty', icon('image'), h('span', t('image_empty')), uploadButton(b)));
                return pad({textAlign: b.align, lineHeight: '0'}, h('img', {
                    src: imgUrl(b.src),
                    alt: b.alt,
                    style: {width: b.width + '%', borderRadius: b.rounded ? 'max(6px, var(--t-radius))' : '0'}
                }));
            case 'button': {
                const bg = b.color || 'var(--t-accent)';
                return pad({textAlign: b.align}, h('span.mail-btn' + (b.full ? '.full' : ''), {
                    style: {
                        background: bg,
                        color: onColor(b.color || E.doc.theme.accent)
                    }
                }, editable('span', b, 'label', {ph: t('ph_button')})));
            }
            case 'divider':
                return pad({}, h('hr.mail-hr', {style: {height: (b.thickness || 1) + 'px', ...(b.color ? {background: b.color} : {})}}));
            case 'spacer':
                return h('div.mail-spacer', {style: {height: b.size + 'px'}}, h('span', b.size + ' px'));
            case 'quote':
                return pad({}, h('blockquote.mail-quote', editable('div', b, 'text', {ph: t('ph_quote')}), b.cite ? h('cite', '— ' + b.cite) : null));
            case 'card':
                return pad({}, h('div.mail-card',
                    b.src ? h('img', {
                        src: imgUrl(b.src),
                        alt: ''
                    }) : h('div.img-empty.small', icon('image'), uploadButton(b)),
                    h('div.mail-card-body', editable('h3', b, 'title', {ph: t('ph_card_title')}), editable('div.rich', b, 'html', {
                            rich: true,
                            ph: t('ph_card_text')
                        }),
                        h('span.mail-card-link', editable('span', b, 'label', {ph: t('ph_card_link')}), ' →'))));
            case 'media': {
                const img = b.src ? h('img', {
                    src: imgUrl(b.src),
                    alt: b.alt,
                    style: {borderRadius: b.rounded ? 'max(6px, var(--t-radius))' : '0'}
                }) : h('div.img-empty.small', icon('image'), uploadButton(b));
                const align = {top: 'flex-start', middle: 'center', bottom: 'flex-end'}[b.valign] || 'center';
                return pad({}, h('div.mail-media', {
                        style: {
                            alignItems: align,
                            gap: b.gap + 'px',
                            flexDirection: b.side === 'right' ? 'row-reverse' : 'row'
                        }
                    },
                    h('div.media-img', {style: {flex: `0 0 calc((100% - ${b.gap}px) * ${b.imgWidth / 100})`}}, img),
                    h('div.media-body', editable('h3', b, 'title', {ph: t('ph_card_title')}), editable('div.rich', b, 'html', {
                            rich: true,
                            ph: t('ph_card_text')
                        }),
                        h('span.mail-card-link', editable('span', b, 'label', {ph: t('ph_card_link')}), ' →'))));
            }
            case 'columns': {
                const widths = b.layout.split('-').map(Number);
                const align = {top: 'flex-start', middle: 'center', bottom: 'flex-end'}[b.valign] || 'flex-start';
                return pad({}, h('div.ed-cols', {
                    style: {
                        gap: b.gap + 'px',
                        alignItems: align
                    }
                }, b.cols.map((c, k) => h('div.ed-col' + (E.targetCol && E.targetCol.id === b.id && E.targetCol.k === k ? '.target' : ''), {
                    'data-owner': b.id,
                    'data-col': String(k),
                    style: {flex: `0 0 calc((100% - ${b.gap * (b.count - 1)}px) * ${widths[k] / 100})`},
                    onclick: (ev) => {
                        if (ev.target.closest('.ed-block') !== ev.currentTarget.closest('.ed-block')) return; // a block inside the column
                        E.targetCol = {id: b.id, k};
                        R.mail.querySelectorAll(`[data-owner="${b.id}"]`).forEach((el) => el.classList.toggle('target', el.dataset.col === String(k)));
                    },
                }, c.blocks.map(blockEl), c.blocks.length ? null : h('div.col-empty', icon('plus'), t('col_empty'))))));
            }
            case 'social':
                if (!Array.isArray(b.links)) b.links = [];
                // links without a complete address are shown faded: they are left out of the email.
                // An empty block shows the networks greyed out, so it is clear what to click.
                if (!b.links.length) return pad({textAlign: b.align}, h('div.net-empty', SOCIALS.slice(0, 5).map((k) => h('span.mail-pill.ghost', SOCIAL_NAMES[k])), isTpl ? null : h('div.net-empty-text', icon('plus'), t('social_empty'))));
                return pad({textAlign: b.align}, b.links.map((l) => h('span.mail-pill' + (isTpl || socialUrl(l.url) ? '' : '.bad'), {
                    title: isTpl ? null : socialUrl(l.url) ? l.url : t('social_incomplete'),
                    onclick: () => requestAnimationFrame(() => {
                        const f = l.kind === 'custom' ? R.inspector.querySelectorAll('.net-custom')[b.links.filter((x) => x.kind === 'custom').indexOf(l)]?.querySelector('input') : R.inspector.querySelector(`.net-row[data-kind="${l.kind}"] input`);
                        if (f) f.focus();
                    })
                }, l.kind === 'custom' ? (l.label || t('custom_link')) : SOCIAL_NAMES[l.kind])));
        }
        return h('div');
    }

    function uploadButton(b, label = t('upload')) {
        const file = h('input', {type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', hidden: true});
        const up = btn(label, {
            icon: 'upload', size: 'sm', onclick: (ev) => {
                ev.stopPropagation();
                file.click();
            }
        });
        file.addEventListener('change', async () => {
            const f = file.files[0];
            if (!f) return;
            up.loading = true;
            try {
                const data = await prepareImage(f);
                const r = await api('img.upload', {group: group.id, data});
                b.src = r.src;
                if (b.type === 'image' && !b.alt) b.alt = f.name.replace(/\.[a-z]+$/i, '').slice(0, 120);
                changed();
                redrawBlock(b);
                drawInspector();
            } catch (e) {
                failToast(e);
            } finally {
                up.loading = false;
                file.value = '';
            }
        });
        return h('span', up, file);
    }

    // ---------------------------------------------------------------- inspector

    function drawInspectorHead() {
        const p = R.inspector.querySelector('.inbox-preview');
        if (p) put(p, h('strong', group.fromName || group.name), h('span', E.subject || t('subject_ph')), h('span.muted', E.preheader || t('preheader_ph')));
    }

    function drawInspector() {
        const b = find(E.selected);
        if (!b) return put(R.inspector, docSettings());
        const prop = (label, node) => field(label, node);
        const set = (key, val, redraw = true) => {
            b[key] = val;
            changed();
            if (redraw) redrawBlock(b);
        };
        const textIn = (key, ph = '', redraw = true) => input({
            value: b[key] || '',
            placeholder: ph,
            oninput: (ev) => set(key, ev.target.value, redraw)
        });
        const alignSeg = () => seg([['left', 'alignL'], ['center', 'alignC'], ['right', 'alignR']], b.align, (v) => set('align', v));
        const items = [];
        switch (b.type) {
            case 'heading':
                items.push(prop(t('size'), seg([[1, null, 'H1'], [2, null, 'H2'], [3, null, 'H3']], b.level, (v) => set('level', v))), prop(t('align'), alignSeg()));
                break;
            case 'text':
                items.push(prop(t('format'), richToolbar()), prop(t('align'), alignSeg()), h('p.muted.small', t('text_hint')));
                break;
            case 'image':
                items.push(h('div.prop-img', b.src ? h('img', {
                        src: imgUrl(b.src),
                        alt: ''
                    }) : null, uploadButton(b, b.src ? t('replace') : t('upload'))),
                    prop(t('image_url'), input({
                        value: b.src.startsWith('img:') ? '' : b.src,
                        placeholder: 'https://…',
                        onchange: (ev) => set('src', ev.target.value.trim())
                    })),
                    prop(t('alt_text'), textIn('alt', t('alt_hint'), false)), prop(t('link'), textIn('href', 'https://…', false)),
                    labelled(t('width'), '%', 20, 100, 5, b.width, (v) => set('width', v)),
                    prop(t('align'), alignSeg()), check(t('rounded'), b.rounded, (v) => set('rounded', v)));
                break;
            case 'button':
                items.push(prop(t('link'), textIn('href', 'https://…', false)), prop(t('align'), alignSeg()), check(t('full_width'), b.full, (v) => set('full', v)),
                    prop(t('color'), colorPick(b.color || E.doc.theme.accent, (v) => set('color', v), true, () => set('color', ''))));
                break;
            case 'card':
                items.push(h('div.prop-img', b.src ? h('img', {
                            src: imgUrl(b.src),
                            alt: ''
                        }) : null, uploadButton(b, b.src ? t('replace') : t('upload')),
                        b.src ? btn(t('remove_image'), {
                            icon: 'trash', size: 'sm', appearance: 'ghost', variant: 'danger', onclick: () => {
                                set('src', '');
                                drawInspector();
                            }
                        }) : null),
                    prop(t('link'), textIn('href', 'https://…', false)), prop(t('format'), richToolbar()));
                break;
            case 'media':
                items.push(h('div.prop-img', b.src ? h('img', {
                            src: imgUrl(b.src),
                            alt: ''
                        }) : null, uploadButton(b, b.src ? t('replace') : t('upload')),
                        b.src ? btn(t('remove_image'), {
                            icon: 'trash', size: 'sm', appearance: 'ghost', variant: 'danger', onclick: () => {
                                set('src', '');
                                drawInspector();
                            }
                        }) : null),
                    prop(t('alt_text'), textIn('alt', t('alt_hint'), false)),
                    prop(t('image_side'), seg([['left', 'alignL', t('side_left')], ['right', 'alignR', t('side_right')]], b.side, (v) => set('side', v))),
                    prop(t('valign'), seg([['top', null, t('valign_top')], ['middle', null, t('valign_middle')], ['bottom', null, t('valign_bottom')]], b.valign, (v) => set('valign', v))),
                    labelled(t('image_width'), '%', 25, 60, 5, b.imgWidth, (v) => set('imgWidth', v)),
                    labelled(t('gap'), 'px', 8, 48, 2, b.gap, (v) => set('gap', v)),
                    check(t('rounded'), b.rounded, (v) => set('rounded', v)),
                    prop(t('link'), textIn('href', 'https://…', false)), prop(t('format'), richToolbar()));
                break;
            case 'columns': {
                const setCount = (n) => {
                    if (n === b.count) return;
                    if (n > b.count) while (b.cols.length < n) b.cols.push({blocks: []});
                    else {
                        const extra = b.cols.splice(n).flatMap((c) => c.blocks);
                        b.cols[n - 1].blocks.push(...extra);
                    }
                    b.count = n;
                    b.layout = COLUMN_LAYOUTS[n][0];
                    changed();
                    redrawBlock(b);
                    drawInspector();
                };
                items.push(h('p.muted.small', t('columns_hint')),
                    prop(t('col_count'), seg([[2, null, '2'], [3, null, '3']], b.count, setCount)),
                    prop(t('col_widths'), h('sav-radio-group.layout-pick', {
                        appearance: 'buttons', size: 'sm', value: b.layout, 'aria-label': t('col_widths'),
                        onchange: (ev) => set('layout', ev.currentTarget.value)
                    }, COLUMN_LAYOUTS[b.count].map((l) => h('sav-radio', {value: l, title: l.split('-').join(' / ') + ' %', 'aria-label': l.split('-').join(' / ') + ' %'},
                        h('span.layout-art', l.split('-').map((w) => h('i', {style: {flex: w}}))))))),
                    prop(t('valign'), seg([['top', null, t('valign_top')], ['middle', null, t('valign_middle')], ['bottom', null, t('valign_bottom')]], b.valign, (v) => set('valign', v))),
                    labelled(t('gap'), 'px', 0, 48, 2, b.gap, (v) => set('gap', v)),
                    check(t('col_stack'), b.stack, (v) => set('stack', v)));
                break;
            }
            case 'quote':
                items.push(prop(t('cite'), textIn('cite', t('cite_ph'))));
                break;
            case 'divider':
                items.push(prop(t('color'), colorPick(b.color || '#DDDDDD', (v) => set('color', v), true, () => set('color', ''))),
                    labelled(t('thickness'), 'px', 1, 8, 1, b.thickness || 1, (v) => set('thickness', v)));
                break;
            case 'spacer':
                items.push(labelled(t('height'), 'px', 4, 120, 4, b.size, (v) => set('size', v)));
                break;
            case 'social': {
                // At the top, the links in use, in the order of the newsletter: drag them by the grip or move them with
                // the arrows. Below, the networks still available and the button for custom links (a label of your own).
                // In a template only the choice and the order are made: addresses are written in each newsletter.
                const list = h('div.net-list');
                // documents saved by older versions may have no list, or entries without a network: normalise them
                if (!Array.isArray(b.links)) b.links = b.links && typeof b.links === 'object' ? Object.values(b.links) : [];
                b.links = b.links.filter((l) => l && SOCIALS.includes(l.kind)).map((l) => ({
                    kind: l.kind,
                    url: typeof l.url === 'string' ? l.url : '', ...(l.kind === 'custom' ? {label: typeof l.label === 'string' ? l.label : ''} : {})
                }));
                const after = () => {
                    changed();
                    redrawBlock(b);
                };
                const moveLink = (from, to) => {
                    if (to < 0 || to >= b.links.length || from === to) return;
                    const [x] = b.links.splice(from, 1);
                    b.links.splice(to, 0, x);
                    after();
                    draw();
                };
                let dragFrom = null;
                const urlInput = (l) => input({
                    type: 'url', value: l.url, placeholder: l.kind === 'custom' ? 'https://…' : SOCIAL_PH[l.kind],
                    'aria-label': (l.kind === 'custom' ? l.label || t('custom_link') : SOCIAL_NAMES[l.kind]) + ' — ' + t('social_address'),
                    class: 'input' + (l.url && !socialUrl(l.url) ? ' bad' : ''), oninput: (ev) => {
                        l.url = ev.target.value;
                        ev.target.classList.toggle('bad', !!l.url.trim() && !socialUrl(l.url));
                        after();
                    }
                });
                const activeRow = (l, i) => {
                    const grip = h('span.net-grip', {title: t('drag'), 'aria-hidden': 'true'}, icon('grip'));
                    const name = l.kind === 'custom'
                        ? input({
                            value: l.label,
                            maxlength: 40,
                            placeholder: t('custom_label_ph'),
                            'aria-label': t('custom_label'),
                            class: 'input net-label',
                            oninput: (ev) => {
                                l.label = ev.target.value;
                                after();
                            }
                        })
                        : h('span.net-name', SOCIAL_NAMES[l.kind]);
                    const row = h('div.net-row.on.net-active' + (l.kind === 'custom' ? '.net-custom' : ''), {
                            'data-i': String(i),
                            'data-kind': l.kind
                        },
                        grip, name,
                        iconBtn('up', t('move_up'), () => moveLink(i, i - 1), '.net-arrow'),
                        iconBtn('down', t('move_down'), () => moveLink(i, i + 1), '.net-arrow'),
                        iconBtn('x', t('remove'), () => {
                            b.links.splice(i, 1);
                            after();
                            draw();
                        }),
                        isTpl ? null : urlInput(l));
                    row.querySelectorAll('.net-arrow')[0].disabled = i === 0;
                    row.querySelectorAll('.net-arrow')[1].disabled = i === b.links.length - 1;
                    // drag and drop: only from the grip, so the fields can still be selected with the mouse
                    grip.addEventListener('pointerdown', () => {
                        row.draggable = true;
                    });
                    grip.addEventListener('pointerup', () => {
                        row.draggable = false;
                    });
                    row.addEventListener('dragstart', (ev) => {
                        if (!row.draggable) return;
                        dragFrom = i;
                        ev.dataTransfer.effectAllowed = 'move';
                        ev.dataTransfer.setData('text/plain', String(i));
                        row.classList.add('moving');
                    });
                    row.addEventListener('dragend', () => {
                        row.draggable = false;
                        dragFrom = null;
                        list.querySelectorAll('.net-active').forEach((r) => r.classList.remove('moving', 'drop-before', 'drop-after'));
                    });
                    row.addEventListener('dragover', (ev) => {
                        if (dragFrom === null) return;
                        ev.preventDefault();
                        const r = row.getBoundingClientRect();
                        const before = ev.clientY < r.top + r.height / 2;
                        list.querySelectorAll('.net-active').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
                        row.classList.add(before ? 'drop-before' : 'drop-after');
                    });
                    row.addEventListener('drop', (ev) => {
                        if (dragFrom === null) return;
                        ev.preventDefault();
                        const r = row.getBoundingClientRect();
                        let to = ev.clientY < r.top + r.height / 2 ? i : i + 1;
                        if (to > dragFrom) to--;
                        const from = dragFrom;
                        dragFrom = null;
                        moveLink(from, to);
                    });
                    return row;
                };
                const freeRow = (k) => {
                    if (isTpl) {
                        return h('div.net-row.net-toggle', checkbox(SOCIAL_NAMES[k], false, (on) => {
                            if (on) {
                                b.links.push({kind: k, url: ''});
                                after();
                                draw();
                            }
                        }));
                    }
                    // writing an address adds the network; it joins the list above when the field is left
                    let link = null;
                    return h('div.net-row', {'data-kind': k}, h('span.net-name', SOCIAL_NAMES[k]),
                        input({
                            type: 'url',
                            placeholder: SOCIAL_PH[k],
                            'aria-label': SOCIAL_NAMES[k] + ' — ' + t('social_address'),
                            oninput: (ev) => {
                                const v = ev.target.value;
                                if (v.trim() && !link) {
                                    link = {kind: k, url: v};
                                    b.links.push(link);
                                } else if (!v.trim() && link) {
                                    b.links = b.links.filter((x) => x !== link);
                                    link = null;
                                } else if (link) link.url = v;
                                ev.target.classList.toggle('bad', !!v.trim() && !socialUrl(v));
                                after();
                            },
                            onchange: () => draw()
                        }));
                };
                const addCustom = btn(t('custom_add'), {
                    icon: 'plus', size: 'sm', onclick: () => {
                        b.links.push({kind: 'custom', label: '', url: ''});
                        after();
                        draw();
                        const labels = list.querySelectorAll('.net-custom .net-label');
                        if (labels.length) labels[labels.length - 1].focus();
                    }
                });
                const draw = () => {
                    const free = NETWORKS.filter((k) => !b.links.some((x) => x.kind === k));
                    put(list,
                        b.links.length ? [h('h4.net-sub', t(isTpl ? 'links_in_tpl' : 'links_in_use')), b.links.map(activeRow)] : h('p.muted.small', t('links_none')),
                        free.length ? [h('h4.net-sub', t(isTpl ? 'links_add_tpl' : 'links_add')), free.map(freeRow)] : null,
                        addCustom);
                };
                draw();
                items.push(isTpl ? h('sav-alert', {variant: 'neutral', heading: t('social_tpl_title')}, icon('layout', {slot: 'icon'}), t('social_hint_tpl')) : h('p.muted.small', t('social_hint')),
                    list, prop(t('align'), alignSeg()));
                break;
            }
        }
        put(R.inspector,
            h('div.insp-head', btn(t(isTpl ? 'template_settings' : 'newsletter_settings'), {icon: 'back', size: 'sm', appearance: 'ghost', onclick: () => selectBlock(null)}),
                h('h3', icon(b.type), t('block_' + b.type))),
            h('div.insp-body', items, styleSection(b)),
            h('div.insp-foot', btn(t('duplicate'), {icon: 'dup', size: 'sm', onclick: () => duplicate(b.id)}),
                btn(t('delete'), {icon: 'trash', size: 'sm', variant: 'danger', appearance: 'outline', onclick: () => remove(b.id)})));
    }

    /** A slider whose label shows its value. */
    function labelled(label, unit, min, max, step, value, on, auto = '') {
        const r = h('sav-range', {label, min, max, step, value, 'show-value': true, unit: unit ? ' ' + unit : '', help: auto ? '0 = ' + auto : null, size: 'sm'});
        r.addEventListener('input', () => on(Number(r.value)));
        return r;
    }

    /** Spacing, typeface and colours of any block (not the spacer): stored in b.style. */
    function styleSection(b) {
        const s = styleOf(b, isInner(b.id));
        if (!s) return null;
        const th = E.doc.theme;
        const setS = (k, v) => {
            s[k] = v;
            changed();
            redrawBlock(b);
        };
        const isText = !!BLOCK_TEXT[b.type];
        const [dSize] = BLOCK_TEXT[b.type] || [0];
        const autoSize = (b.type === 'heading' ? HEADING_SIZES[b.level] : dSize) + ' px · ' + t('auto');
        const box = h('sav-details.style-box', {summary: t('block_style'), open: E.styleOpen ? true : null},
            h('sav-label', {appearance: 'plain', case: 'normal', variant: 'neutral'}, t('spacing')),
            labelled(t('space_top'), 'px', 0, 96, 2, s.pt, (v) => setS('pt', v)),
            labelled(t('space_bottom'), 'px', 0, 96, 2, s.pb, (v) => setS('pb', v)),
            labelled(t('space_sides'), 'px', 0, 64, 2, s.px, (v) => setS('px', v)),
            isText ? [
                h('sav-label', {appearance: 'plain', case: 'normal', variant: 'neutral'}, t('typography')),
                field(t('font'), select([['', t('font_default', {name: FONT_NAMES[th.font]})], ...Object.entries(FONT_NAMES)], s.font, {onchange: (ev) => setS('font', ev.target.value)})),
                labelled(t('text_size'), 'px', 0, 56, 1, s.size, (v) => setS('size', v), autoSize),
                field(t('line_height'), select([['0', t('auto')], ...['1', '1.15', '1.3', '1.45', '1.6', '1.8', '2'].map((v) => [v, v])], String(s.lh || 0), {onchange: (ev) => setS('lh', Number(ev.target.value))})),
                ['heading', 'text', 'quote', 'card', 'media'].includes(b.type) ? field(t('weight'), select([['', t('auto')], ['400', t('weight_normal')], ['700', t('weight_bold')], ['800', t('weight_black')]], s.weight, {onchange: (ev) => setS('weight', ev.target.value)})) : null,
                field(t('text_color'), colorPick(s.color || th.text, (v) => setS('color', v), true, () => setS('color', ''))),
            ] : null,
            field(t('block_bg'), colorPick(s.bg || th.card, (v) => setS('bg', v), true, () => setS('bg', ''))),
            btn(t('reset_style'), {
                icon: 'undo', size: 'sm', appearance: 'ghost', onclick: () => {
                    b.style = defaultStyle(b.type, isInner(b.id));
                    changed();
                    redrawBlock(b);
                    drawInspector();
                }
            }));
        box.addEventListener('sav-toggle', () => {
            E.styleOpen = !!box.open;
        });
        box.addEventListener('toggle', () => {
            E.styleOpen = !!box.open;
        });
        return box;
    }

    function docSettings() {
        const th = E.doc.theme;
        const setTheme = (k, v) => {
            th[k] = v;
            changed();
            applyTheme();
            if (k === 'accent' || k === 'text') drawCanvas();
            const foot = R.canvas.querySelector('.ed-footer');
            if (foot) {
                foot.style.maxWidth = th.width + 'px';
                foot.style.color = th.text;
            }
        };
        const langs = group.langs;
        return [
            h('div.insp-head', h('h3', icon('settings'), t(isTpl ? 'template_settings' : 'newsletter_settings'))),
            h('div.insp-body',
                isTpl ? h('p.muted.small', t('template_mode_hint')) : h('div.inbox-preview'),
                isTpl ? null : field(t('preheader'), input({
                    value: E.preheader,
                    maxlength: 200,
                    placeholder: t('preheader_ph'),
                    oninput: (ev) => {
                        E.preheader = ev.target.value;
                        changed();
                        drawInspectorHead();
                    }
                }), t('preheader_hint')),
                !isTpl && langs.length > 1 ? field(t('audience'), select([['', t('all_langs')], ...langs.map((l) => [l, LANG_NAMES[l] || l])], E.lang, {
                    onchange: (ev) => {
                        E.lang = ev.target.value;
                        changed();
                    }
                }), t('audience_hint')) : null,
                h('sav-label', {appearance: 'plain', case: 'normal', variant: 'neutral'}, icon('palette'), ' ', t('look')),
                field(t('accent'), colorPick(th.accent, (v) => setTheme('accent', v), false, null, 'accent', PRESET_COLORS)),
                h('div.grid2', field(t('text_color'), colorPick(th.text, (v) => setTheme('text', v))), field(t('background'), colorPick(th.bg, (v) => setTheme('bg', v)))),
                field(t('page_color'), colorPick(th.card, (v) => setTheme('card', v))),
                field(t('font'), select(Object.entries(FONT_NAMES), th.font, {onchange: (ev) => setTheme('font', ev.target.value)}), t('font_hint')),
                labelled(t('corners'), 'px', 0, 28, 2, th.radius, (v) => setTheme('radius', v)),
                labelled(t('page_width'), 'px', 480, 720, 20, th.width, (v) => setTheme('width', v)),
                h('p.muted.small', t('footer_note'))),
        ];
    }

    /** A choice among a few (sav-radio-group as buttons): [[value, icon, label]]; the values keep their type. */
    function seg(opts, value, onPick) {
        const g = h('sav-radio-group.segm', {appearance: 'buttons', size: 'sm', value: String(value)},
            opts.map(([v, ic, label]) => h('sav-radio', {value: String(v), title: label || t('align_' + v), 'aria-label': label || t('align_' + v)}, ic ? icon(ic) : label)));
        g.addEventListener('change', () => {
            const o = opts.find(([v]) => String(v) === g.value);
            if (o) onPick(o[0]);
        });
        return g;
    }

    function check(label, value, on) {
        return checkbox(label, value, on, {switch: true});
    }

    /** sav-color-picker (suggested colours: the presets), with a button back to the colour of the theme. */
    function colorPick(value, on, allowReset = false, onReset = null, key = '', swatches = null) {
        const c = h('sav-color-picker', {value: value || '#000000', size: 'sm', swatches: swatches ? swatches.join(',') : null, 'data-k': key || null});
        const pick = () => {
            const v = String(c.value || '');
            if (/^#[0-9a-f]{6}$/i.test(v)) on(v.toUpperCase());
        };
        c.addEventListener('input', pick);
        c.addEventListener('change', pick);
        return allowReset ? h('div.color-row', c, iconBtn('undo', t('reset'), () => {
            onReset();
            drawInspector();
        })) : c;
    }

    /** Formatting of the rich text being edited (execCommand works on the selection inside the page). */
    function richToolbar() {
        const cmd = (c, v = null) => (ev) => {
            ev.preventDefault();
            document.execCommand(c, false, v);
            const ce = document.activeElement && document.activeElement.closest('.ce');
            if (ce) ce.dispatchEvent(new Event('input'));
        };
        const keep = (ev) => ev.preventDefault(); // keeps the selection in the page while clicking
        const tb = (ic, title, fn) => h('sav-button', {icon: ico(ic), label: title, title, appearance: 'ghost', variant: 'neutral', size: 'sm', square: true, onmousedown: keep, onclick: fn});
        const tools = richTools(cmd);
        // the buttons shown and their order: a choice of each person (⋮ → Customise the bar), kept with the account
        const el = (k) => (k === '|' ? h('span.rich-sep.so-sep') : k === '_' ? h('i.rich-gap') : k === '~' ? h('span.rich-flex') : tb(tools[k][0], tools[k][1], tools[k][2]));
        return h('sav-button-group.rich-tools', {label: t('format')}, richOn().map(el));
    }

    /** The buttons the bar of a text can have: [icon, name, what it does]. */
    function richTools(cmd = () => () => {}) {
        return {
            bold: ['bold', t('bold'), cmd('bold')], italic: ['italic', t('italic'), cmd('italic')], underline: ['underline', t('underline'), cmd('underline')],
            strike: ['strikethrough', t('strike'), cmd('strikeThrough')],
            link: ['link', t('link'), (ev) => {
                ev.preventDefault();
                const url = prompt(t('link_prompt'), 'https://');
                if (url && /^(https?:\/\/|mailto:)/i.test(url.trim())) cmd('createLink', url.trim())(ev);
            }],
            bullets: ['list', t('bullets'), cmd('insertUnorderedList')], numbers: ['olist', t('numbers'), cmd('insertOrderedList')], clear: ['clear', t('clear_format'), cmd('removeFormat')],
            undo: ['undo', t('undo'), cmd('undo')], redo: ['redo-2', t('redo'), cmd('redo')],
        };
    }
    const RICH_DEF = ['bold', 'italic', 'underline', 'link', 'bullets', 'numbers', 'clear'];
    /** The buttons chosen, in order ('|' a separator, '_' a fixed space, '~' an adaptive one: SavOffice.bars), kept with the account. */
    const richOn = () => {
        const B = window.SavOffice && window.SavOffice.bars, items = Object.keys(richTools()).map((k) => [k]), v = (prefs().bars || {}).tools || prefs().tools;
        return B ? B.layout(B.pick(v, RICH_DEF, items)) : RICH_DEF;
    };

    /** Customising the bar of a text (⋮ → Customise the bars): the window shared by the apps of SavOffice, with its preview. */
    function toolsDialog() {
        const B = window.SavOffice && window.SavOffice.bars;
        if (!B) return;
        const items = Object.entries(richTools()).map(([k, x]) => [k, ico(x[0]), x[1]]);
        B.dialog({
            bars: [{id: 'tools', items, def: RICH_DEF}], value: {tools: B.pick((prefs().bars || {}).tools || prefs().tools, RICH_DEF, items)},
            save: async (v) => {
                await setPrefs({bars: {...(prefs().bars || {}), ...v}});
                drawInspector();
            }
        });
    }


    // ---------------------------------------------------------------- actions

    async function preview() {
        try {
            const r = isTpl ? await api('tpl.preview', {
                group: group.id,
                doc: E.doc
            }) : await api('nl.preview', {
                id: E.id,
                doc: E.doc,
                subject: E.subject,
                preheader: E.preheader,
                lang: E.lang || null
            });
            previewDialog(r.html, E.subject || t('preview'));
        } catch (e) {
            failToast(e);
        }
    }

    async function sendTest() {
        if (!group.sendingReady) return modal(t('send_test'), [h('p', t('smtp_needed'))], [{
            label: t('ok'),
            primary: true
        }]);
        try {
            await save();
            const r = await api('nl.test', {
                id: E.id,
                doc: E.doc,
                subject: E.subject,
                preheader: E.preheader,
                lang: E.lang || null
            });
            toast(t('test_sent', {email: r.to}));
        } catch (e) {
            failToast(e);
        }
    }

    /** The newsletter as it is in the editor, as a .savnew file on the device (assets/files.js). */
    async function downloadFile() {
        try {
            await saveSavnew({subject: E.subject, preheader: E.preheader, lang: E.lang, doc: E.doc});
        } catch (e) {
            failToast(e);
        }
    }

    async function saveTemplate() {
        let own = [];
        try {
            own = (await api('tpl.list', null, 'group=' + group.id)).own;
        } catch (e) { /* new template only */
        }
        const name = input({value: E.subject, maxlength: 80, placeholder: t('template_name')});
        const target = own.length ? select([['', t('template_new')], ...own.map((o) => [String(o.id), t('template_replace', {name: o.name})])], '') : null;
        modal(t('save_template'), h('div.form', h('p.muted', t('template_hint')), field(t('template_name'), name), target ? field(t('template_target'), target) : null), [
            {label: t('cancel')},
            {
                label: t('save'), primary: true, icon: 'save', onclick: async () => {
                    try {
                        await api('tpl.save', {
                            group: group.id,
                            id: target && target.value ? Number(target.value) : 0,
                            name: name.value.trim() || (target && own.find((o) => String(o.id) === target.value)?.name) || '',
                            doc: E.doc
                        });
                        toast(t('template_saved'));
                    } catch (e) {
                        failToast(e);
                        return false;
                    }
                }
            },
        ]);
    }

    async function submit() {
        if (!E.subject.trim()) {
            R.subject.focus();
            return toast(t('err_subject_required'), 'err');
        }
        if (!(await save()) && E.dirty) return;
        const publisher = atLeast(role, 'publisher');
        const count = E.lang ? (group.subscribers.byLang[E.lang] || 0) : group.subscribers.active;
        const pick = await slotDialog(group, {
            title: t(publisher ? 'schedule_title' : 'propose_title'),
            action: t(publisher ? 'schedule' : 'propose'),
            allowDirect: publisher,
            note: t('recipients_now', {n: count}) + (publisher ? '' : ' ' + t('propose_note')),
        });
        if (!pick) return;
        try {
            const r = await api('nl.submit', {id: E.id, ...pick});
            toast(t(r.newsletter.status === 'scheduled' ? 'scheduled_ok' : 'proposed_ok'));
            onChange(r.newsletter);
        } catch (e) {
            failToast(e);
        }
    }

    // ---------------------------------------------------------------- start

    E.lastSnap = JSON.stringify({doc: E.doc, subject: E.subject, preheader: E.preheader, lang: E.lang});
    drawCanvas();
    drawInspector();
    drawInspectorHead();
    drawHistory();
    setState('saved');
    if (isTpl && !E.tplId) {
        E.dirty = true;
        save();
    }
    return {save};
}

/** Readable text on a coloured background (same rule as on_color() in lib/render.php). */
function onColor(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '#fff';
    const l = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
    return l > 0.62 ? '#17152B' : '#FFFFFF';
}

export {fmtDate};
