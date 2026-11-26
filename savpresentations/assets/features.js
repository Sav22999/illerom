/** Tools of the editor: command palette, find and replace, versions, overview, slides from a text, styles, groups. */
import {
    ago,
    api,
    btn,
    confirmBox,
    dialog,
    get,
    h,
    iconBtn,
    isMac,
    ok,
    oops,
    promptBox,
    state,
    tile,
    toast,
    uid
} from './core.js';
import {t} from './i18n.js';
import {fluidThumb} from './render.js';
import {context} from './themes.js';
import {fixSlide} from './model.js';
import {makeSlide} from './layouts.js';
import {esc, plain} from './richtext.js';

const STYLE = ['font', 'size', 'color', 'bold', 'italic', 'under', 'caps', 'align', 'va', 'lh', 'ls', 'pad', 'fill', 'stroke', 'sw', 'dash', 'rad', 'shadow', 'o'];

export function addFeatures(ed) {
    const deck = ed.deck;
    const sel = () => [...ed.sel].map((id) => ({id, el: deck.el(ed.sid, id)})).filter((x) => x.el);

    // ---------------------------------------------------------------- styles
    ed.copyStyle = () => {
        const x = sel()[0];
        if (!x) return;
        ed.styleClip = Object.fromEntries(STYLE.map((k) => [k, x.el[k] ?? null]));
        ed.styleClip.role = x.el.role;
        ok(t('style_copied'));
        ed.refreshPanel();
    };
    ed.pasteStyle = () => {
        if (!ed.styleClip) return;
        deck.do(sel().map(({id, el}) => {
            const p = {...ed.styleClip};
            delete p.role;
            if (el.t === 'text' && ed.styleClip.role) p.role = ed.styleClip.role;
            if (el.t === 'image' || el.t === 'video') for (const k of ['fill', 'font', 'size', 'color']) delete p[k];
            return {k: 'el.set', s: ed.sid, e: id, p};
        }));
        ed.refreshPanel();
    };

    // ---------------------------------------------------------------- groups: elements with the same g are selected together
    ed.groupOf = (id) => {
        const g = deck.el(ed.sid, id)?.g;
        return g ? Object.entries(deck.slide(ed.sid).d.els).filter(([, e]) => e.g === g).map(([k]) => k) : [id];
    };
    ed.group = () => {
        const l = sel();
        if (l.length < 2) return;
        const g = uid();
        deck.do(l.map((x) => ({k: 'el.set', s: ed.sid, e: x.id, p: {g}})));
        ed.refreshPanel();
    };
    ed.ungroup = () => {
        deck.do(sel().filter((x) => x.el.g).map((x) => ({k: 'el.set', s: ed.sid, e: x.id, p: {g: null}})));
        ed.refreshPanel();
    };

    // ---------------------------------------------------------------- find and replace
    ed.findReplace = () => {
        const q = h('sav-input', {label: t('find'), clearable: true, autofocus: true}),
            r = h('sav-input', {label: t('replace_with')}), cs = h('sav-checkbox', {size: 'sm'}, t('match_case')),
            list = h('sav-list.flist');
        const re = () => new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs.checked ? 'g' : 'gi');
        const hits = () => {
            if (!q.value) return [];
            const out = [];
            for (const s of deck.order()) {
                for (const [id, el] of Object.entries(s.d.els)) {
                    const txt = el.t === 'table' ? (el.cells || []).flat().join(' ') : plain(el.html || '');
                    const n = (txt.match(re()) || []).length;
                    if (n) out.push({sid: s.sid, id, n, txt});
                }
                if ((s.d.notes || '').match(re())) out.push({sid: s.sid, id: '', n: 1, txt: s.d.notes});
            }
            return out;
        };
        const draw = () => {
            const hs = hits();
            list.replaceChildren(...hs.slice(0, 60).map((x) => h('sav-list-item', {
                button: true, onclick: () => {
                    ed.goto(x.sid);
                    if (x.id) ed.select([x.id]);
                }
            }, h('sav-badge', {
                slot: 'prefix',
                appearance: 'soft',
                variant: 'neutral'
            }, String(deck.index(x.sid) + 1)), x.txt.slice(0, 90))));
            count.textContent = q.value ? t('n_found', {n: hs.reduce((a, x) => a + x.n, 0)}) : '';
        };
        const count = h('small.muted');
        q.addEventListener('input', draw);
        cs.addEventListener('change', draw);
        q.addEventListener('sav-clear', draw);
        // only the words change: the formatting around them stays
        const swap = (html) => {
            const d = new DOMParser().parseFromString(html, 'text/html'),
                w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
            while (w.nextNode()) w.currentNode.nodeValue = w.currentNode.nodeValue.replace(re(), () => r.value);
            return d.body.innerHTML;
        };
        return dialog(t('find_replace'), h('div.stack', h('div.two', q, r), cs, count, list), [[t('close'), null, {
            appearance: 'outline',
            variant: 'neutral'
        }], ...(ed.editor ? [[t('replace_all'), () => {
            const ops = [];
            for (const x of hits()) {
                const s = deck.slide(x.sid);
                if (!x.id) ops.push({
                    k: 'slide.set',
                    s: x.sid,
                    p: {notes: s.d.notes.replace(re(), () => r.value)}
                }); else {
                    const el = s.d.els[x.id];
                    ops.push({
                        k: 'el.set',
                        s: x.sid,
                        e: x.id,
                        p: el.t === 'table' ? {cells: el.cells.map((row) => row.map((c) => String(c).replace(re(), () => r.value)))} : {html: swap(el.html)}
                    });
                }
            }
            deck.do(ops);
            ok(t('n_replaced', {n: ops.length}));
            draw();
            return false;
        }, {}]] : [])], {width: '36rem'});
    };

    // ---------------------------------------------------------------- versions: a side panel, as in SavDocuments
    ed.versions = () => ed.setTab('history');
    ed.versionsPanel = () => {
        const body = h('div.stack.versions', h('sav-spinner'));
        const look = async (v) => {
            try {
                const r = await get('version.get', {d: deck.uid, id: v.id});
                r.meta.theme.colors ||= {};
                r.meta.theme.fonts ||= {};
                const ctx = context(r.meta);
                await dialog(v.label && v.label !== '—' ? v.label : new Date(v.at).toLocaleString(), h('div.grid.aview', ...r.slides.map((s, i) => fluidThumb(fixSlide(s.d), ctx, {index: i}))), [[t('close'), null, {
                    appearance: 'outline',
                    variant: 'neutral'
                }], [t('restore'), () => restore(v), {icon: 'rotate-ccw'}]], {width: '64rem'});
            } catch (e) {
                oops(e);
            }
        };
        const restore = async (v) => {
            if (!(await confirmBox(t('restore'), t('restore_t'), t('restore'), false))) return false;
            await deck.sync();
            await api('version.restore', {d: deck.uid, id: v.id});
            dispatchEvent(new PopStateEvent('popstate'));
            return true;
        };
        const saveOne = async () => {
            const name = await promptBox(t('save_version'), t('name'), '', t('save'), 80);
            if (!name) return;
            try {
                await deck.sync();
                await api('version.save', {d: deck.uid, label: name});
                await load();
            } catch (e) {
                oops(e);
            }
        };

        async function load() {
            try {
                const r = await get('version.list', {d: deck.uid});
                if (!body.isConnected && body.dataset.done) return;
                body.dataset.done = 1;
                body.replaceChildren(btn(t('save_version'), saveOne, {icon: 'history', size: 'sm', block: true, appearance: 'outline', variant: 'neutral'}), h('p.muted.small', t('versions_t')),
                    ...(r.versions.length ? r.versions.map((v) => {
                        const named = v.label && v.label !== '—', when = new Date(v.at).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
                        return tile(named ? v.label : when, () => look(v), {class: 'version'}, h('strong', named ? v.label : when), h('small.muted', [named ? ago(v.at) : t('auto_version'), v.by].filter(Boolean).join(' · ')));
                    }) : [h('sav-empty-state', {icon: 'history', heading: t('no_versions_h'), text: t('no_versions')})]));
            } catch (e) {
                body.replaceChildren(h('p.muted', e.message || t('err_server')));
                oops(e);
            }
        }

        load();
        return body;
    };

    // ---------------------------------------------------------------- overview of all the slides
    ed.overview = () => {
        let dlg;
        const grid = h('div.grid.ovw', ...deck.order().map((s, i) => tile(t('slide') + ' ' + (i + 1), () => {
            ed.goto(s.sid);
            dlg.close();
        }, {class: 'lay' + (s.sid === ed.sid ? ' on' : '') + (s.d.hide ? ' hid' : '')}, fluidThumb(s.d, ed.ctx, {
            index: i,
            count: deck.slides.size
        }), h('span', [i + 1, s.d.name].filter(Boolean).join(' · ')))));
        return dialog(t('overview'), grid, [], {width: 'min(78rem, 94vw)', ref: (d) => (dlg = d)});
    };

    ed.fromText = () => textDialog(t('add_from_text'), (slides) => {
        let i = deck.index(ed.sid) + 1;
        const ops = slides.map((s) => ({k: 'slide.add', s: s.sid, d: s.d}));
        for (const op of ops) {
            op.pos = deck.posAt(i++);
            deck.apply(op);
        }
        for (const op of ops) deck.slides.delete(op.s);
        deck.do(ops);
        ed.goto(ops[0].s);
    }, () => ed.ctx);

    // ---------------------------------------------------------------- command palette (Ctrl or Cmd + J, as in SavDocuments)
    const C = isMac ? '⌘' : 'Ctrl+';
    const pal = h('sav-command', {
        hotkey: 'mod+j',
        placeholder: t('palette_ph'),
        'empty-label': t('no_results'),
        label: t('palette_l')
    });
    const cmds = {};
    const group = (label, list) => {
        const g = h('optgroup', {label});
        for (const [id, ic, name, fn, kbd] of list.filter(Boolean)) {
            cmds[id] = fn;
            g.append(h('option', {value: id, 'data-icon': ic, 'data-shortcut': kbd || null}, name));
        }
        pal.append(g);
    };
    const E = ed.editor, A = deck.canEdit;
    if (E) group(t('insert'), [['i-text', 'type', t('text'), () => ed.insert('text:body'), 'T'], ['i-title', 'heading-1', t('r_title'), () => ed.insert('text:title')], ['i-list', 'list', t('r_list'), () => ed.insert('text:list')], ['i-img', 'image', t('image'), () => ed.insert('image')], ['i-vid', 'film', t('video'), () => ed.insert('video')], ['i-chart', 'chart-column', t('chart'), () => ed.insert('chart:bar')], ['i-table', 'table', t('table'), () => ed.insert('table')], ['i-shape', 'shapes', t('shapes'), () => ed.setTab('elements')]]);
    if (E) group(t('page'), [['g-name', 'pencil', t('rename_page'), () => ed.renamePage()], ['g-hide', 'eye-off', t('hide_show'), () => ed.toggleHide()], deck.role === 'owner' && ['g-rules', 'key-round', t('page_rules'), () => import('./pages.js').then((m) => m.pageRulesDialog(ed, [ed.sid]))], ['g-mode', 'grid-3x3', t('mode_switch'), () => ed.setMode(!ed.simple)]]);
    if (A) group(t('slide'), [['s-new', 'plus', t('new_slide'), () => ed.addSlide(), 'Ctrl+M'], ['s-dup', 'copy-plus', t('duplicate') + ' · ' + t('slide'), () => ed.duplicateSlide()], ['s-del', 'trash', t('delete') + ' · ' + t('slide'), () => ed.deleteSlide()], ['s-lay', 'layout-template', t('layouts'), () => ed.setTab('layouts')], ['s-theme', 'palette', t('theme'), () => ed.setTab('theme')], ['s-text', 'file-text', t('add_from_text'), () => ed.fromText()]]);
    group(t('show'), [['p-all', 'play', t('present_start'), () => ed.show(deck.order()[0]?.sid), 'F5'], ['p-here', 'play', t('present_here'), () => ed.show(ed.sid), '⇧F5'], ['p-over', 'layout-grid', t('overview'), () => ed.overview()]]);
    group(t('tools'), [['t-find', 'search', t('find_replace'), () => ed.findReplace(), C + 'F'], A && !deck.limited && !deck.local && ['t-ver', 'history', t('versions'), () => ed.versions()], A && ['t-opt', 'settings', t('deck_options'), () => ed.options()], ['t-dl', 'download', t('download'), () => ed.download()], !deck.local && ['t-com', 'message-square', t('comments'), () => ed.setTab('comments')], !deck.local && ['t-note', 'sticky-note', t('notes'), () => ed.setTab('notes')], A && ['t-cred', 'copyright', t('credits_slide'), () => ed.creditsSlide()], ['t-keys', 'keyboard', t('shortcuts'), () => ed.shortcuts()]]);
    pal.addEventListener('sav-select', (e) => {
        const fn = cmds[e.detail.value];
        if (fn) setTimeout(fn, 60);
    });
    document.body.append(pal);
    ed.palette = () => pal.show();
    return () => pal.remove();
}

// ------------------------------------------------------------------ slides from a text

/**
 * Markdown-like text to slides: "#" a cover or section, "##" the title of a slide, "-" a list, ">" a quote, "---" a new
 * slide; a "|" row is a table, a line alone is a statement.
 */
export function slidesFromText(text, ctx) {
    const out = [];
    let cur = null;
    const flush = () => {
        if (!cur) return;
        const body = cur.body.join('\n').trim(), q = cur.quote.join('\n');
        let s;
        if (cur.table.length > 1) {
            s = makeSlide('table', ctx, {title: cur.title || ''});
            const tb = Object.values(s.d.els).find((e) => e.t === 'table');
            if (tb) tb.cells = cur.table;
        } else if (q) s = makeSlide('quote', ctx, {
            quote: q.replace(/\s+[—–-]\s+([^—–]+)$/, ''),
            author: (q.match(/\s+[—–-]\s+([^—–]+)$/) || [])[1] || cur.title || ''
        });
        else if (cur.level === 1 && !out.length) s = makeSlide('cover', ctx, {title: cur.title, subtitle: body});
        else if (cur.level === 1 && !body) s = makeSlide('section', ctx, {title: cur.title, label: ''});
        else if (cur.title && !body) s = makeSlide('statement', ctx, {title: cur.title});
        else if (cur.title) s = makeSlide('title-body', ctx, {title: cur.title, body});
        else if (body) s = !body.includes('\n') && body.length < 120 ? makeSlide('statement', ctx, {title: body}) : makeSlide('title-body', ctx, {
            title: '',
            body
        });
        if (s) {
            if (cur.notes) s.d.notes = cur.notes;
            out.push(s);
        }
        cur = null;
    };
    const start = () => (cur ||= {title: '', level: 0, body: [], quote: [], table: [], notes: ''});
    for (const raw of String(text).replace(/\r/g, '').split('\n')) {
        const l = raw.trimEnd(), m = l.match(/^(#{1,6})\s+(.*)$/);
        if (/^-{3,}$/.test(l.trim())) {
            flush();
            continue;
        }
        if (m) {
            flush();
            start();
            cur.title = m[2].replace(/[*_`]/g, '');
            cur.level = m[1].length;
            continue;
        }
        if (!l.trim()) {
            if (cur && cur.body.length) cur.body.push('');
            continue;
        }
        // a quote or a table after some text is a slide of its own
        if (/^(>|\s*\|)/.test(l) && cur?.body.some((x) => x.trim())) flush();
        start();
        if (/^>\s?/.test(l)) cur.quote.push(l.replace(/^>\s?/, ''));
        else if (/^\s*\|.*\|\s*$/.test(l)) {
            if (!/^\s*\|[\s:|-]+\|\s*$/.test(l)) cur.table.push(l.trim().slice(1, -1).split('|').map((c) => c.trim()));
        } else if (/^(note|nota)s?:/i.test(l)) cur.notes = (cur.notes ? cur.notes + '\n' : '') + l.replace(/^[a-z]+:\s*/i, '');
        else cur.body.push(l.replace(/^\s*[*+•-]\s+/, '- ').replace(/^\s*\d+[.)]\s+/, '- ').replace(/\*\*(.+?)\*\*/g, '$1').replace(/[`]/g, ''));
    }
    flush();
    return out;
}

export function textDialog(title, done, ctxOf) {
    const ta = h('sav-textarea', {
        label: t('your_text'),
        rows: 12,
        resize: 'vertical',
        placeholder: t('text_ph'),
        help: t('text_help')
    }), prev = h('div.grid.tprev');
    let slides = [], deb;
    const draw = () => {
        slides = slidesFromText(ta.value, ctxOf());
        prev.replaceChildren(...slides.slice(0, 24).map((s, i) => fluidThumb(s.d, ctxOf(), {index: i})));
    };
    ta.addEventListener('input', () => {
        clearTimeout(deb);
        deb = setTimeout(draw, 250);
    });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    return dialog(title, h('div.ttext', ta, prev), [[t('cancel'), null, {
        appearance: 'outline',
        variant: 'neutral'
    }], [t('create'), async () => {
        draw();
        if (!slides.length) {
            ta.focus();
            return false;
        }
        await done(slides);
    }, {icon: 'sparkles'}]], {width: '64rem'});
}

void esc;
void state;
void iconBtn;
void toast;
