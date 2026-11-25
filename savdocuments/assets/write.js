/** The writing screen. */
import { h, put, icon, btn, primary, tool, menu, closeMenu, place, dialog, confirm, ask, select, toggle, toast, fail, errText, face, copyText } from './ui.js';
import { svg } from './icons.js';
import { t, getLang, when } from './i18n.js';
import { S, api, local, remoteStore, localStore, shrink, keep } from './store.js';
import { Editor } from './editor.js';
import { Sync } from './sync.js';
import { SIZES, FONTS, LOOKS, fontStack } from './settings.js';
import { download, fileName, toSavdoc, toHtml, toText, imageIds } from './files.js';
import { cleanHref, esc } from './clean.js';
import { can, pickFile, importFile } from './actions.js';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const K = (s) => s.replace('Mod', MAC ? '⌘' : 'Ctrl').replace('Alt', MAC ? '⌥' : 'Alt').replace('Shift', MAC ? '⇧' : 'Shift').replace(/\+/g, MAC ? '' : '+');
const TYPES = [['p', 'pilcrow'], ['title', 'type'], ['subtitle', 'case-sensitive'], ['h1', 'heading-1'], ['h2', 'heading-2'], ['h3', 'heading-3'], ['h4', 'heading-4'], ['lead', 'text-cursor-input'], ['small', 'baseline'], ['blockquote', 'quote'], ['pre', 'square-code']];
const COLORS = ['', '#1c1c1c', '#5f6660', '#9aa29d', '#b3261e', '#d85a30', '#b7791f', '#0f6e56', '#0f5f8f', '#5b4cf0', '#a1328c'];
const MARKS = ['', '#fff3a3', '#ffd9b8', '#ffc9c9', '#d3f3d8', '#cdeaf7', '#e3dcfb', '#f9d5ec', '#e4e7e5'];
const num = (v, d) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };

export async function openWriter(root, pid, opt = {}) {
  const isLocal = pid.startsWith('local-');
  let data, ldoc = null, store;
  if (opt.version) data = opt.version;
  if (isLocal) {
    ldoc = await local.get(pid);
    if (!ldoc) throw Object.assign(new Error(), { code: 'doc_not_found' });
    store = localStore(ldoc);
    await store.warm();
    data = { doc: { id: pid, title: ldoc.title, role: 'owner', mine: true, rev: 0 }, content: ldoc.content, comments: [], stamp: '' };
  } else {
    data = await api('doc.get', undefined, { doc: pid, review: opt.review ? 1 : undefined });
    store = remoteStore(pid);
  }
  const W = { root, pid, isLocal, store, doc: data.doc, comments: data.comments, panel: null, zoom: 1 };
  const editable = !data.doc.review && !data.doc.deleted && can(data.doc.role, 'editor') && (isLocal || !!S.user);
  W.editable = editable;
  const prefs = () => S.user?.prefs || JSON.parse(localStorage.getItem('savdocuments-prefs') || '{}');

  // ------------------------------------------------------------------ layout

  const title = h('input.doctitle', { value: data.doc.title, maxlength: 160, 'aria-label': t('rename_doc'), readonly: !editable, spellcheck: 'false' });
  const status = h('span.status', { role: 'status' });
  const people = h('div.people');
  const desk = h('div.desk'), paper = h('div.paper');
  const side = h('aside.side', { hidden: true });
  const toolbar = h('div.toolbar', { role: 'toolbar', 'aria-label': t('styles') });
  const foot = h('footer.foot');
  const bubble = h('div.bubble', { hidden: true, role: 'toolbar', 'aria-label': t('styles') });
  const objbar = h('div.bubble.objbar', { hidden: true, role: 'toolbar' });
  const marks = h('div.presence');
  const shareBtn = !isLocal && data.doc.role === 'owner' ? primary(h('span.lbl', t('share')), { icon: 'share-2', size: 'sm', label: t('share'), onclick: () => shareDialog(W) }) : isLocal && S.user?.verified ? primary(h('span.lbl', t('save_account')), { icon: 'cloud-upload', size: 'sm', label: t('save_account'), onclick: () => toAccount() }) : null;
  const head = h('header.whead',
    h('a.logo', { href: '#/', title: t('home'), 'aria-label': t('home'), html: '<img src="icons/favicon.svg" width="34" height="34" alt="">' }),
    h('div.wtitle', title, h('div.wsub', status, isLocal ? h('span.local', icon('smartphone', 13), t('local_note')) : null)),
    people,
    h('div.wacts',
      tool('search', t('find'), () => openPanel('find'), { key: K('Mod+F'), cls: 'hide-s' }),
      tool('list-tree', t('outline'), () => openPanel('outline'), { cls: 'hide-s' }),
      isLocal ? null : tool('message-square', t('comments'), () => openPanel('comments'), { cls: 'has-count' }),
      tool('ellipsis-vertical', t('file'), (b) => fileMenu(b)), shareBtn));
  desk.append(paper);
  put(root, h('div.writer' + (editable ? '' : '.reading'), head, editable ? toolbar : h('div.robar', icon(data.doc.review ? 'shield' : 'eye', 16), data.doc.review ? t('a_review_bar') : data.doc.role === 'commenter' ? t('can_comment') : t('read_only'), !S.user ? h('a', { href: '#/signin' }, t('sign_in')) : null), h('div.wbody', desk, side), foot, bubble, objbar));
  document.title = data.doc.title + ' · SavDocuments';

  // ------------------------------------------------------------------ editor

  const ed = (W.ed = new Editor(paper, {
    editable, spellcheck: prefs().spellcheck !== false,
    labels: { hint: t('hint'), pageBreak: t('page_break'), caption: t('caption'), emptyToc: t('empty_toc'), text: t('doc_text') },
    imageUrl: (id) => store.imageUrl(id), zoom: () => W.zoom, autoformat: () => prefs().autoformat !== false,
    onChange: (ops) => changed(ops), onSelect: (st) => selection(st), onLayout: () => afterLayout(), onDress: () => dressFluid(), onSlash: (s) => slash(s), onBlock: (id) => { if (W.sync) W.sync.block = id; },
    onImageFiles: (f) => addFiles(f), onPasteImage: (src) => pasteImage(src), onNote: (fn) => editNote(fn), onKey: (e) => keys(e),
  }));
  ed.pager.flow.append(marks);
  W.canComment = !isLocal && !!S.user && !data.doc.review && !data.doc.deleted;
  const reload = () => { W.close(); openWriter(root, pid, opt).then((w) => { opt.onReload?.(w); }).catch(fail); };
  let saveT = null;
  function changed(ops) {
    if (W.sync) W.sync.push(ops);
    else if (isLocal) {
      setState('saving');
      clearTimeout(saveT);
      saveT = setTimeout(saveLocal, 500);
    }
    if (W.panel === 'outline') drawOutline();
    W.countsDirty = true;
  }
  async function saveLocal() {
    clearTimeout(saveT);
    saveT = null;
    ldoc.title = ed.title;
    ldoc.content = ed.snapshot();
    try { await local.put(ldoc); setState('saved'); } catch (e) { fail(e); }
  }
  function setState(s) { put(status, icon({ saved: 'cloud', saving: 'cloud-upload', offline: 'cloud-off' }[s], 13), t(s)); status.dataset.s = s; if (isLocal && s === 'saved') put(status, icon('check', 13), t('saved')); }
  function setPeople(list) {
    const seen = new Set();
    put(people, list.filter((p) => !seen.has(p.name) && seen.add(p.name)).slice(0, 5).map((p) => face(p.name, p.hue)));
    W.people = list;
    drawPresence();
  }
  function drawPresence() {
    put(marks, (W.people || []).map((p) => {
      const b = p.block && document.getElementById('b-' + p.block);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return h('div.pmark', { style: `top:${ed.pager.y(r)}px;height:${r.height / W.zoom}px;--h:${p.hue}`, title: t('writing_here', { name: p.name }) }, h('span', p.name));
    }));
  }

  title.addEventListener('change', () => { const v = title.value.trim() || t('untitled'); title.value = v; ed.change({ t: 'title', title: v }); document.title = v + ' · SavDocuments'; });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); ed.ed.focus(); } });

  // a click on the margins or under the text puts the caret where a person expects it
  if (editable) desk.addEventListener('mousedown', (e) => {
    if (ed.ed.contains(e.target) || e.button) return;
    e.preventDefault();
    ed.select(null);
    ed.ed.focus({ preventScroll: true });
    const last = ed.ed.lastElementChild, r = last.getBoundingClientRect(), box = ed.ed.getBoundingClientRect();
    if (e.clientY > r.bottom) {
      if (last.matches('table,figure,hr,.pb,.toc,.beside,.callout,pre')) { const p = document.createElement('p'); p.append(document.createElement('br')); ed.ed.append(p); ed.collapse(p); ed.scan(); } else ed.collapse(last, true);
      return;
    }
    const x = Math.max(box.left + 2, Math.min(box.right - 2, e.clientX)), c = document.caretPositionFromPoint?.(x, e.clientY), k = c ? [c.offsetNode, c.offset] : ((q) => q && [q.startContainer, q.startOffset])(document.caretRangeFromPoint?.(x, e.clientY));
    if (k && ed.ed.contains(k[0])) getSelection().collapse(...k);
  });

  // ------------------------------------------------------------------ zoom, status bar

  // on narrow screens the text fills the width, without pages; printing and files always have them
  W.fluid = desk.clientWidth < 640;
  const dressFluid = () => {
    ed.pager.fluid = W.fluid;
    paper.classList.toggle('fluid', W.fluid);
    if (W.fluid) for (const [k, v] of Object.entries({ pw: desk.clientWidth - 12 + 'px', ml: '20px', mr: '20px', mt: '24px', mb: '40px', hc: '80vh' })) paper.style.setProperty('--' + k, v);
  };
  const setFluid = (on) => { W.fluid = on; ed.dress(); firstZoom(); ed.later(); };
  function setZoom(z, keepMode) {
    if (!keepMode) W.fit = z === 'fit';
    if (W.fluid) { W.zoom = 1; paper.style.zoom = 1; dressFluid(); ed.later(); return; }
    const room = desk.clientWidth - (desk.clientWidth < 700 ? 12 : 64), full = parseFloat(paper.style.getPropertyValue('--pw'));
    W.zoom = z === 'fit' || W.fit ? Math.max(0.3, Math.min(desk.clientWidth < 700 ? 1.2 : 1.35, room / full)) : z;
    paper.style.zoom = W.zoom;
    ed.later();
  }
  const ro = new ResizeObserver(() => { if (W.fit || W.fluid) setZoom('fit', true); else ed.later(); });
  const firstZoom = () => { W.fit = desk.clientWidth < parseFloat(paper.style.getPropertyValue('--pw')) + 64; setZoom(W.fit ? 'fit' : 1, true); };
  ro.observe(desk);

  const pageInfo = h('button.fb', { type: 'button', onclick: () => menu(pageInfo, [{ label: t('v_pages'), icon: 'file-text', on: !W.fluid, run: () => setFluid(false) }, { label: t('v_fluid'), icon: 'smartphone', on: W.fluid, run: () => setFluid(true) }], { above: true }) }), countInfo = h('button.fb', { type: 'button', onclick: () => countsMenu() }), zoomInfo = h('button.fb', { type: 'button', onclick: () => zoomMenu() });
  put(foot, pageInfo, countInfo, h('span.grow'), editable ? h('button.fb.hide-s', { type: 'button', onclick: () => focusMode(), title: t('focus'), html: svg('maximize', 14) }) : null, zoomInfo);
  function afterLayout() {
    const y = (desk.scrollTop + desk.clientHeight / 3 - paper.offsetTop) / W.zoom;
    pageInfo.textContent = W.fluid ? t('no_pages') : `${t('page')} ${ed.pager.pageAt(Math.max(0, y))} ${t('of')} ${ed.pager.pages}`;
    if (W.countsDirty !== false) { W.countsDirty = false; W.counts = ed.counts(); countInfo.textContent = `${W.counts.words.toLocaleString(getLang())} ${W.counts.words === 1 ? t('word') : t('words')}`; }
    zoomInfo.textContent = W.fluid ? '' : Math.round(W.zoom * 100) + '%';
    drawPresence();
    drawComments();
    floatBars();
  }
  desk.addEventListener('scroll', () => { const y = (desk.scrollTop + desk.clientHeight / 3 - paper.offsetTop) / W.zoom; pageInfo.textContent = W.fluid ? t('no_pages') : `${t('page')} ${ed.pager.pageAt(Math.max(0, y))} ${t('of')} ${ed.pager.pages}`; floatBars(); }, { passive: true });
  const countsMenu = () => menu(countInfo, [{ head: `${W.counts.words.toLocaleString(getLang())} ${t('words')}` }, { head: `${W.counts.chars.toLocaleString(getLang())} ${t('characters')}` }, W.fluid ? null : { head: `${ed.pager.pages} ${t('pages')}` }, { head: `${Math.max(1, Math.round(W.counts.words / 220))} ${t('reading')}` }], { above: true });
  const zoomMenu = () => menu(zoomInfo, [{ label: t('fit'), on: W.fit, run: () => setZoom('fit') }, '-', ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((z) => ({ label: z * 100 + '%', on: !W.fit && W.zoom === z, run: () => setZoom(z) }))], { above: true, end: true });
  function focusMode() { const on = root.firstChild.classList.toggle('focusing'); ed.ed.classList.toggle('focus', on); if (on) toast('Esc', 'neutral', { duration: 1500 }); }

  // ------------------------------------------------------------------ toolbar

  const B = {};
  function buildToolbar() {
    if (!editable) return;
    B.type = h('button.tb.wide', { type: 'button', title: t('styles'), onclick: () => menu(B.type, [...TYPES.map(([k, ic]) => ({ label: t('s_' + k), icon: ic, on: W.st?.type === k, run: () => ed.block(k) })), '-', ...['info', 'tip', 'warn'].map((k) => ({ label: t('call_' + k), icon: { info: 'info', tip: 'lightbulb', warn: 'triangle-alert' }[k], run: () => ed.block('callout', k) }))]) });
    B.type.addEventListener('mousedown', (e) => e.preventDefault());
    B.bold = tool('bold', t('bold'), () => ed.inline('bold'), { key: K('Mod+B') });
    B.italic = tool('italic', t('italic'), () => ed.inline('italic'), { key: K('Mod+I') });
    B.underline = tool('underline', t('underline'), () => ed.inline('underline'), { key: K('Mod+U') });
    B.link = tool('link', t('link'), () => linkDialog(), { key: K('Mod+K') });
    B.color = tool('palette', t('color'), (b) => colorMenu(b));
    B.align = tool('text-align-start', t('align'), (b) => menu(b, [['left', 'text-align-start'], ['center', 'text-align-center'], ['right', 'text-align-end'], ['justify', 'text-align-justify']].map(([k, ic]) => ({ label: t(k), icon: ic, on: W.st?.align === k, run: () => ed.align(k) }))));
    B.ul = tool('list', t('s_ul'), () => ed.list('ul'), { key: K('Mod+Shift+8') });
    B.ol = tool('list-ordered', t('s_ol'), () => ed.list('ol'), { key: K('Mod+Shift+7') });
    B.check = tool('list-checks', t('s_check'), () => ed.list('check'), { key: K('Mod+Shift+9') });
    B.more = tool('type', t('more_format'), (b) => formatMenu(b), { caret: true });
    B.plus = tool('plus', t('insert'), (b) => menu(b, inserts().map((x) => ({ ...x, key: undefined })), {}), { cls: 'plus', text: t('insert') });
    B.undo = tool('undo-2', t('undo'), () => ed.undo(), { key: K('Mod+Z') });
    B.redo = tool('redo-2', t('redo'), () => ed.undo(true), { key: K('Mod+Shift+Z') });
    put(toolbar, B.undo, B.redo, h('i.sep'), B.plus, h('i.sep'), B.type, h('i.sep'), B.bold, B.italic, B.underline, B.color, B.link, B.more, h('i.sep'), B.ul, B.ol, B.check, B.align, h('i.sep'), tool('indent-decrease', t('outdent'), () => ed.indent(-1)), tool('indent-increase', t('indent'), () => ed.indent(1)));
    put(bubble, (W.bub = [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline'], ['strikethrough', 'strikeThrough', 'strike']].map(([ic, cmd, key]) => Object.assign(tool(ic, t(key || cmd), () => ed.inline(cmd)), { k: key || cmd }))), tool('highlighter', t('highlight'), (b) => colorMenu(b, true)), tool('link', t('link'), () => linkDialog()), W.canComment ? tool('message-square', t('c_add'), () => startComment()) : null);
  }
  function bubbleForReaders() { if (!editable && W.canComment) put(bubble, can(W.doc.role, 'commenter') ? tool('message-square', t('c_add'), () => startComment(), { text: t('c_send') }) : null, tool('sticky-note', t('notes'), () => startComment(true), { text: t('notes') })); }

  function formatMenu(b) {
    const st = W.st || {};
    const sizes = h('div.mrow', h('label', t('size')), h('input.num', { type: 'text', inputmode: 'decimal', value: st.size || '', 'aria-label': t('size') }), tool('minus', '−', () => step(-1)), tool('plus', '+', () => step(1)));
    const inp = sizes.querySelector('input');
    const apply = () => { const v = Math.max(5, Math.min(200, num(inp.value, st.size))); inp.value = v; back(() => ed.inline('size', v)); };
    const step = (d) => { inp.value = Math.max(5, num(inp.value, 11) + d); apply(); };
    const keepSel = ed.caret();
    const back = (fn) => { ed.ed.focus({ preventScroll: true }); if (keepSel) ed.setCaret(keepSel); fn(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); closeMenu(); } });
    inp.addEventListener('change', apply);
    menu(b, [
      { label: t('strike'), icon: 'strikethrough', on: st.strike, key: K('Mod+Shift+X'), run: () => ed.inline('strikeThrough') }, { label: t('sup'), icon: 'superscript', on: st.sup, run: () => ed.inline('superscript') }, { label: t('sub'), icon: 'subscript', on: st.sub, run: () => ed.inline('subscript') }, { label: t('code'), icon: 'code', on: st.code, key: K('Mod+E'), run: () => ed.inline('code') },
      { label: t('highlight'), icon: 'highlighter', keep: true, run: () => { closeMenu(); colorMenu(b, true); } }, { label: t('clear'), icon: 'remove-formatting', key: K('Mod+\\'), run: () => ed.inline('clear') }, '-', sizes,
      { label: t('font') + ': ' + (st.font || ''), icon: 'case-sensitive', keep: true, run: () => { closeMenu(); menu(b, [{ head: t('font') }, ...FONTS.map((f) => ({ label: f, style: `font-family:${fontStack(f)}`, on: st.font === f, run: () => ed.inline('fontName', f) }))], { cls: 'tall' }); } },
      { label: t('paragraph'), icon: 'separator-horizontal', run: () => paragraphDialog() },
    ]);
  }
  function colorMenu(b, mark) {
    const list = mark ? MARKS : COLORS, keepSel = ed.caret();
    const free = h('input', { type: 'color', value: '#0f6e56', 'aria-label': t('custom') });
    const run = (c) => { ed.ed.focus({ preventScroll: true }); if (keepSel) ed.setCaret(keepSel); if (mark) ed.inline('hiliteColor', c || 'transparent'); else ed.inline('foreColor', c || ed.settings.color); };
    free.addEventListener('change', () => { run(free.value); closeMenu(); });
    menu(b, [{ head: t(mark ? 'highlight' : 'color') }, h('div.swatches', list.map((c) => { const x = h('button.swatch' + (c ? '' : '.no'), { type: 'button', title: c || t('none'), 'aria-label': c || t('none'), style: c ? `background:${c}` : '' }); x.addEventListener('mousedown', (e) => e.preventDefault()); x.addEventListener('click', () => { closeMenu(); run(c); }); return x; }), h('label.swatch.free', { title: t('custom') }, free))]);
  }
  function paragraphDialog() {
    const b = ed.selected()[0], st = b?.style || {}, c = ed.caret();
    const f = (label, v, unit, step) => h('sav-number-input', { label, value: v, unit, step, min: 0, max: 200, placeholder: t('automatic') });
    const lh = f(t('line_height'), st.lineHeight || '', '', 0.05), mt = f(t('before'), parseFloat(st.marginTop) || '', 'pt', 1), mb = f(t('after'), st.marginBottom ? parseFloat(st.marginBottom) : '', 'pt', 1), ti = f(t('first_line'), parseFloat(st.textIndent) || '', 'pt', 1);
    dialog({ title: t('paragraph'), body: h('div.grid2', lh, mt, mb, ti), actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: () => { if (c) ed.setCaret(c); const g = (x, u, max) => (x.value === '' || x.value === null ? '' : Math.min(max, +x.value) + u); ed.paragraph({ 'line-height': g(lh, '', 5), 'margin-top': g(mt, 'pt', 200), 'margin-bottom': g(mb, 'pt', 200), 'text-indent': g(ti, 'pt', 100) }); } }] });
  }

  const inserts = () => [
    { id: 'image', label: t('i_image'), icon: 'image', run: () => imageDialog() }, { id: 'table', label: t('i_table'), icon: 'table', run: () => tableDialog() }, { id: 'ul', label: t('s_ul'), icon: 'list', run: () => ed.list('ul') }, { id: 'ol', label: t('s_ol'), icon: 'list-ordered', run: () => ed.list('ol') }, { id: 'check', label: t('s_check'), icon: 'list-checks', run: () => ed.list('check') },
    { id: 'callout', label: t('s_callout'), icon: 'info', run: () => ed.block('callout', 'info') }, { id: 'quote', label: t('s_blockquote'), icon: 'quote', run: () => ed.block('blockquote') }, { id: 'code', label: t('s_pre'), icon: 'square-code', run: () => ed.block('pre') },
    { id: 'hr', label: t('i_hr'), icon: 'minus', run: () => ed.insertHr() }, { id: 'pb', label: t('i_pb'), icon: 'separator-horizontal', key: K('Mod+') + '↵', run: () => ed.insertBreak() }, { id: 'toc', label: t('i_toc'), icon: 'list-tree', run: () => ed.insertToc() }, { id: 'note', label: t('i_note'), icon: 'footprints', run: () => editNote() }, { id: 'link', label: t('i_link'), icon: 'link', run: () => linkDialog() },
    { id: 'date', label: t('i_date'), icon: 'clock', run: () => ed.do(() => document.execCommand('insertText', false, new Date().toLocaleDateString(ed.settings.lang, { day: 'numeric', month: 'long', year: 'numeric' }))) },
  ];

  // "/" menu
  let slashMenu = null, slashAt = null, slashI = 0;
  function slash(s) {
    slashAt = s;
    if (!s) { slashMenu?.remove(); slashMenu = null; return; }
    const all = [...TYPES.filter(([k]) => /^h[1-3]$|title$/.test(k)).map(([k, ic]) => ({ label: t('s_' + k), icon: ic, run: () => ed.block(k) })), ...inserts()];
    const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = all.filter((x) => norm(x.label).includes(norm(s.q.trim()))).slice(0, 9);
    if (!list.length) { slashMenu?.remove(); slashMenu = null; return; }
    if (!slashMenu) { slashMenu = h('div.menu.slash', { role: 'listbox', popover: 'manual' }); document.body.append(slashMenu); slashMenu.showPopover?.(); slashI = 0; }
    slashI = Math.min(slashI, list.length - 1);
    slashMenu.items = list;
    put(slashMenu, list.map((x, i) => { const b = h('button.mi' + (i === slashI ? '.hot' : ''), { type: 'button', role: 'option' }, icon(x.icon, 17), h('span.ml', x.label)); b.addEventListener('mousedown', (e) => { e.preventDefault(); pickSlash(i); }); return b; }));
    place(slashMenu, s.range);
  }
  function pickSlash(i) {
    const x = slashMenu.items[i], s = slashAt;
    slash(null);
    ed._before = ed.caret();
    s.range.deleteContents();
    const n = s.range.startContainer, b = ed.topOf(n);
    if (b && !b.textContent && !b.querySelector('br,img')) b.append(document.createElement('br'));
    if (b && !b.textContent) ed.collapse(n.nodeType === 1 ? n : n.parentNode);
    ed.scan();
    x.run();
  }

  // ------------------------------------------------------------------ keyboard

  function keys(e) {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (slashMenu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { slashI = (slashI + (e.key === 'ArrowDown' ? 1 : -1) + slashMenu.items.length) % slashMenu.items.length; slash(slashAt); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') { pickSlash(slashI); return true; }
      if (e.key === 'Escape') { slash(null); return true; }
    }
    if (mod && k === 'k') { linkDialog(); return true; }
    if (mod && e.shiftKey && k === 'v') { ed._plain = true; return false; }
    if (mod && e.altKey && e.code === 'KeyM' && W.canComment) { startComment(); return true; }
    return false;
  }
  const globalKeys = (e) => {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'f') { e.preventDefault(); openPanel('find'); } else if (mod && k === 'p') { e.preventDefault(); printDoc(); } else if (mod && k === 's') { e.preventDefault(); if (isLocal) saveLocal(); else W.sync?.flush(); } else if (e.key === 'Escape' && root.firstChild?.classList.contains('focusing')) focusMode();
  };
  addEventListener('keydown', globalKeys);

  // ------------------------------------------------------------------ selection: what is on, floating bars

  const NAMES = { ul: 's_ul', ol: 's_ol', check: 's_check', callout: 's_callout', table: 'i_table', figure: 'i_image', hr: 'i_hr', div: 's_p' };
  function selection(st) {
    W.st = st;
    if (editable) {
      for (const k of ['bold', 'italic', 'underline']) B[k].classList.toggle('on', !!st[k]);
      for (const k of ['ul', 'ol', 'check']) B[k].classList.toggle('on', k === st.type);
      B.link.classList.toggle('on', !!st.link);
      const label = t(NAMES[st.type] || 's_' + (st.type || 'p'));
      B.type.innerHTML = `<span>${esc(label)}</span>${svg('chevron-down', 13)}`;
      B.align.innerHTML = svg({ center: 'text-align-center', right: 'text-align-end', justify: 'text-align-justify' }[st.align] || 'text-align-start');
      B.undo.disabled = !st.canUndo;
      B.redo.disabled = !st.canRedo;
      W.bub?.forEach((b) => b.classList.toggle('on', !!st[b.k]));
      objectBar(st);
    }
    floatBars();
  }
  function floatBars() {
    const st = W.st || {}, r = ed.range(), touch = matchMedia('(pointer: coarse)').matches;
    const show = r && !r.collapsed && !st.sel && bubble.childElementCount && prefs().bubble !== false && !(touch && editable) && !ed.ed.querySelector('.csel') && r.toString().trim() && !document.querySelector('sav-dialog[open]');
    bubble.hidden = !show;
    if (show) over(bubble, r.getBoundingClientRect());
    const target = st.sel || (st.cell && st.cell.isConnected ? st.cell.closest('table') : null);
    const on = editable && objbar.childElementCount && target?.isConnected && (bubble.hidden || !!st.sel);
    objbar.hidden = !on;
    if (on) over(objbar, target.getBoundingClientRect(), true);
  }
  function over(bar, r, edge) {
    const box = desk.getBoundingClientRect(), w = bar.offsetWidth, hh = bar.offsetHeight;
    let y = r.top - hh - 8;
    if (y < box.top + 4) y = edge ? Math.min(Math.max(box.top + 4, r.top - hh - 8), box.bottom) : r.bottom + 8;
    if (r.bottom < box.top || r.top > box.bottom) { bar.hidden = true; return; }
    bar.style.top = Math.min(y, innerHeight - hh - 60) + 'px';
    bar.style.left = Math.max(box.left + 4, Math.min(box.right - w - 4, r.left + r.width / 2 - w / 2)) + 'px';
  }
  function objectBar(st) {
    const key = st.sel ? 's' + (st.sel.id || 'b') + st.sel.className + (st.sel.dataset.a || '') + (st.sel.parentNode.dataset?.k || '') + st.sel.dataset.w : st.cell ? 't' + ed.cells().length + (st.cell.closest('table').className) + st.cell.colSpan + st.cell.rowSpan : '';
    if (key === W.objKey) return;
    W.objKey = key;
    if (!key) { put(objbar); return; }
    if (!st.sel) {
      const many = ed.cells().length > 1, joined = ed.cells().some((c) => c.colSpan > 1 || c.rowSpan > 1);
      put(objbar, tool('rows-3', t('t_rows'), (b) => menu(b, [['rowAbove', 'arrow-up'], ['rowBelow', 'arrow-down']].map(([k, ic]) => ({ label: t('t_' + k), icon: ic, run: () => ed.table(k) })).concat([{ label: t('t_header'), icon: 'panel-left', run: () => ed.table('header') }, '-', { label: t('t_delRow'), icon: 'trash-2', danger: true, run: () => ed.table('delRow') }])), { caret: true }),
        tool('columns-3', t('t_cols'), (b) => menu(b, [['colLeft', 'arrow-left'], ['colRight', 'arrow-right'], ['even', 'ruler']].map(([k, ic]) => ({ label: t('t_' + k), icon: ic, run: () => ed.table(k) })).concat(['-', { label: t('t_delCol'), icon: 'trash-2', danger: true, run: () => ed.table('delCol') }])), { caret: true }),
        many ? tool('merge', t('t_merge'), () => ed.table('merge')) : null, joined ? tool('split', t('t_split'), () => ed.table('split')) : null,
        tool('paintbrush', t('t_fill'), (b) => menu(b, [{ head: t('t_fill') }, h('div.swatches', ['', '#eef1ee', '#fff3a3', '#ffd9b8', '#ffc9c9', '#d3f3d8', '#cdeaf7', '#e3dcfb', '#f9d5ec'].map((c) => { const x = h('button.swatch' + (c ? '' : '.no'), { type: 'button', 'aria-label': c || t('none'), style: c ? `background:${c}` : '' }); x.addEventListener('mousedown', (e) => e.preventDefault()); x.addEventListener('click', () => { closeMenu(); ed.table('fill', c); }); return x; }))])),
        tool('table', t('t_style'), (b) => menu(b, [['', 't_grid'], ['plain', 't_plain'], ['striped', 't_striped']].map(([k, l]) => ({ label: t(l), on: (W.st.cell?.closest('table').className.match(/plain|striped/) || [''])[0] === k, run: () => ed.table('style', k) }))), { caret: true }),
        tool('trash-2', t('t_drop'), () => ed.table('drop')));
      return;
    }
    const f = st.sel;
    if (!f.matches('figure')) { put(objbar, tool('trash-2', t('delete'), () => ed.removeSelected())); return; }
    const box = f.closest('.beside'), set = (fn) => ed.do(() => { fn(); ed.quiet(() => ed.decorate()); ed.dirty.add(ed.topOf(f)); W.objKey = null; });
    put(objbar,
      box ? null : [['l', 'left', 'align-left'], ['c', 'center', 'align-center'], ['r', 'right', 'align-right']].map(([k, l]) => { const b = tool({ l: 'text-align-start', c: 'text-align-center', r: 'text-align-end' }[k], t(l), () => set(() => { f.dataset.a = k; })); b.classList.toggle('on', (f.dataset.a || 'c') === k); return b; }),
      tool('wrap-text', t('i_image'), (b) => menu(b, [{ label: t('img_beside_l'), on: box?.dataset.k === 'l', run: () => ed.besideFigure(f, 'l') }, { label: t('img_beside_r'), on: box?.dataset.k === 'r', run: () => ed.besideFigure(f, 'r') }, { label: t('img_alone'), on: !box, run: () => ed.besideFigure(f, null) }]), { caret: true }),
      h('i.sep'), (box ? [30, 40, 50] : [25, 50, 75, 100]).map((w) => { const b = h('button.tb.txt', { type: 'button' }, w + '%'); b.addEventListener('mousedown', (e) => e.preventDefault()); b.addEventListener('click', () => set(() => { f.dataset.w = w; })); b.classList.toggle('on', +f.dataset.w === w); return b; }),
      h('i.sep'), tool('text-cursor-input', t('img_alt'), async () => { const img = f.querySelector('img'), v = await ask(t('img_alt'), t('img_alt'), img.alt); if (v !== null) { img.alt = v; ed.dirty.add(ed.topOf(f)); ed.scan(); } }),
      tool('replace', t('img_replace'), async () => { const [file] = await pickFile('image/*'); if (!file) return; try { const id = await store.addImage(await shrink(file)); set(() => { f.querySelector('img').dataset.i = id; }); } catch (e) { fail(e); } }),
      tool('trash-2', t('delete'), () => ed.removeSelected()));
  }

  // ------------------------------------------------------------------ dialogs of what is inserted

  function linkDialog() {
    const st = ed.state(), c = ed.caret();
    const url = h('sav-input', { label: t('link_url'), value: st.link?.getAttribute('href') || '', placeholder: 'https://', autofocus: true });
    const lab = st.collapsed && !st.link ? h('sav-input', { label: t('link_label') }) : null;
    const heads = ed.headings();
    const head = heads.length ? select(t('link_heading'), [['', t('none')], ...heads.map((x) => ['#' + x.id, x.text.slice(0, 60)])], (st.link?.getAttribute('href') || '').startsWith('#') ? st.link.getAttribute('href') : '', (v) => { if (v) url.value = v; }) : null;
    dialog({ title: t('link'), body: h('div.form', url, lab, head), actions: [st.link ? { label: t('unlink'), run: () => { if (c) ed.setCaret(c); ed.link(''); } } : { label: t('cancel') }, { label: t('apply'), primary: true, run: () => {
      let v = url.value.trim();
      if (/^[^\s@]+@[^\s@]+\.\w+$/.test(v)) v = 'mailto:' + v;
      else if (/^\+?[\d ()-]{6,}$/.test(v)) v = 'tel:' + v.replace(/[^\d+]/g, '');
      else if (v && !/^(https?:|mailto:|tel:|#)/i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v)) v = 'https://' + v;
      v = cleanHref(v);
      if (!v) { toast(t('link_bad'), 'warning'); return false; }
      ed.ed.focus({ preventScroll: true });
      if (c) ed.setCaret(c);
      ed.link(v, lab?.value.trim() || (v.startsWith('#') ? heads.find((x) => '#' + x.id === v)?.text : ''));
    } }] });
  }
  function editNote(fn) {
    const c = ed.caret();
    const ta = h('sav-textarea', { label: t('note_text'), value: fn?.dataset.n || '', rows: 4, maxlength: 2000, autofocus: true });
    dialog({ title: t('i_note'), body: ta, actions: [fn ? { label: t('delete'), run: () => ed.do(() => fn.remove()) } : { label: t('cancel') }, { label: t('save'), primary: true, run: () => { const v = ta.value.trim(); if (!v) return false; if (fn) ed.do(() => { fn.dataset.n = v; }); else { ed.ed.focus({ preventScroll: true }); if (c) ed.setCaret(c); ed.do(() => ed.fixFn(v)); } } }] });
  }
  function tableDialog() {
    const c = ed.caret(), grid = h('div.tgrid'), info = h('p.muted', '3 × 3');
    let pick = [3, 3];
    const paint = () => { [...grid.children].forEach((x, i) => x.classList.toggle('on', i % 10 < pick[1] && Math.floor(i / 10) < pick[0])); info.textContent = `${pick[0]} × ${pick[1]}`; };
    const rows = h('sav-number-input', { label: t('t_rows'), value: 3, min: 1, max: 100 }), cols = h('sav-number-input', { label: t('t_cols'), value: 3, min: 1, max: 20 });
    const sync = () => { rows.value = pick[0]; cols.value = pick[1]; };
    for (let i = 0; i < 80; i++) { const x = h('button.tcell', { type: 'button', 'aria-label': `${Math.floor(i / 10) + 1} × ${(i % 10) + 1}` }); x.addEventListener('pointerenter', () => { pick = [Math.floor(i / 10) + 1, (i % 10) + 1]; paint(); sync(); }); x.addEventListener('click', () => { pick = [Math.floor(i / 10) + 1, (i % 10) + 1]; sync(); d.primary.click(); }); grid.append(x); }
    for (const x of [rows, cols]) x.addEventListener('input', () => { pick = [+rows.value || 1, +cols.value || 1]; paint(); });
    paint();
    const d = dialog({ title: t('i_table'), width: '24rem', body: [grid, info, h('div.grid2', rows, cols)], actions: [{ label: t('cancel') }, { label: t('insert'), primary: true, run: () => { ed.ed.focus({ preventScroll: true }); if (c) ed.setCaret(c); ed.insertTable(Math.max(1, Math.min(100, pick[0])), Math.max(1, Math.min(20, pick[1]))); } }] });
  }
  async function addFiles(files, c) {
    const note = toast(t('img_adding'), 'neutral', { duration: 0 });
    try {
      for (const f of files) {
        const id = await store.addImage(await shrink(f));
        ed.ed.focus({ preventScroll: true });
        if (c) ed.setCaret(c);
        ed.insertImage(id, '');
        c = null;
      }
    } catch (e) { fail(e); } finally { note.remove(); }
  }
  async function pasteImage(src) {
    try {
      let blob;
      if (src.startsWith('own:')) { const r = store.remote ? await store.imageBlob(src.slice(4)) : await local.image(src.slice(4)); blob = r || null; } else if (/^data:image\//.test(src) || src.startsWith(location.origin) || src.startsWith('blob:')) blob = await (await fetch(src)).blob();
      return blob ? await store.addImage(await shrink(blob)) : '';
    } catch { return ''; }
  }
  function imageDialog() {
    const c = ed.caret();
    const input = h('div.dropbox', { tabindex: '0', role: 'button' }, icon('image-plus', 34), h('span', t('img_drop')));
    const take = (files) => { const list = [...files].filter((f) => f.type.startsWith('image/')); if (list.length) { d.hide(); addFiles(list, c); } };
    input.addEventListener('click', async () => take(await pickFile('image/*', true)));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
    for (const ev of ['dragover', 'dragleave', 'drop']) input.addEventListener(ev, (e) => { e.preventDefault(); input.classList.toggle('over', ev === 'dragover'); if (ev === 'drop') take(e.dataTransfer.files); });
    const q = h('sav-input', { placeholder: t('img_q'), type: 'search' }), res = h('div.imgs'), credit = h('sav-checkbox', { checked: true }, t('img_credit')), more = h('div.center');
    let page = 1, busy = false;
    const find = async (next) => {
      if (busy || q.value.trim().length < 2) return;
      busy = true;
      page = next ? page + 1 : 1;
      if (!next) put(res, h('p.muted', t('loading')));
      try {
        const r = await api('img.search', undefined, { q: q.value.trim(), page });
        if (!next) put(res, r.images.length ? null : h('p.muted', t('no_match')));
        for (const x of r.images) {
          const b = h('button.pick', { type: 'button', title: `${x.title} — ${x.author} (${x.license})` }, h('img', { src: x.thumb, loading: 'lazy', alt: x.title, referrerpolicy: 'no-referrer' }), h('small', x.license));
          b.querySelector('img').addEventListener('error', () => b.remove());
          b.addEventListener('click', async () => {
            if (b.classList.contains('busy')) return;
            b.classList.add('busy');
            try {
              const id = await store.importImage(x.src);
              d.hide();
              ed.ed.focus({ preventScroll: true });
              if (c) ed.setCaret(c);
              ed.insertImage(id, x.title, credit.checked ? `${x.title}${x.author ? ', ' + x.author : ''} (${x.license}, ${x.from})` : '');
            } catch (e) { b.classList.remove('busy'); fail(e); }
          });
          res.append(b);
        }
        put(more, r.images.length ? btn(t('load_more'), { size: 'sm', onclick: () => find(true) }) : null);
      } catch (e) { put(res, h('p.muted', errText(e))); } finally { busy = false; }
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); find(); } });
    const tabs = h('sav-tabs', {}, h('sav-tab', { label: t('img_upload'), name: 'up' }, input), h('sav-tab', { label: t('img_search'), name: 'find' }, store.remote ? h('div.form', h('div.row', h('div.grow', q), btn(t('search'), { icon: 'search', onclick: () => find() })), res, more, credit, h('p.muted.small', t('img_from'))) : h('p.muted', t('img_account'))));
    const d = dialog({ title: t('i_image'), width: '44rem', body: [tabs, h('p.muted.small', t('img_note'))] });
  }

  // ------------------------------------------------------------------ file menu, downloads, print

  async function bundle() {
    ed.scan();
    const snap = ed.snapshot(), images = {};
    for (const id of imageIds(snap.blocks)) { const b = await store.imageBlob(id).catch(() => null); if (b) images[id] = b; }
    return { title: ed.title, settings: snap.settings, blocks: snap.blocks, images };
  }
  async function save(kind) {
    const b = await bundle();
    if (kind === 'savdoc') download(await toSavdoc(b), fileName(b.title, 'savdoc'));
    else if (kind === 'docx') download(await (await import('./docx.js')).toDocx(b), fileName(b.title, 'docx'));
    else if (kind === 'html') download(await toHtml(b), fileName(b.title, 'html'));
    else download(toText(b), fileName(b.title, 'txt'));
  }
  async function printDoc(pdf) {
    ed.scan();
    if (W.sync?.editor && pdf) toast(t('pdf_hint'), 'neutral');
    const z = W.zoom, fluid = W.fluid;
    W.fluid = false;
    ed.dress();
    paper.style.zoom = 1;
    W.zoom = 1;
    ed.layout();
    await Promise.all([...ed.ed.querySelectorAll('img')].map((i) => i.decode?.().catch(() => {})));
    ed.layout();
    const pages = ed.pager.printable(ed.settings, ed.title);
    const [w, hh] = [pages.style.getPropertyValue('--pw'), pages.style.getPropertyValue('--ph')];
    W.fluid = fluid;
    ed.dress();
    paper.style.zoom = z;
    W.zoom = z;
    ed.layout();
    const st = h('style');
    st.textContent = `@page { size: ${parseFloat(w) / 96}in ${parseFloat(hh) / 96}in; margin: 0; }`;
    document.head.append(st);
    document.body.append(pages);
    document.body.classList.add('printing');
    const end = () => { pages.remove(); st.remove(); document.body.classList.remove('printing'); removeEventListener('afterprint', end); };
    addEventListener('afterprint', end);
    await Promise.all([...pages.querySelectorAll('img')].map((i) => i.decode?.().catch(() => {})));
    W.printing = pages;
    if (!W.noPrint) window.print();
  }
  W.printDoc = printDoc;
  W.bundle = bundle;
  async function toAccount() {
    const b = await bundle();
    const id = await keep(b);
    await local.remove(pid);
    toast(t('saved_account'), 'success');
    W.close();
    location.hash = '#/d/' + id;
  }
  function fileMenu(b) {
    const owner = data.doc.role === 'owner';
    menu(b, [
      { label: t('doc_options'), icon: 'settings', disabled: !editable, run: () => optionsDialog() },
      { label: t('find'), icon: 'search', key: K('Mod+F'), run: () => openPanel('find') }, { label: t('outline'), icon: 'list-tree', run: () => openPanel('outline') },
      editable && !isLocal ? { label: t('history'), icon: 'history', run: () => openPanel('history') } : null, editable ? { label: t('focus'), icon: 'maximize', run: () => focusMode() } : null, '-',
      { label: t('dl_docx'), icon: 'file-text', run: () => save('docx') }, { label: t('dl_savdoc'), icon: 'file-down', run: () => save('savdoc') }, { label: t('dl_pdf'), icon: 'file-down', run: () => printDoc(true) }, { label: t('dl_html'), icon: 'globe', run: () => save('html') }, { label: t('dl_txt'), icon: 'file', run: () => save('txt') }, { label: t('print'), icon: 'printer', key: K('Mod+P'), run: () => printDoc() }, '-',
      { label: t('open_'), icon: 'upload', run: () => importFile() }, !isLocal && S.user && !data.doc.review ? { label: t('duplicate'), icon: 'copy', run: async () => { await W.sync?.flush(); const r = await api('doc.duplicate', { doc: pid, title: `${t('copy_of')} ${ed.title}` }); location.hash = '#/d/' + r.doc.id; } } : null,
      { label: t('shortcuts'), icon: 'keyboard', run: () => shortcuts() }, !isLocal && !owner && !data.doc.review ? { label: t('report'), icon: 'flag', run: () => reportDialog(pid) } : null,
      owner && !isLocal && !data.doc.deleted ? '-' : null, owner && !isLocal && !data.doc.deleted ? { label: t('to_trash'), icon: 'trash-2', danger: true, run: async () => { await W.sync?.flush(); await api('doc.trash', { doc: pid }); toast(t('moved_trash')); location.hash = '#/'; } } : null,
    ], { end: true });
  }
  function shortcuts() {
    const L = [[t('bold'), 'Mod+B'], [t('italic'), 'Mod+I'], [t('underline'), 'Mod+U'], [t('strike'), 'Mod+Shift+X'], [t('code'), 'Mod+E'], [t('link'), 'Mod+K'], [t('clear'), 'Mod+\\'], [t('s_h1') + '…4', 'Mod+Alt+1…4'], [t('s_p'), 'Mod+Alt+0'], [t('s_ol'), 'Mod+Shift+7'], [t('s_ul'), 'Mod+Shift+8'], [t('s_check'), 'Mod+Shift+9'], [t('left') + ' / ' + t('center') + ' / ' + t('right') + ' / ' + t('justify'), 'Mod+Shift+L E R J'], [t('indent'), 'Mod+]'], [t('page_break'), 'Mod+Enter'], [t('c_add'), 'Mod+Alt+M'], [t('find'), 'Mod+F'], [t('insert'), '/'], [t('undo'), 'Mod+Z'], [t('redo'), 'Mod+Shift+Z'], [t('print'), 'Mod+P']];
    dialog({ title: t('shortcuts'), body: h('div.keys', L.map(([l, k]) => [h('span', l), h('kbd', K(k))])) });
  }

  // ------------------------------------------------------------------ document options

  function optionsDialog() {
    ed.scan();
    const s = structuredClone(ed.settings), before = structuredClone(ed.settings);
    optionsForm(s, {
      onchange: () => { ed.settings = structuredClone(s); ed.dress(s); ed.quiet(() => ed.decorate()); if (W.fit) setZoom('fit', true); ed.later(); },
      cancel: () => { ed.settings = before; ed.dress(before); ed.quiet(() => ed.decorate()); if (W.fit) setZoom('fit', true); ed.later(); },
      done: () => { ed.settings = before; if (JSON.stringify(s) !== JSON.stringify(before)) ed.change({ t: 'settings', s }); if (s.size !== before.size || s.landscape !== before.landscape) firstZoom(); else if (W.fit) setZoom('fit', true); },
    });
  }

  // ------------------------------------------------------------------ side panels

  function openPanel(name) {
    if (W.panel === name) return closePanel();
    W.panel = name;
    side.hidden = false;
    const body = h('div.pbody');
    put(side, h('div.phead', h('h2', t(name)), h('button.tb', { type: 'button', 'aria-label': t('close'), html: svg('x'), onclick: () => closePanel() })), body);
    W.pbody = body;
    ({ outline: drawOutline, find: drawFind, comments: drawPanelComments, history: drawHistory })[name]();
    root.firstChild.classList.add('with-side');
  }
  function closePanel() { W.panel = null; side.hidden = true; root.firstChild.classList.remove('with-side'); CSS.highlights?.delete('sd-find'); CSS.highlights?.delete('sd-find-now'); ed.later(); }
  W.closePanel = closePanel;

  function drawOutline() {
    const list = ed.headings();
    put(W.pbody, list.length ? h('nav.outline', list.map((x) => h('button.ol' + x.level, { type: 'button', onclick: () => document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, x.text))) : h('p.muted', t('empty_toc')));
  }

  function drawFind() {
    const q = h('sav-input', { label: t('f_find'), autofocus: true, value: getSelection().toString().slice(0, 80).replace(/\n.*/s, '') }), w = h('sav-input', { label: t('f_with') }), cs = h('sav-checkbox', {}, t('f_case')), info = h('span.muted');
    let found = [], i = 0;
    const show = () => {
      CSS.highlights?.delete('sd-find');
      CSS.highlights?.delete('sd-find-now');
      info.textContent = q.value ? (found.length ? t('f_count', { n: i + 1, m: found.length }) : t('no_match')) : '';
      if (!found.length) return;
      if (CSS.highlights) { CSS.highlights.set('sd-find', new Highlight(...found)); CSS.highlights.set('sd-find-now', new Highlight(found[i])); }
      const r = found[i].getBoundingClientRect(), b = desk.getBoundingClientRect();
      if (r.top < b.top + 60 || r.bottom > b.bottom - 60) desk.scrollBy({ top: r.top - b.top - b.height / 3 });
    };
    const run = () => { ed.scan(); found = ed.find(q.value, { matchCase: cs.checked }); i = Math.min(i, Math.max(0, found.length - 1)); show(); };
    const go = (d) => { run(); if (found.length) { i = (i + d + found.length) % found.length; show(); } };
    q.addEventListener('input', () => { i = 0; run(); });
    cs.addEventListener('change', run);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') closePanel(); });
    put(W.pbody, h('div.form', q, h('div.row', info, h('span.grow'), tool('chevron-left', t('back'), () => go(-1)), tool('chevron-right', t('open'), () => go(1))), cs, editable ? [w, h('div.row', btn(t('f_one'), { size: 'sm', onclick: () => { if (found[i]) { ed.replace([found[i]], w.value); run(); } } }), btn(t('f_all'), { size: 'sm', onclick: () => { run(); const n = found.length; ed.replace(found, w.value); run(); if (n) toast(`${n}`, 'success'); } }))] : null));
    setTimeout(() => { q.focus?.(); run(); }, 50);
  }

  async function drawHistory() {
    put(W.pbody, h('p.muted', t('loading')));
    try {
      await W.sync?.flush();
      const { versions } = await api('version.list', undefined, { doc: pid });
      put(W.pbody, btn(t('h_save'), { icon: 'history', size: 'sm', onclick: async () => { const n = await ask(t('h_save'), t('h_name')); if (n) { await W.sync.flush(); await api('version.save', { doc: pid, name: n }); drawHistory(); } } }),
        versions.length ? h('div.versions', versions.map((v) => h('button.version', { type: 'button', onclick: () => preview(v) }, h('strong', v.name || new Date(v.at).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' })), h('span.muted', `${v.name ? when(v.at) : t('h_auto')} · ${v.words} ${t('words')}${v.by ? ' · ' + v.by : ''}`)))) : h('div.empty', h('strong', t('h_none')), h('p.muted', t('h_none_t'))));
    } catch (e) { put(W.pbody, h('p.muted', errText(e))); }
  }
  async function preview(v) {
    const { content } = await api('version.get', undefined, { doc: pid, id: v.id });
    const box = h('div.vpreview'), pp = h('div.paper');
    box.append(pp);
    dialog({ title: v.name || when(v.at), width: '56rem', body: box, actions: [{ label: t('close') }, { label: t('h_restore'), primary: true, run: async () => { if (!(await confirm(t('h_restore'), t('h_restore_t'), t('restore'), false))) return false; await W.sync.flush(); await api('version.restore', { doc: pid, id: v.id }); toast(t('h_restored'), 'success'); reload(); } }], onclose: () => e2.destroy() });
    const e2 = new Editor(pp, { editable: false, labels: { emptyToc: '' }, imageUrl: (id) => store.imageUrl(id), zoom: () => parseFloat(pp.style.zoom) || 1, onChange() {} });
    setTimeout(() => { e2.load(content, v.title); pp.style.zoom = Math.min(1, (box.clientWidth - 30) / parseFloat(pp.style.getPropertyValue('--pw'))); e2.later(); }, 60);
  }

  // ------------------------------------------------------------------ comments and personal notes

  let tab = can(data.doc.role, 'commenter') ? 'comments' : 'notes', showDone = false;
  async function refreshComments() { try { const r = await api('comment.list', undefined, { doc: pid }); setComments(r); } catch { /* next time */ } }
  function setComments(r) { W.comments = r.comments; if (W.sync) W.sync.stamp = r.stamp; drawComments(); if (W.panel === 'comments') drawPanelComments(); }
  function drawComments() {
    const n = W.comments.filter((c) => !c.parent && !c.resolved && !c.private).length, b = head.querySelector('.has-count');
    if (b) { if (n) b.dataset.n = n; else b.removeAttribute('data-n'); }
    if (!CSS.highlights) return;
    const find = (c) => { const el = c.quote && document.getElementById('b-' + c.block); return el ? ed.find(c.quote, { matchCase: true, block: el }).slice(0, 1) : []; };
    const open = W.comments.filter((c) => !c.parent && !c.resolved);
    CSS.highlights.set('sd-comment', new Highlight(...open.filter((c) => !c.private).flatMap(find)));
    CSS.highlights.set('sd-note', new Highlight(...open.filter((c) => c.private).flatMap(find)));
  }
  function startComment(priv) {
    const r = ed.range(), b = ed.selected()[0];
    if (!r || !b) return;
    W.draft = { block: b.id.slice(2), quote: r.toString().split('\n')[0].trim().slice(0, 300) };
    tab = priv ? 'notes' : 'comments';
    if (W.panel !== 'comments') openPanel('comments'); else drawPanelComments();
    setTimeout(() => W.pbody.querySelector('sav-textarea')?.focus(), 60);
  }
  function drawPanelComments() {
    if (!S.user) { put(W.pbody, h('div.empty', h('p.muted', t('c_signin')), primary(t('sign_in'), { href: '#/signin' }))); return; }
    const priv = tab === 'notes', mayAdd = W.canComment && (priv || can(W.doc.role, 'commenter'));
    const roots = W.comments.filter((c) => !c.parent && c.private === priv && (showDone || !c.resolved));
    const ta = h('sav-textarea', { placeholder: t(priv ? 'n_new' : 'c_new'), rows: 3, maxlength: 4000 });
    const send = async () => { const v = ta.value.trim(); if (!v) return; setComments(await api('comment.add', { doc: pid, body: v, private: priv, ...(W.draft || {}) })); W.draft = null; drawPanelComments(); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send().catch(fail); });
    const one = (c) => {
      const reply = c.parent ? null : W.comments.filter((x) => x.parent === c.id);
      const el = c.block && document.getElementById('b-' + c.block);
      return h('div.comment' + (c.resolved ? '.done' : '') + (c.parent ? '.reply' : ''),
        h('div.chead', face(c.by), h('div', h('strong', c.mine ? t('you') : c.by), h('span.muted.small', when(c.at))), h('span.grow'), c.parent || c.private ? null : tool(c.resolved ? 'rotate-ccw' : 'check', t(c.resolved ? 'c_reopen' : 'c_resolve'), () => api('comment.resolve', { doc: pid, id: c.id, on: !c.resolved }).then(setComments).catch(fail)), c.mine || (W.doc.role === 'owner' && !c.private) ? tool('trash-2', t('delete'), () => api('comment.delete', { doc: pid, id: c.id }).then(setComments).catch(fail)) : null),
        c.quote ? h('button.quote', { type: 'button', onclick: () => { if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.animate([{ background: '#fbe6dd' }, { background: 'transparent' }], 1400); } }, el ? c.quote : t('c_gone')) : null,
        h('p.cbody', c.body), reply?.map(one), !c.parent && !c.private && can(W.doc.role, 'commenter') && W.canComment ? replyBox(c) : null);
    };
    const replyBox = (c) => { const i = h('sav-input', { placeholder: t('c_reply'), size: 'sm' }); i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && i.value.trim()) api('comment.add', { doc: pid, parent: c.id, body: i.value.trim() }).then(setComments).catch(fail); }); return i; };
    const seg = h('div.seg', ['comments', 'notes'].map((k) => h('button' + (tab === k ? '.on' : ''), { type: 'button', onclick: () => { tab = k; W.draft = null; drawPanelComments(); } }, t(k))));
    put(W.pbody, seg, mayAdd ? h('div.form', W.draft?.quote ? h('div.quote', W.draft.quote) : null, ta, h('div.row', h('span.grow'), primary(t(priv ? 'n_add' : 'c_send'), { size: 'sm', onclick: send }))) : null,
      roots.length ? roots.map(one) : h('div.empty', h('strong', t(priv ? 'n_none' : 'c_none')), h('p.muted', t(priv ? 'n_none_t' : 'c_none_t'))),
      !priv && W.comments.some((c) => c.resolved) ? toggle(t('c_resolved'), showDone, (v) => { showDone = v; drawPanelComments(); }) : null);
  }

  // ------------------------------------------------------------------ beginning and end

  buildToolbar();
  bubbleForReaders();
  ed.load(data.content, data.doc.title);
  firstZoom();

  if (!isLocal && !data.doc.review && !data.doc.deleted) {
    W.sync = new Sync({ pid, rev: data.doc.rev, role: data.doc.role, editor: ed, stamp: data.stamp, on: {
      state: (s) => setState(s), people: (p) => setPeople(p), title: (x) => { title.value = x; document.title = x + ' · SavDocuments'; }, comments: () => refreshComments(),
      role: () => { toast(t('role_changed'), 'warning'); reload(); }, reload: () => { toast(t('reloaded')); reload(); }, error: (e) => { toast(errText(e), 'danger', { duration: 0 }); setState('offline'); },
    } });
    if (editable && W.sync.recover()) toast(t('recovered'), 'success');
    setState('saved');
  } else if (isLocal) setState('saved');
  if (editable) { selection(ed.state()); if (!matchMedia('(pointer: coarse)').matches) { ed.ed.focus({ preventScroll: true }); ed.collapse(ed.ed.firstElementChild.matches('table') ? ed.ed.querySelector('td,th') : ed.ed.firstElementChild); } }
  if (data.doc.deleted) toast(t('err_doc_in_trash'), 'warning');
  const unload = (e) => { ed.scan(); if (W.sync?.pending || saveT) { W.sync?.flush(); e.preventDefault(); } };
  addEventListener('beforeunload', unload);
  W.close = () => {
    ed.scan();
    if (saveT) saveLocal();
    W.sync?.flush().finally(() => W.sync.stop());
    ed.destroy();
    ro.disconnect();
    slashMenu?.remove();
    removeEventListener('keydown', globalKeys);
    removeEventListener('beforeunload', unload);
    for (const k of ['sd-find', 'sd-find-now', 'sd-comment', 'sd-note']) CSS.highlights?.delete(k);
    closeMenu();
  };
  window.__writer = W;
  return W;
}

/** The form of the options, used for a document and for the defaults of new ones. */
export function optionsForm(s, { onchange = () => {}, cancel, done, title = t('doc_options'), bands = true }) {
  const up = (k, v) => { s[k] = v; onchange(); };
  const n = (label, k, min, max, step = 1, unit = 'mm') => { const x = h('sav-number-input', { label, value: s[k], min, max, step, unit }); x.addEventListener('input', () => { if (x.value !== '' && Number.isFinite(+x.value)) up(k, Math.max(min, Math.min(max, +x.value))); }); x.key = k; return x; };
  const custom = h('div.grid2', n(t('width'), 'w', 50, 600), n(t('height'), 'h', 50, 600));
  custom.hidden = s.size !== 'custom';
  const orient = h('div.orient', [[false, 'portrait'], [true, 'landscape']].map(([v, l]) => h('button' + (s.landscape === v ? '.on' : ''), { type: 'button', onclick: (e) => { up('landscape', v); [...orient.children].forEach((x) => x.classList.toggle('on', x === e.currentTarget)); } }, h('i.' + l), t(l))));
  const mm = [n(t('top'), 'mt', 0, 100), n(t('bottom'), 'mb', 0, 100), n(t('left'), 'ml', 0, 100), n(t('right'), 'mr', 0, 100)];
  const preset = (a, b) => { for (const k of ['mt', 'mb']) s[k] = a; for (const k of ['ml', 'mr']) s[k] = b; mm.forEach((x) => { x.value = s[x.key]; }); onchange(); };
  const fonts = FONTS.map((f) => [f, f]);
  const font = select(t('body_font'), fonts, s.font, (v) => up('font', v)), hfont = select(t('head_font'), fonts, s.headFont, (v) => up('headFont', v));
  const fs = n(t('size'), 'fontSize', 6, 40, 0.5, 'pt'), ln = n(t('line_height'), 'line', 1, 3, 0.05, ''), gp = n(t('gap'), 'gap', 0, 40, 1, 'pt');
  const col = (label, k) => { const x = h('sav-color-picker', { label, value: s[k] }); x.addEventListener('input', () => up(k, x.value)); return x; };
  const c1 = col(t('color'), 'color'), c2 = col(t('head_color'), 'headColor'), jst = toggle(t('justify_all'), s.justify, (v) => up('justify', v));
  const looks = h('div.looks', Object.entries(LOOKS).map(([k, l]) => h('button', { type: 'button', style: `font-family:${fontStack(l.font)}`, onclick: () => { Object.assign(s, l); font.value = s.font; hfont.value = s.headFont; fs.value = s.fontSize; ln.value = s.line; gp.value = s.gap; c1.value = s.color; c2.value = s.headColor; jst.checked = s.justify; onchange(); } }, h('b', { style: `font-family:${fontStack(l.headFont)};color:${l.headColor}` }, 'Aa'), h('span', t('look_' + k)))));
  let lastBand = null;
  const bandRow = (kind) => h('div', h('h3', t('band_' + kind)), h('div.grid3', ['l', 'c', 'r'].map((k) => { const x = h('sav-input', { value: s[kind][k], placeholder: t({ l: 'left', c: 'center', r: 'right' }[k]), maxlength: 120 }); x.addEventListener('input', () => { s[kind][k] = x.value; onchange(); }); x.addEventListener('focusin', () => { lastBand = [x, kind, k]; }); return x; })));
  const langs = [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română']];
  let ok = false;
  const tabs = h('sav-tabs', {},
    h('sav-tab', { label: t('o_page'), name: 'page' }, h('div.form', h('div.grid2', select(t('o_size'), [...Object.entries(SIZES).map(([k, [a, b]]) => [k, `${k} (${a} × ${b} mm)`]), ['custom', t('custom')]], s.size, (v) => { custom.hidden = v !== 'custom'; up('size', v); }), h('div', h('span.lab', t('o_orient')), orient)), custom, h('div.row.wrap', h('span.lab', t('margins')), btn(t('m_normal'), { size: 'sm', onclick: () => preset(25, 25) }), btn(t('m_narrow'), { size: 'sm', onclick: () => preset(13, 13) }), btn(t('m_wide'), { size: 'sm', onclick: () => preset(25, 50) })), h('div.grid4', mm))),
    h('sav-tab', { label: t('o_text'), name: 'text' }, h('div.form', h('span.lab', t('look')), looks, h('div.grid2', font, hfont), h('div.grid3', fs, ln, gp), h('div.grid2', c1, c2), jst, toggle(t('numbered'), s.numbered, (v) => up('numbered', v)), select(t('doc_lang'), langs, s.lang, (v) => up('lang', v)))),
    bands ? h('sav-tab', { label: t('o_bands'), name: 'bands' }, h('div.form', bandRow('header'), bandRow('footer'), h('p.muted.small', t('band_help')), h('div.row.wrap', ['page', 'pages', 'title', 'date'].map((k) => { const b = btn(t('f_' + k), { size: 'sm' }); b.addEventListener('mousedown', (e) => e.preventDefault()); b.addEventListener('click', () => { if (!lastBand) return; const [x, kind, z] = lastBand; x.value = (x.value + (x.value && !x.value.endsWith(' ') ? ' ' : '') + `{${k}}`).slice(0, 120); s[kind][z] = x.value; onchange(); }); return b; })), toggle(t('first_page'), s.firstPage, (v) => up('firstPage', v)))) : null);
  return dialog({ title, width: '42rem', body: tabs, actions: [{ label: t('cancel') }, { label: t('apply'), primary: true, run: async () => { ok = true; await done(); } }], onclose: () => { if (!ok) cancel?.(); } });
}

const ROLES = () => [['viewer', t('r_viewer')], ['commenter', t('r_commenter')], ['editor', t('r_editor')]];

export async function shareDialog({ pid }) {
  const body = h('div.form', h('p.muted', t('loading')));
  dialog({ title: t('sh_title'), width: '36rem', body, actions: [{ label: t('done'), primary: true }] });
  const link = `${location.origin}${location.pathname}#/d/${pid}`;
  const draw = (d) => {
    const mail = h('sav-input', { type: 'email', placeholder: t('sh_add'), 'aria-label': t('sh_add') }), role = select('', ROLES(), 'viewer', null, { 'aria-label': t('a_access') }), notify = h('sav-checkbox', { checked: true }, t('sh_notify'));
    const add = async () => { if (!mail.value.trim()) return; draw(await api('share.add', { doc: pid, email: mail.value.trim(), role: role.value, notify: notify.checked })); };
    mail.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add().catch(fail); } });
    const vis = (v, r) => api('share.visibility', { doc: pid, visibility: v, role: r }).then(draw).catch(fail);
    const once = select('', ROLES(), 'viewer', null, { 'aria-label': t('a_access') }), out = h('div');
    put(body,
      h('div.row.wrap', h('div.grow', mail), h('div.w9', role), primary(t('sh_invite'), { onclick: add })), notify,
      h('div.plist', h('div.person', face(d.owner.name), h('div.grow', h('strong', d.owner.name), h('span.muted.small', d.owner.email)), h('span.muted', t('r_owner'))),
        d.people.map((p) => h('div.person', face(p.name || p.email), h('div.grow', h('strong', p.name || p.email), h('span.muted.small', p.pending ? t('pending') : p.email)), h('div.w9', select('', ROLES(), p.role, (v) => api('share.role', { doc: pid, id: p.id, role: v }).catch(fail), { size: 'sm', 'aria-label': t('a_access') })), tool('x', t('remove'), () => api('share.remove', { doc: pid, id: p.id }).then(draw).catch(fail))))),
      h('h3', t('sh_general')),
      h('div.row.wrap', h('span.vis', icon(d.visibility === 'link' ? 'globe' : 'lock', 20)), h('div.grow', select('', [['private', t('v_private')], ['link', t('v_link')]], d.visibility, (v) => vis(v, d.linkRole), { 'aria-label': t('sh_general') }), h('p.muted.small', t(d.visibility === 'link' ? 'v_link_t' : 'v_private_t'))), d.visibility === 'link' ? h('div.w9', select('', ROLES(), d.linkRole, (v) => vis('link', v), { 'aria-label': t('a_access') })) : null),
      btn(t('copy_link'), { icon: 'link-2', size: 'sm', onclick: () => copyText(link, t('link_copied')) }),
      h('h3', t('once_title')), h('p.muted.small', t('once_text')), h('div.row.wrap', h('div.w9', once), btn(t('once_make'), { icon: 'link', onclick: async () => { const r = await api('invite.create', { doc: pid, role: once.value }); put(out, h('div.row', h('code.url', r.url), btn(t('copy'), { size: 'sm', icon: 'copy', onclick: () => copyText(r.url, t('link_copied')) }))); } })), out);
  };
  try { draw(await api('share.get', undefined, { doc: pid })); } catch (e) { put(body, h('p', errText(e))); }
}

export function reportDialog(pid) {
  const why = select(t('reason'), ['spam', 'phishing', 'illegal', 'other'].map((k) => [k, t('rep_' + k)]), 'spam'), note = h('sav-textarea', { label: t('rep_note'), rows: 3, maxlength: 1000 });
  dialog({ title: t('rep_title'), body: h('div.form', why, note), actions: [{ label: t('cancel') }, { label: t('rep_send'), primary: true, run: async () => { await api('report.add', { doc: pid, reason: why.value, note: note.value }); toast(t('rep_sent'), 'success'); } }] });
}
