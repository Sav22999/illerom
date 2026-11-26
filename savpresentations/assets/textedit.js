/** Writing inside an element, with a small toolbar over the selection. */
import {$$, clamp, h, promptBox, toast} from './core.js';
import {t} from './i18n.js';
import {FONTS, fontName, slideContext, styleOf} from './themes.js';
import {addDeckFont, fontDialog} from './fonts.js';
import {fragment, okLink, serialize} from './richtext.js';
import {fitText} from './grid.js';

const MARK = '#010203';
const PALETTE = ['#111111', '#6b7280', '#ffffff', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];

export function openText(ed, st, id, caret) {
    if (ed.editing?.id === id && ed.editing.sid === ed.sid) return; // already writing here
    ed.closeText(); // only one text at a time, only one toolbar
    document.querySelectorAll('.ftb').forEach((x) => x.remove());
    const deck = ed.deck, el = deck.el(ed.sid, id);
    if (!el || el.lock) return;
    const who = deck.people.find((p) => p.st?.ed === id && p.st?.s === ed.sid);
    if (who) {
        toast(t('someone_writing', {name: who.name || t('guest')}));
        return;
    }
    const node = st.node.querySelector(`.el[data-id="${CSS.escape(id)}"]`), rt = node?.querySelector('.rt');
    if (!rt) return;
    const sid = ed.sid, sc = slideContext(ed.ctx, deck.slide(sid).d);
    const style = (k, v) => (k === 'color' ? sc.color(v) : sc.family(v));
    const fill = (html) => {
        rt.textContent = '';
        rt.append(fragment(html, (k, v) => style(k, v)));
        rt.querySelectorAll('a').forEach((a) => a.removeAttribute('target'));
    };
    rt.classList.remove('ph');
    fill(el.html || '<p><br></p>');
    rt.querySelectorAll('p:empty').forEach((p) => p.append(document.createElement('br')));
    rt.contentEditable = 'true';
    rt.spellcheck = ed.user?.settings?.spell !== false;
    node.classList.add('writing');
    ed.editing = {id, sid, save, rt};
    deck.setState({ed: id, sel: [id]});
    st.overlayNow();
    rt.focus({preventScroll: true});
    const sel = getSelection();
    if (caret === 'all') sel.selectAllChildren(rt); else {
        sel.selectAllChildren(rt);
        sel.collapseToEnd();
    }
    try {
        document.execCommand('defaultParagraphSeparator', false, 'p');
        document.execCommand('styleWithCSS', false, false);
    } catch { /* not needed everywhere */
    }

    let timer;

    function save() {
        clearTimeout(timer);
        const now = deck.el(sid, id);
        if (!now) return;
        const html = serialize(rt), p = {};
        if (html !== (now.html || '')) p.html = html;
        // the box grows with the text
        const tx = rt.parentElement, need = Math.ceil(rt.scrollHeight + parseFloat(tx.style.padding || 0) * 2);
        if (ed.simple && now.cell != null) {
            const size = fitText(ed, id, rt);
            if ((size ?? null) !== (now.size ?? null)) {
                p.size = size;
                rt.style.fontSize = (size || styleOf({...now, size: undefined}, sc).size) + 'px';
            }
        } else if (now.t === 'text' && need > now.h + 1) {
            p.h = need;
            if (styleOf(now, sc).va === 'middle') p.y = Math.round(now.y - (need - now.h) / 2);
            if (styleOf(now, sc).va === 'bottom') p.y = Math.round(now.y - (need - now.h));
        }
        if (Object.keys(p).length) deck.do({k: 'el.set', s: sid, e: id, p}, 'text-' + id);
    }

    const onInput = () => {
        clearTimeout(timer);
        timer = setTimeout(save, 350);
    };
    const onPaste = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const html = e.clipboardData.getData('text/html'), txt = e.clipboardData.getData('text/plain');
        if (html && !e.shiftKey) {
            const d = document.createElement('div');
            d.append(fragment(html));
            d.querySelectorAll('span').forEach((s) => s.replaceWith(...s.childNodes));
            document.execCommand('insertHTML', false, d.innerHTML);
        } else document.execCommand('insertText', false, txt);
        onInput();
    };
    const onKey = (e) => {
        e.stopPropagation();
        const m = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape') {
            e.preventDefault();
            ed.closeText();
            ed.select([id]);
        } else if (m && e.key === 'k') {
            e.preventDefault();
            link();
        } else if (m && e.key === 'Enter') {
            e.preventDefault();
            ed.closeText();
        } else if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand(e.shiftKey ? 'outdent' : 'indent');
            onInput();
        }
        // "- " or "1. " at the beginning of a line starts a list
        else if (e.key === ' ') {
            const s = getSelection();
            const txt = s.anchorNode?.nodeType === 3 ? s.anchorNode.nodeValue.slice(0, s.anchorOffset) : '';
            if (/^(-|\*|1\.)$/.test(txt) && !s.anchorNode.parentElement.closest('li')) {
                e.preventDefault();
                s.anchorNode.nodeValue = s.anchorNode.nodeValue.slice(txt.length);
                document.execCommand(txt === '1.' ? 'insertOrderedList' : 'insertUnorderedList');
                onInput();
            }
        }
    };
    rt.addEventListener('input', onInput);
    rt.addEventListener('paste', onPaste);
    rt.addEventListener('keydown', onKey);

    // ------------------------------------------------------------------ toolbar
    const cmd = (c, v) => {
        rt.focus({preventScroll: true});
        document.execCommand('styleWithCSS', false, false);
        document.execCommand(c, false, v);
        onInput();
        state();
    };
    /** Wraps the selection in span[data-*]: the browser marks it, the marks become spans. */
    const wrap = (kind, value) => {
        rt.focus({preventScroll: true});
        document.execCommand('styleWithCSS', false, false);
        if (getSelection().isCollapsed) getSelection().selectAllChildren(rt);
        document.execCommand('foreColor', false, MARK);
        for (const f of $$('font[color]', rt)) {
            if (f.getAttribute('color').toLowerCase() !== MARK) continue;
            const s = document.createElement('span');
            s.append(...f.childNodes);
            // the same property set inside gives way to the new one
            $$(`span[data-${kind}]`, s).forEach((x) => {
                x.removeAttribute('data-' + kind);
                ({
                    c: () => (x.style.color = ''),
                    m: () => (x.style.backgroundColor = ''),
                    s: () => (x.style.fontSize = ''),
                    f: () => (x.style.fontFamily = '')
                })[kind]();
                if (![...x.attributes].some((a) => a.name.startsWith('data-'))) x.replaceWith(...x.childNodes);
            });
            if (value) {
                s.setAttribute('data-' + kind, value);
                if (kind === 'c') s.style.color = sc.color(value);
                if (kind === 'm') s.style.backgroundColor = sc.color(value);
                if (kind === 's') s.style.fontSize = value + 'em';
                if (kind === 'f') s.style.fontFamily = sc.family(value);
                f.replaceWith(s);
                const r = document.createRange();
                r.selectNodeContents(s);
                getSelection().removeAllRanges();
                getSelection().addRange(r);
            } else f.replaceWith(...s.childNodes);
        }
        onInput();
    };

    async function link() {
        const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0).cloneRange() : null,
            a = s.anchorNode?.parentElement?.closest('a');
        let url = await promptBox(t('link'), 'https://…', a?.getAttribute('href') || '', t('save'), 500);
        if (!ed.editing || ed.editing.id !== id) return;
        rt.focus({preventScroll: true});
        if (r) {
            s.removeAllRanges();
            s.addRange(r);
        }
        if (!url) return;
        if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
        if (okLink(url)) {
            cmd('createLink', url);
            rt.querySelectorAll('a').forEach((x) => x.removeAttribute('target'));
        } else toast(t('bad_link'), 'danger');
    }

    const b = (name, label, fn, c) => h('sav-button', {
        icon: name,
        label,
        title: label,
        size: 'sm',
        square: true,
        appearance: 'ghost',
        variant: 'neutral',
        'data-cmd': c,
        onclick: fn
    });
    const pop = h('div.ftpop', {hidden: true});
    const colors = (kind) => {
        const open = pop.dataset.k === kind && !pop.hidden;
        pop.hidden = open;
        pop.dataset.k = kind;
        pop.replaceChildren(...['@fg', '@muted', '@accent', '@accent2', '@onaccent', '@surface', ...PALETTE].map((c) => h('sav-button.sw', {
            circle: true,
            size: 'sm',
            label: c,
            style: `--c:${sc.color(c)}`,
            onclick: () => {
                wrap(kind, c);
                pop.hidden = true;
            }
        })), h('sav-button.sw', {
            circle: true,
            size: 'sm',
            icon: 'x',
            appearance: 'outline',
            variant: 'neutral',
            label: t('none'),
            onclick: () => {
                wrap(kind, '');
                pop.hidden = true;
            }
        }));
    };
    const sizes = () => {
        const open = pop.dataset.k === 's' && !pop.hidden;
        pop.hidden = open;
        pop.dataset.k = 's';
        pop.replaceChildren(...[.6, .75, 1, 1.25, 1.5, 2, 3].map((x) => h('sav-button', {
            size: 'sm',
            appearance: 'ghost',
            variant: 'neutral',
            onclick: () => {
                wrap('s', x === 1 ? '' : x);
                pop.hidden = true;
            }
        }, Math.round(x * 100) + '%')));
    };
    const fonts = () => {
        const open = pop.dataset.k === 'f' && !pop.hidden;
        pop.hidden = open;
        pop.dataset.k = 'f';
        const extra = (deck.meta.fonts || []).map((x) => x.id);
        const list = ['', ...extra, ...Object.keys(FONTS)].map((f) => h('sav-button', {
            size: 'sm',
            appearance: 'ghost',
            variant: 'neutral',
            style: f ? `font-family:${sc.family(f)}` : '',
            onclick: () => {
                wrap('f', f);
                pop.hidden = true;
            }
        }, f ? fontName(f) : t('theme_font')));
        // "More typefaces…" first, where it is seen without scrolling
        pop.replaceChildren(deck.canEdit ? h('sav-button', {
            size: 'sm', appearance: 'ghost', variant: 'neutral', icon: 'plus',
            onclick: () => {
                // the selection is kept while the dialog has the focus, and given back to the text afterwards
                const s = getSelection(), rg = s.rangeCount && rt.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
                pop.hidden = true;
                fontDialog({current: '', used: deck.meta.fonts || []}).then((f) => {
                    if (!f || ed.editing?.id !== id) return;
                    addDeckFont(deck, f);
                    rt.focus({preventScroll: true});
                    if (rg) { const x = getSelection(); x.removeAllRanges(); x.addRange(rg); }
                    wrap('f', f.id);
                });
            }
        }, t('more_fonts')) : '', ...list);
    };
    const bar = h('div.ftb', {onmousedown: (e) => e.preventDefault(), onpointerdown: (e) => e.stopPropagation()},
        b('type', t('typeface'), fonts), b('a-large-small', t('size'), sizes), h('i'), b('bold', t('bold'), () => cmd('bold'), 'bold'), b('italic', t('italic'), () => cmd('italic'), 'italic'), b('underline', t('underline'), () => cmd('underline'), 'underline'), b('strikethrough', t('strike'), () => cmd('strikeThrough'), 'strikeThrough'),
        h('i'), b('baseline', t('color'), () => colors('c')), b('highlighter', t('highlight'), () => colors('m')), b('link', t('link'), link), h('i'), b('list', t('bullets'), () => cmd('insertUnorderedList'), 'insertUnorderedList'), b('list-ordered', t('numbering'), () => cmd('insertOrderedList'), 'insertOrderedList'), b('remove-formatting', t('clear_format'), () => {
            cmd('removeFormat');
            wrap('c', '');
        }), pop);
    ed.root.append(bar);

    function place() {
        const r = node.getBoundingClientRect(), w = bar.offsetWidth, hh = bar.offsetHeight,
            host = st.scroller.getBoundingClientRect();
        const y = r.top - hh - 10 > host.top ? r.top - hh - 10 : Math.min(r.bottom + 10, innerHeight - hh - 8);
        bar.style.left = clamp(r.left + r.width / 2 - w / 2, 8, Math.max(8, innerWidth - w - 8)) + 'px';
        bar.style.top = Math.max(host.top + 4, y) + 'px';
    }

    const state = () => {
        for (const x of $$('[data-cmd]', bar)) {
            let on = false;
            try {
                on = document.queryCommandState(x.dataset.cmd);
            } catch { /* unknown */
            }
            x.classList.toggle('on', on);
            x.variant = on ? 'primary' : 'neutral';
            x.appearance = on ? 'soft' : 'ghost';
        }
    };
    document.addEventListener('selectionchange', state);
    st.scroller.addEventListener('scroll', place);
    addEventListener('resize', place);
    requestAnimationFrame(place);
    state();
    // a press anywhere else (top bar, pages, outside the window's panels) ends the writing
    const outside = (e) => {
        const path = e.composedPath();
        if (!path.some((x) => x === rt || x === bar || x === st.scroller || x.classList?.contains('epanel') || /^sav-(dialog|popover|dropdown|select)$/.test(x.localName || ''))) ed.closeText();
    };
    document.addEventListener('pointerdown', outside, true);

    ed.closeText = () => {
        ed.closeText = () => {
        };
        save();
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('selectionchange', state);
        st.scroller.removeEventListener('scroll', place);
        removeEventListener('resize', place);
        bar.remove();
        ed.editing = null;
        getSelection().removeAllRanges();
        deck.setState({ed: ''});
        const now = deck.el(sid, id);
        // an empty text just added by a double click leaves nothing behind
        if (now && now.t === 'text' && !now.html && !now.ph && !now.role?.match(/title|heading/)) deck.do({
            k: 'el.del',
            s: sid,
            e: id
        });
        else if (ed.sid === sid) st.drawEl(id);
        st.overlayNow();
        ed.refreshPanel();
    };
}
