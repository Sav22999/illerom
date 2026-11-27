/** The writing screen. */
import { ask, btn, colorPop, confirm, copyText, dialog, drop, dropBtn, empty, errText, face, fail, h, icon, iconBtn, INKS, item, K, keepCaret, menuAt, mobile, num, PASTEL, primary, put, select, tile, toast, toggle } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, keep, local, localStore, offline, remoteStore, shrink } from './store.js';
import { Editor } from './editor.js';
import { Sync } from './sync.js';
import { Rulers } from './ruler.js';
import { BUILTIN, FONTS, fontStack } from './settings.js';
import { fontDialog, fontOptions, useFonts, withFont } from './fonts.js';
import { download, fileName, imageIds, toEpub, toHtml, toMarkdown, toSavdoc, toText } from './files.js';
import { CHARTS, CHART_ICONS, FLOWS, FLOW_ICONS, newObject, objectWidth, RULES } from './objects.js';
import { elementsPanel, formatPanel, imageDialog, imagesPanel, pageForm, styleForm } from './panels.js';
import { charsDialog, diagramDialog, drawDialog, linkDialog, mathDialog, noteDialog, tableDialog } from './inserts.js';
import { reportDialog, shareDialog } from './share.js';
import { can, importFile, pickFile } from './actions.js';
import { prefs, setPrefs, userMenu } from './account.js';

const TYPES = ['p', 'title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'lead', 'small', 'drop', 'blockquote', 'pre'];
const TYPE_ICONS = { p: 'pilcrow', title: 'type', subtitle: 'case-sensitive', h1: 'heading-1', h2: 'heading-2', h3: 'heading-3', h4: 'heading-4', lead: 'text-cursor-input', small: 'baseline', drop: 'a-large-small', blockquote: 'quote', pre: 'square-code' };
const SIZES_PT = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];

export async function openWriter(root, pid, opt = {}) {
  const isLocal = pid.startsWith('local-');
  let data, ldoc = null, store;
  if (isLocal && !S.user) throw Object.assign(new Error(), { code: 'doc_signin' });
  if (isLocal) {
    ldoc = await local.get(pid);
    if (!ldoc) throw Object.assign(new Error(), { code: 'doc_not_found' });
    store = localStore(ldoc);
    await store.warm();
    data = { doc: { id: pid, title: ldoc.title, role: 'owner', mine: true, rev: 0 }, content: ldoc.content, comments: [], stamp: '' };
  } else {
    try {
      data = await api('doc.get', undefined, { doc: pid, review: opt.review ? 1 : undefined });
      if (!opt.review && S.user) offline.put('doc:' + pid, data);
    } catch (e) {
      // without a connection the copy kept in this browser opens, and the changes wait for the network
      const c = e.code === 'network' && S.user ? await offline.get('doc:' + pid) : null;
      if (!c) throw e.code === 'network' && S.user ? Object.assign(new Error(), { code: 'offline_missing' }) : e;
      data = c;
      S.offline = true;
    }
    store = remoteStore(pid);
  }
  const W = { root, pid, isLocal, store, doc: data.doc, comments: data.comments, tab: '', zoom: 1, lastCaret: null };
  const editable = (W.editable = !data.doc.review && !data.doc.deleted && can(data.doc.role, 'editor') && (isLocal || !!S.user));
  // what the owner lets who only reads (or comments) do
  const lim = editable ? {} : data.content.settings || {};
  W.canComment = !isLocal && !!S.user && !data.doc.review && !data.doc.deleted && !lim.noComments;
  const P = prefs();
  let ed;

  // ------------------------------------------------------------------ frame

  const title = h('sav-input.dtitle', { value: data.doc.title, maxlength: 160, readonly: !editable, size: 'sm', 'aria-label': t('rename_doc'), spellcheck: 'false' });
  const status = h('span.status', { role: 'status' }), people = h('div.people');
  const desk = h('div.desk'), paper = h('div.paper'), marks = h('div.presence');
  const left = h('aside.eleft'), panel = h('aside.epanel'), rail = h('sav-bottom-nav.rail', { label: t('panels') });
  const fmt = h('div.fmt', { role: 'toolbar', 'aria-label': t('format_tab') }), ins = h('div.ins', { role: 'toolbar', 'aria-label': t('insert') });
  const bubble = h('div.bubble', { hidden: true, role: 'toolbar', 'aria-label': t('format_tab') }), objbar = h('div.bubble', { hidden: true, role: 'toolbar' });
  const zoomEl = h('sav-zoom', { value: 100, min: 30, max: 300, step: 10, size: 'sm', appearance: 'plain' });
  const pageB = btn('', { size: 'sm', appearance: 'ghost' }), wordB = btn('', { size: 'sm', appearance: 'ghost' });
  const undoB = iconBtn('undo-2', t('undo'), () => ed.undo(), { kbd: 'Mod+Z', size: 'md' }), redoB = iconBtn('redo-2', t('redo'), () => ed.undo(true), { kbd: 'Mod+Shift+Z', size: 'md' });
  const shareB = !isLocal && data.doc.role === 'owner' ? btn(h('span.lbl', t('share')), { icon: 'user-plus', label: t('share'), variant: 'primary', appearance: 'soft', onclick: () => shareDialog(W) }) : isLocal && S.user?.verified ? btn(h('span.lbl', t('save_account')), { icon: 'cloud-upload', label: t('save_account'), variant: 'primary', appearance: 'soft', onclick: () => toAccount() }) : null;
  // downloading: a window of cards, one per format, the same as SavPresentations
  const DL = [['pdf', 'file-text', 'PDF'], ['docx', 'file-type', t('dl_docx')], ['odt', 'file-text', t('dl_odt')], ['doc', 'file-type', t('dl_doc')], ['savdoc', 'file-box', t('dl_savdoc')], ['html', 'globe', t('dl_html')], ['epub', 'book-open', t('dl_epub')], ['md', 'hash', t('dl_md')], ['txt', 'file', t('dl_txt')]];
  const dlItems = () => lim.noDownload ? [] : [['download', t('download'), () => downloadDialog()]];
  function downloadDialog() {
    let d = null;
    const card = ([kind, ic, label]) => { const c = tile(label, async () => { if (c.classList.contains('busy')) return; c.classList.add('busy'); try { await save(kind); d.hide(); } catch (e) { fail(e); } finally { c.classList.remove('busy'); } }, { class: 'dl' }, icon(ic), h('b', label), h('small', t('dlt_' + kind))); return c; };
    d = dialog({ title: t('download'), width: '40rem', body: h('div.dls', DL.map(card)) });
  }
  W.download = downloadDialog;
  const downB = iconBtn('download', t('download'), () => downloadDialog(), { size: 'md' });
  const menuB = drop(h('sav-button', { icon: 'ellipsis-vertical', appearance: 'ghost', variant: 'neutral', square: true, label: t('more') }), () => moreItems(), { placement: 'bottom-end', label: data.doc.title });
  const top = h('header.etop', h('a.ehome', { href: '#/', title: t('home'), 'aria-label': t('home') }, h('img', { src: 'icons/favicon.svg', width: 30, height: 30, alt: '' })), h('div.etitle', title, status), editable ? h('div.hist', undoB, redoB) : null, editable ? ins : null, h('div.spacer'), people, shareB, mobile() || lim.noDownload ? null : downB, mobile() ? null : iconBtn('command', t('palette_l'), () => W.palette.show(), { kbd: 'Mod+J', size: 'md' }), menuB, S.user ? userMenu() : mobile() ? null : btn(t('sign_in'), { appearance: 'outline', variant: 'neutral', href: '#/signin' }));
  const note = editable ? null : h('sav-alert.robar', { variant: data.doc.review ? 'warning' : 'neutral', noicon: true }, data.doc.review ? t('a_review_bar') : data.doc.role === 'commenter' ? t('can_comment') : t('read_only'));
  const bottom = h('div.ebottom', iconBtn('list-tree', t('outline'), () => toggleLeft(), { place: 'top' }), pageB, wordB, h('div.spacer'), editable ? iconBtn('maximize', t('focus'), () => focusMode(), { place: 'top' }) : null, iconBtn('fullscreen', t('fit'), () => setZoom('fit'), { place: 'top' }), zoomEl);
  desk.append(paper);
  const center = h('section.ecenter', note, desk, bottom), frame = h('div.writer' + (editable ? '' : '.reading'), top, editable ? fmt : null, h('div.emain', left, center, panel, rail), bubble, objbar);
  put(root, frame);
  document.title = data.doc.title + ' – SavDocuments';

  // ------------------------------------------------------------------ editor

  ed = W.ed = new Editor(paper, {
    editable, spellcheck: P.spellcheck !== false,
    labels: { hint: t('hint'), pageBreak: t('page_break'), caption: t('caption'), emptyToc: t('empty_toc'), emptyFigs: t('empty_figs'), text: t('doc_text'), formula: t('i_math') },
    imageUrl: (id) => store.imageUrl(id), zoom: () => W.zoom, autoformat: () => prefs().autoformat !== false,
    onChange: (ops) => changed(ops), onSelect: (st) => selection(st), onLayout: () => afterLayout(), onDress: () => dressFluid(), onSlash: (s) => slash(s), onBlock: (id) => { if (W.sync) W.sync.block = id; },
    onImageFiles: (f) => W.addFiles(f), onPasteImage: (src) => pasteImage(src), onNote: (fn) => noteDialog(W, fn), onMath: (m) => mathDialog(W, m), onKey: (e) => keys(e),
  });
  ed.pager.flow.append(marks);
  /** Runs a command from the controls around the text, with the caret where it was. */
  W.act = (fn) => { if (!ed.sel && document.activeElement !== ed.ed) { ed.ed.focus({ preventScroll: true }); if (W.lastCaret) ed.setCaret(W.lastCaret); } const r = fn(); W.lastCaret = ed.caret() || W.lastCaret; return r; };
  const act = W.act;
  const reload = () => { W.close(); openWriter(root, pid, opt).then((w) => opt.onReload?.(w)).catch(fail); };

  let saveT = null;
  function changed(ops) {
    if (W.sync) W.sync.push(ops);
    else if (isLocal) { setState('saving'); clearTimeout(saveT); saveT = setTimeout(saveLocal, 500); }
    W.countsDirty = true;
    clearTimeout(W.outT);
    W.outT = setTimeout(drawLeft, 400);
    if (ops.some((o) => o.t === 'settings')) { W.form?.refresh?.(ed.settings); rulers?.draw(); }
  }
  async function saveLocal() {
    clearTimeout(saveT);
    saveT = null;
    ldoc.title = ed.title;
    ldoc.content = ed.snapshot();
    try { await local.put(ldoc); setState('saved'); } catch (e) { fail(e); }
  }
  function setState(s) { status.dataset.s = s; put(status, icon(isLocal ? (s === 'saved' ? 'hard-drive' : 'cloud-upload') : { saved: 'cloud-check', saving: 'refresh-cw', offline: 'cloud-off' }[s]), isLocal && s === 'saved' ? t('local_note') : t(s)); }
  function setPeople(list) {
    const seen = new Set();
    put(people, list.filter((p) => !seen.has(p.name) && seen.add(p.name)).slice(0, 4).map((p) => face(p.name, p.hue, 28)));
    W.people = list;
    drawPresence();
  }
  function drawPresence() { put(marks, (W.people || []).map((p) => { const b = p.block && document.getElementById('b-' + p.block); if (!b) return null; const r = b.getBoundingClientRect(); return h('div.pmark', { style: `top:${ed.pager.y(r)}px;height:${r.height / W.zoom}px;--h:${p.hue}`, title: t('writing_here', { name: p.name }) }, h('span', p.name)); })); }
  title.addEventListener('change', () => { const v = title.value.trim() || t('untitled'); title.value = v; if (v === ed.title) return; ed.change({ t: 'title', title: v }); document.title = v + ' – SavDocuments'; });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ed.ed.focus(); } });

  // ------------------------------------------------------------------ zoom, view

  W.fluid = desk.clientWidth < 640;
  function dressFluid() {
    ed.pager.fluid = W.fluid;
    paper.classList.toggle('fluid', W.fluid);
    if (W.fluid) for (const [k, v] of Object.entries({ pw: desk.clientWidth - 12 + 'px', ml: '20px', mr: '20px', mt: '24px', mb: '40px', hc: '80vh' })) paper.style.setProperty('--' + k, v);
  }
  const pw = () => parseFloat(paper.style.getPropertyValue('--pw'));
  const firstZoom = () => { W.fit = desk.clientWidth < pw() + 80; setZoom(W.fit ? 'fit' : 1, true); };
  const setFluid = (on) => { W.fluid = on; ed.dress(); firstZoom(); showRulers(); ed.later(); };
  let zoomSet = false;
  function setZoom(z, keepMode) {
    if (!keepMode) { W.fit = z === 'fit'; W.auto = 0; }
    if (W.fluid) { W.zoom = 1; paper.style.zoom = 1; dressFluid(); ed.later(); return; }
    W.zoom = z === 'fit' || W.fit ? Math.max(0.3, Math.min(desk.clientWidth < 700 ? 1.2 : 1.5, (desk.clientWidth - (desk.clientWidth < 700 ? 12 : 84)) / pw())) : z;
    paper.style.zoom = W.zoom;
    zoomSet = true; zoomEl.value = Math.round(W.zoom * 100); zoomSet = false;
    ed.later();
  }
  zoomEl.addEventListener('change', (e) => { if (!zoomSet) setZoom(Math.max(0.3, (+(e.detail?.value ?? zoomEl.value) || 100) / 100)); });
  // a panel that opens (or a narrower window) never hides the page: the zoom fits for a while, and comes back when there is room again
  const ro = new ResizeObserver(() => {
    if (W.auto && !W.fluid && desk.clientWidth >= pw() * W.auto + 84) { const z = W.auto; W.auto = 0; setZoom(z); return; }
    if (W.fit || W.fluid) setZoom('fit', true);
    else if (desk.clientWidth < pw() * W.zoom + 48) { const z = W.zoom; setZoom('fit'); W.auto = z; } else ed.later();
  });
  ro.observe(desk);
  drop(pageB, () => [['file-text', t('v_pages'), () => setFluid(false), { check: !W.fluid }], ['smartphone', t('v_fluid'), () => setFluid(true), { check: W.fluid }], '-', ['ruler', t('rulers'), () => { setPrefs({ rulers: prefs().rulers === false }).catch(fail); showRulers(); }, { check: prefs().rulers !== false }], ['pilcrow', t('marks'), () => ed.ed.classList.toggle('marks'), { check: ed.ed.classList.contains('marks') }]], { placement: 'top-start', label: t('view') });

  const pageD = pageB.parentNode;
  bottom.insertBefore(pageD, wordB.parentNode === bottom ? wordB : bottom.children[1]);
  wordB.addEventListener('click', () => countsDialog());
  const pageText = () => { const y = (desk.scrollTop + desk.clientHeight / 3 - paper.offsetTop * W.zoom) / W.zoom; const s = W.fluid ? t('no_pages') : `${t('page')} ${ed.pager.pageAt(Math.max(0, y))} ${t('of')} ${ed.pager.pages}`; if (pageB._t !== s) { pageB._t = s; pageB.textContent = s; } };
  function afterLayout() {
    pageText();
    if (W.countsDirty !== false) { W.countsDirty = false; W.counts = ed.counts(); const goal = +localStorage.getItem('savdocuments-goal-' + pid) || 0; put(wordB, `${W.counts.words.toLocaleString(getLang())} ${goal ? '/ ' + goal.toLocaleString(getLang()) + ' ' : ''}${W.counts.words === 1 ? t('word') : t('words')}`); wordB.variant = goal && W.counts.words >= goal ? 'primary' : 'neutral'; }
    zoomEl.hidden = W.fluid;
    drawPresence();
    drawComments();
    floatBars();
    rulers?.draw();
  }
  desk.addEventListener('scroll', () => { pageText(); floatBars(); rulers?.draw(); }, { passive: true });
  function focusMode() { const on = frame.classList.toggle('focusing'); ed.ed.classList.toggle('focus', on); if (on) toast(t('focus_esc'), 'neutral', { duration: 1800 }); }

  // rulers and margins
  let rulers = null;
  if (editable) rulers = W.rulers = new Rulers({
    desk, paper, ed, zoom: () => W.zoom, label: (k) => t('m_' + k),
    onmargin: (s, done) => { if (done) commitSettings(s); else previewSettings(s); },
    onindent: (v, done) => { const b = ed.selected()[0]; if (!b) return; if ('il' in v) b.style.marginLeft = v.il > 0.4 ? v.il.toFixed(1) + 'pt' : ''; if ('fl' in v) b.style.textIndent = v.fl > 0.4 ? v.fl.toFixed(1) + 'pt' : ''; ed.later(); if (done) ed.do(() => ed.dirty.add(b)); },
  });
  const showRulers = () => rulers?.show(!W.fluid && !mobile() && prefs().rulers !== false);

  // settings: seen at once, saved (and undone) as one step
  let before = null, setT = 0;
  function previewSettings(s) { useFonts(s); before ||= structuredClone(ed.settings); ed.settings = structuredClone(s); ed.dress(); ed.quiet(() => ed.decorate()); ed.later(); }
  function commitSettings(s) {
    clearTimeout(setT);
    const old = before || ed.settings;
    before = null;
    ed.settings = old;
    if (JSON.stringify(old) === JSON.stringify(s)) { ed.dress(); ed.later(); return; }
    ed.change({ t: 'settings', s });
    if (s.size !== old.size || s.landscape !== old.landscape || s.w !== old.w) firstZoom(); else if (W.fit) setZoom('fit', true);
  }
  W.settings = () => ed.settings;
  /** A typeface that is not included goes into the list of the document, so everybody sees it. */
  W.addFont = (f) => { if (BUILTIN[f.n]) return; W.setSettings({ fonts: withFont(ed.settings.fonts, f) }); W.fontMenus(); };
  W.fontMenus = () => { if (B.font) B.font.replaceChildren(...fontOptions(ed.settings.fonts).map(([v, l, st]) => h('option', { value: v, style: st }, l))); };
  W.moreFonts = () => {
    const sel = ed.caret() || W.lastCaret; // the text that was selected before the dialog took the focus
    fontDialog({ current: W.st?.font || ed.settings.font, used: ed.settings.fonts, onpick: (f) => { W.addFont(f); ed.ed.focus({ preventScroll: true }); if (sel) { ed.setCaret(sel); W.lastCaret = sel; } act(() => ed.inline('fontName', f.n)); selection(ed.state()); } });
  };
  W.setSettings = (p) => { const s = { ...ed.settings, ...p }; previewSettings(s); clearTimeout(setT); setT = setTimeout(() => commitSettings(ed.settings), 450); };
  const flushSettings = () => { if (before) commitSettings(ed.settings); };

  // ------------------------------------------------------------------ inserting

  const focusText = () => { if (document.activeElement !== ed.ed && !ed.sel) { ed.ed.focus({ preventScroll: true }); if (W.lastCaret) ed.setCaret(W.lastCaret); else ed.collapse(ed.ed.lastElementChild, true); } };
  W.insert = (what) => {
    if (!editable) return;
    focusText();
    const [k, a] = what.split(/:(.*)/s), L = { quarter: t('quarter'), series: t('series'), step: t('step'), signature: t('signature') };
    if (k === 'image') return void imageDialog(W);
    if (k === 'search') return void setTab('images');
    if (k === 'table') return void tableDialog(W);
    if (k === 'cols') return void ed.insertColumns(+a);
    if (k === 'hr') return void ed.insertHr(a);
    if (k === 'pb') return void ed.insertBreak();
    if (k === 'bands') return void W.bands();
    if (k === 'toc') return void ed.insertToc();
    if (k === 'tocf') return void ed.insertToc('f');
    if (k === 'note') return void noteDialog(W);
    if (k === 'link') return void linkDialog(W);
    if (k === 'math') return void mathDialog(W);
    if (k === 'chars') return void charsDialog(W);
    if (k === 'drawing') return void drawDialog(W);
    if (k === 'diagram') return void diagramDialog(W).catch(fail);
    if (k === 'callout') return void ed.block('callout', a);
    if (k === 'quote') return void ed.block('blockquote');
    if (k === 'code') return void ed.block('pre');
    if (k === 'list') return void ed.list(a);
    if (k === 'date') return void ed.do(() => document.execCommand('insertText', false, new Date().toLocaleDateString(ed.settings.lang, { day: 'numeric', month: 'long', year: 'numeric' })));
    const o = newObject(k, a, L);
    if (!o) return;
    ed.insertObject(o, objectWidth(o));
    if (!mobile()) setTab('format');
  };
  ed.ed.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/sd-insert')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; const c = document.caretPositionFromPoint?.(e.clientX, e.clientY); if (c && ed.ed.contains(c.offsetNode)) getSelection().collapse(c.offsetNode, c.offset); } });
  ed.ed.addEventListener('drop', (e) => { const w = e.dataTransfer.getData('text/sd-insert'); if (!w) return; e.preventDefault(); e.stopPropagation(); ed.ed.focus({ preventScroll: true }); W.lastCaret = ed.caret() || W.lastCaret; W.insert(w); }, true);
  W.addFiles = async (files) => {
    if (!files?.length) return;
    const c = ed.caret() || W.lastCaret, n = toast(t('img_adding'), 'neutral', { duration: 0 });
    try {
      let first = c;
      for (const f of files) { const id = await store.addImage(await shrink(f)); ed.ed.focus({ preventScroll: true }); if (first) ed.setCaret(first); first = null; ed.insertImage(id, ''); }
    } catch (e) { fail(e); } finally { n.remove(); }
  };
  W.replaceImage = async (f) => { const [file] = await pickFile('image/*'); if (!file) return; const id = await store.addImage(await shrink(file)); ed.do(() => { f.querySelector('img').dataset.i = id; ed.quiet(() => ed.decorate()); ed.dirty.add(ed.topOf(f)); }); };
  async function pasteImage(src) {
    try {
      let blob;
      if (src.startsWith('own:')) blob = await store.imageBlob(src.slice(4)); else if (/^data:image\//.test(src) || src.startsWith(location.origin) || src.startsWith('blob:')) blob = await (await fetch(src)).blob();
      return blob ? await store.addImage(await shrink(blob)) : '';
    } catch { return ''; }
  }
  const chartItems = () => CHARTS.map((c) => [CHART_ICONS[c], t('ct_' + c), () => W.insert('chart:' + c)]), flowItems = () => FLOWS.map((c) => [FLOW_ICONS[c], t('fl_' + c), () => W.insert('flow:' + c)]);
  const shapeItems = () => [['square', t('sh_rect'), 'rect'], ['rectangle-horizontal', t('sh_round'), 'round'], ['circle', t('sh_ellipse'), 'ellipse'], ['triangle', t('sh_triangle'), 'triangle'], ['star', t('sh_star'), 'star'], ['arrow-right', t('sh_arrow'), 'arrow'], ['message-square', t('sh_speech'), 'speech'], ['minus', t('sh_line'), 'line'], ['move-right', t('sh_line-end'), 'line-end']].map(([i, l, s]) => [i, l, () => W.insert('shape:' + s)]);
  const listOf = () => [['image', t('i_image'), 'image'], ['images', t('img_free'), 'search'], ['table', t('i_table'), 'table'], ['columns-2', t('i_cols2'), 'cols:2'], ['sigma', t('i_math'), 'math'], ['list-tree', t('i_toc'), 'toc'], ['captions', t('i_tocf'), 'tocf'], ['footprints', t('i_note'), 'note'], ['link', t('i_link'), 'link'], ['minus', t('hr_thin'), 'hr:'], ['separator-horizontal', t('i_pb'), 'pb'], ['panel-top', t('o_bands'), 'bands'], ['info', t('s_callout'), 'callout:info'], ['quote', t('s_blockquote'), 'quote'], ['square-code', t('s_pre'), 'code'], ['calendar', t('i_date'), 'date'], ['qr-code', t('i_qr'), 'qr'], ['signature', t('i_sign'), 'sign'], ['pen-line', t('i_drawing'), 'drawing'], ['workflow', t('i_diagram'), 'diagram'], ['omega', t('i_chars'), 'chars']];

  // ------------------------------------------------------------------ toolbars

  // the insert bar, as in SavPresentations: buttons with a name, chosen and ordered by each person
  const addTool = (ic, label, what) => h('sav-tooltip', { content: label, placement: 'bottom', delay: 350 }, h('sav-button', { icon: ic, label, appearance: 'ghost', variant: 'neutral', size: 'sm', onclick: () => W.insert(what) }, h('span.insl', label)));
  const dropTool = (ic, label, items) => drop(h('sav-button', { icon: ic, label, title: label, caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm' }, h('span.insl', label)), items, { label });
  const TOOLS = {
    image: ['image', 'i_image', () => addTool('image', t('i_image'), 'image')],
    table: ['table', 'i_table', () => addTool('table', t('i_table'), 'table')],
    chart: ['chart-column', 'chart', () => dropTool('chart-column', t('chart'), chartItems)],
    shape: ['shapes', 'shape', () => dropTool('shapes', t('shape'), shapeItems)],
    diagram: ['workflow', 'diagram', () => dropTool('workflow', t('diagram'), flowItems)],
    math: ['sigma', 'i_math', () => addTool('sigma', t('i_math'), 'math')],
    toc: ['list-tree', 'i_toc', () => addTool('list-tree', t('i_toc'), 'toc')],
    rule: ['minus', 'p_rules', () => dropTool('minus', t('p_rules'), () => RULES.map((r) => ['minus', t(r ? 'hr_' + r : 'hr_thin'), () => W.insert('hr:' + r)]))],
    cols: ['columns-2', 'i_cols2', () => addTool('columns-2', t('i_cols2'), 'cols:2')],
    note: ['footprints', 'i_note', () => addTool('footprints', t('i_note'), 'note')],
    link: ['link', 'i_link', () => addTool('link', t('i_link'), 'link')],
    pb: ['separator-horizontal', 'i_pb', () => addTool('separator-horizontal', t('i_pb'), 'pb')],
    bands: ['panel-top', 'o_bands', () => addTool('panel-top', t('o_bands'), 'bands')],
    callout: ['info', 's_callout', () => addTool('info', t('s_callout'), 'callout:info')],
    icon: ['smile', 'icon', () => addTool('smile', t('icon'), 'icon')],
    qr: ['qr-code', 'i_qr', () => addTool('qr-code', t('i_qr'), 'qr')],
    sign: ['signature', 'i_sign', () => addTool('signature', t('i_sign'), 'sign')],
    drawing: ['pen-line', 'i_drawing', () => addTool('pen-line', t('i_drawing'), 'drawing')],
    chars: ['omega', 'i_chars', () => addTool('omega', t('i_chars'), 'chars')],
  };
  const TOOLS_DEF = ['image', 'table', 'chart', 'shape', 'diagram', 'math', 'toc'];
  function drawTools() {
    const on = (prefs().tools || TOOLS_DEF).filter((k) => TOOLS[k]), shown = new Set(on);
    const rest = listOf().filter(([, , w]) => !Object.keys(TOOLS).some((k) => shown.has(k) && TOOLS[k][2] && w === { image: 'image', table: 'table', math: 'math', toc: 'toc', cols: 'cols:2', note: 'note', link: 'link', pb: 'pb', bands: 'bands', callout: 'callout:info', qr: 'qr', sign: 'sign', drawing: 'drawing', chars: 'chars' }[k]));
    put(ins, h('span.inst', t('insert')), on.map((k) => TOOLS[k][2]()), dropTool('plus', t('more'), () => rest.map(([i, l, w]) => [i, l, () => W.insert(w)]))); // customising the bar: in the ⋮ menu
  }
  /** Which buttons the insert bar has, and in what order. */
  async function toolsDialog() {
    const on = (prefs().tools || TOOLS_DEF).filter((k) => TOOLS[k]), list = h('sav-sortable.toollist', { handle: '.grip', 'aria-label': t('toolbar_edit') });
    const paint = (order, sel) => put(list, order.map((k) => h('div.toolrow', { 'data-id': k }, icon('grip-vertical', { class: 'grip' }), icon(TOOLS[k][0]), h('span.grow', t(TOOLS[k][1])), h('sav-switch', { size: 'sm', checked: sel.includes(k) || null, 'aria-label': t(TOOLS[k][1]) }))));
    paint([...on, ...Object.keys(TOOLS).filter((k) => !on.includes(k))], on);
    dialog({ title: t('toolbar_edit'), width: '26rem', body: h('div.form', h('p.muted', t('toolbar_edit_t')), list), actions: [{ label: t('reset'), appearance: 'ghost', keep: true, run: () => { paint([...TOOLS_DEF, ...Object.keys(TOOLS).filter((k) => !TOOLS_DEF.includes(k))], TOOLS_DEF); return false; } }, { label: t('cancel') }, { label: t('save'), primary: true, run: async () => { await setPrefs({ tools: [...list.querySelectorAll('.toolrow')].filter((r) => r.querySelector('sav-switch').checked).map((r) => r.dataset.id) }); drawTools(); } }] });
  }

  const B = {};
  function buildToolbars() {
    if (!editable) return;
    drawTools();
    B.type = select(null, TYPES.map((k) => [k, t('s_' + k)]), 'p', (v) => { if (v) act(() => { if (ed.state().type !== v) ed.block(v); }); }, { 'aria-label': t('styles'), class: 'f-type', placeholder: t('styles') });
    B.font = select(null, fontOptions(ed.settings?.fonts), ed.settings?.font || FONTS[0], (v) => { if (v === '__more') { B.font.value = W.st?.font || ed.settings.font; W.moreFonts(); return; } if (v && v !== W.st?.font) act(() => ed.inline('fontName', v)); }, { 'aria-label': t('font'), class: 'f-font', searchable: true, 'search-placeholder': t('search') });
    B.size = select(null, SIZES_PT.map((x) => [String(x), String(x)]), '11', (v) => { if (v && +v !== W.st?.size) act(() => ed.inline('size', +v)); }, { 'aria-label': t('size'), class: 'f-size' });
    const inl = (ic, cmd, key, kbd) => (B[key] = iconBtn(ic, t(key), () => act(() => ed.inline(cmd)), { kbd }));
    inl('bold', 'bold', 'bold', 'Mod+B'); inl('italic', 'italic', 'italic', 'Mod+I'); inl('underline', 'underline', 'underline', 'Mod+U'); inl('strikethrough', 'strikeThrough', 'strike', 'Mod+Shift+X');
    const cbtn = (ic, label) => h('sav-button.cicon', { icon: ic, label, title: label, size: 'sm', appearance: 'ghost', variant: 'neutral', square: true });
    B.color = colorPop(t('color'), '', (v) => act(() => ed.inline('foreColor', v || ed.settings.color)), { trigger: cbtn('baseline', t('color')), none: t('automatic'), list: INKS });
    B.mark = colorPop(t('highlight'), '', (v) => act(() => ed.inline('hiliteColor', v || 'transparent')), { trigger: cbtn('highlighter', t('highlight')), none: t('none'), list: PASTEL });
    B.link = iconBtn('link', t('link'), () => linkDialog(W), { kbd: 'Mod+K' });
    B.ul = iconBtn('list', t('s_ul'), () => act(() => ed.list('ul')), { kbd: 'Mod+Shift+8' }); B.ol = iconBtn('list-ordered', t('s_ol'), () => act(() => ed.list('ol')), { kbd: 'Mod+Shift+7' }); B.check = iconBtn('list-checks', t('s_check'), () => act(() => ed.list('check')), { kbd: 'Mod+Shift+9' });
    B.align = dropBtn('text-align-start', t('align'), () => [['left', 'text-align-start', 'L'], ['center', 'text-align-center', 'E'], ['right', 'text-align-end', 'R'], ['justify', 'text-align-justify', 'J']].map(([k, ic, l]) => [ic, t(k), () => act(() => ed.align(k)), { check: W.st?.align === k, kbd: 'Mod+Shift+' + l }]));
    B.lh = dropBtn('between-horizontal-start', t('line_height'), () => [1, 1.15, 1.25, 1.5, 1.75, 2, 2.5].map((x) => [null, String(x).replace('.', getLang() === 'it' ? ',' : '.'), () => act(() => ed.paragraph({ 'line-height': String(x) }))]).concat(['-', ['rotate-ccw', t('automatic'), () => act(() => ed.paragraph({ 'line-height': '' }))]]));
    B.paint = iconBtn('paint-roller', t('painter'), () => { if (W.clip) { W.clip = null; B.paint.on(false); desk.classList.remove('painting'); return; } act(() => { W.clip = ed.copyFormat(); }); if (W.clip) { B.paint.on(true); desk.classList.add('painting'); toast(t('painter_t'), 'neutral'); } });
    B.clear = iconBtn('remove-formatting', t('clear'), () => act(() => ed.inline('clear')), { kbd: 'Mod+\\' });
    B.more = dropBtn('type', t('more_format'), () => [['superscript', t('sup'), () => act(() => ed.inline('superscript')), { check: W.st?.sup }], ['subscript', t('sub'), () => act(() => ed.inline('subscript')), { check: W.st?.sub }], ['code', t('code'), () => act(() => ed.inline('code')), { check: W.st?.code, kbd: 'Mod+E' }], ['a-large-small', t('small_caps'), () => act(() => ed.textStyle('font-variant', 'small-caps'))], '-', ['case-upper', t('case_upper'), () => act(() => ed.changeCase('upper'))], ['case-lower', t('case_lower'), () => act(() => ed.changeCase('lower'))], ['case-sensitive', t('case_title'), () => act(() => ed.changeCase('title'))], ['letter-text', t('case_sentence'), () => act(() => ed.changeCase('sentence'))], '-', ['info', t('call_info'), () => act(() => ed.block('callout', 'info'))], ['lightbulb', t('call_tip'), () => act(() => ed.block('callout', 'tip'))], ['triangle-alert', t('call_warn'), () => act(() => ed.block('callout', 'warn'))], '-', ['sliders-horizontal', t('paragraph'), () => setTab('format')]]);
    const gap = () => h('i.sep');
    put(fmt, B.type, B.font, B.size, gap(), B.bold, B.italic, B.underline, B.strike, B.color, B.mark, B.link, B.more, gap(), B.ul, B.ol, B.check, gap(), B.align, B.lh, iconBtn('indent-decrease', t('outdent'), () => act(() => ed.indent(-1))), iconBtn('indent-increase', t('indent'), () => act(() => ed.indent(1))), gap(), B.paint, B.clear);
    for (const x of [fmt, ins, bubble, objbar]) keepCaret(x);
    W.bub = [['bold', 'bold', 'bold'], ['italic', 'italic', 'italic'], ['underline', 'underline', 'underline'], ['strikethrough', 'strikeThrough', 'strike']].map(([ic, cmd, k]) => Object.assign(iconBtn(ic, t(k), () => act(() => ed.inline(cmd)), { place: 'top' }), { k }));
    put(bubble, W.bub, iconBtn('highlighter', t('highlight'), () => act(() => ed.inline('hiliteColor', '#fff3a3')), { place: 'top' }), iconBtn('link', t('link'), () => linkDialog(W), { place: 'top' }), W.canComment ? iconBtn('message-square', t('c_add'), () => startComment(), { place: 'top' }) : null);
  }
  function readerBubble() { if (!editable && W.canComment) { keepCaret(bubble); put(bubble, can(W.doc.role, 'commenter') ? btn(t('c_send'), { size: 'sm', icon: 'message-square', appearance: 'ghost', onclick: () => startComment() }) : null, btn(t('notes'), { size: 'sm', icon: 'sticky-note', appearance: 'ghost', onclick: () => startComment(true) })); } }

  // "/" menu
  let slashMenu = null, slashAt = null, slashI = 0;
  function slash(s) {
    slashAt = s;
    const close = () => { slashMenu?.remove(); slashMenu = null; };
    if (!s) return close();
    const all = [...TYPES.slice(1, 7).map((k) => [TYPE_ICONS[k], t('s_' + k), () => ed.block(k)]), ['list', t('s_ul'), () => ed.list('ul')], ['list-ordered', t('s_ol'), () => ed.list('ol')], ['list-checks', t('s_check'), () => ed.list('check')], ...listOf().map(([i, l, w]) => [i, l, () => W.insert(w)]), ...CHARTS.map((c) => [CHART_ICONS[c], `${t('chart')}: ${t('ct_' + c)}`, () => W.insert('chart:' + c)]), ...FLOWS.map((c) => [FLOW_ICONS[c], `${t('diagram')}: ${t('fl_' + c)}`, () => W.insert('flow:' + c)])];
    const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), q = norm(s.q.trim()), list = all.filter((x) => norm(x[1]).includes(q)).slice(0, 9);
    if (!list.length) return close();
    if (!slashMenu) { slashMenu = h('div.slash', { popover: 'manual' }); document.body.append(slashMenu); slashMenu.showPopover?.(); slashI = 0; keepCaret(slashMenu); }
    slashI = Math.min(slashI, list.length - 1);
    slashMenu.items = list;
    const m = h('sav-menu', { label: t('insert') }, list.map((x, i) => item(String(i), x[0], x[1])));
    [...m.children].forEach((x, i) => x.toggleAttribute('current', i === slashI));
    m.addEventListener('sav-select', (e) => pickSlash(+e.detail.value));
    put(slashMenu, m);
    const r = s.range.getBoundingClientRect(), hh = Math.min(list.length * 42 + 20, 400);
    slashMenu.style.left = Math.min(innerWidth - 280, r.left) + 'px';
    slashMenu.style.top = (r.bottom + hh > innerHeight - 8 ? Math.max(8, r.top - hh - 8) : r.bottom + 8) + 'px';
    return undefined;
  }
  function pickSlash(i) {
    const x = slashMenu?.items[i], s = slashAt;
    if (!x) return;
    slash(null);
    ed._before = ed.caret();
    s.range.deleteContents();
    const n = s.range.startContainer, b = ed.topOf(n);
    if (b && !b.textContent && !b.querySelector('br,img')) b.append(document.createElement('br'));
    if (b && !b.textContent) ed.collapse(n.nodeType === 1 ? n : n.parentNode);
    ed.scan();
    W.lastCaret = ed.caret() || W.lastCaret;
    x[2]();
  }

  // ------------------------------------------------------------------ keyboard, right click

  function keys(e) {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (slashMenu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { slashI = (slashI + (e.key === 'ArrowDown' ? 1 : -1) + slashMenu.items.length) % slashMenu.items.length; slash(slashAt); return true; }
      if (e.key === 'Enter' || e.key === 'Tab') { pickSlash(slashI); return true; }
      if (e.key === 'Escape') { slash(null); return true; }
    }
    if (mod && k === 'k') { linkDialog(W); return true; }
    if (mod && e.shiftKey && k === 'v') { ed._plain = true; return false; }
    if (mod && e.altKey && e.code === 'KeyM' && W.canComment) { startComment(); return true; }
    if (mod && e.altKey && e.code === 'KeyC') { W.clip = ed.copyFormat(); toast(t('format_copied'), 'neutral'); return true; }
    if (mod && e.altKey && e.code === 'KeyV' && W.clip) { ed.pasteFormat(W.clip); return true; }
    return false;
  }
  const globalKeys = (e) => {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'f') { e.preventDefault(); setTab('find', true); } else if (mod && k === 'p') { e.preventDefault(); if (!lim.noDownload) printDoc(); } else if (mod && k === 's') { e.preventDefault(); if (isLocal) saveLocal(); else W.sync?.flush(); } else if (mod && k === 'j') { e.preventDefault(); W.palette.show(); } else if (e.key === 'Escape') { if (frame.classList.contains('focusing')) focusMode(); if (W.clip && desk.classList.contains('painting')) B.paint.button.click(); }
  };
  addEventListener('keydown', globalKeys);
  desk.addEventListener('mouseup', () => { if (!W.clip || !desk.classList.contains('painting')) return; const r = ed.range(); if (!r || r.collapsed) return; const x = W.clip; W.clip = null; B.paint.on(false); desk.classList.remove('painting'); ed.pasteFormat(x); });
  if (editable) ed.ed.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('td,th'), fig = e.target.closest('figure'), mark = document.getSelection().toString();
    if (!cell && !fig && !mark && !e.target.closest('hr,.toc,.pb')) return; // the menu of the browser has the spelling
    if (mark && !cell && !fig && e.shiftKey) return;
    e.preventDefault();
    const v = e.target.closest('figure,hr,.toc,.pb');
    if (v) ed.select(v);
    W.lastCaret = ed.caret() || W.lastCaret;
    const T = (k, ic, danger) => [ic, t('t_' + k), () => act(() => ed.table(k)), { danger }];
    menuAt(e.clientX, e.clientY, v ? [fig ? ['sliders-horizontal', t('format_tab'), () => setTab('format', true)] : null, fig ? ['copy-plus', t('duplicate_l'), () => ed.do(() => { const c = ed.topOf(v).cloneNode(true); c.removeAttribute('id'); c.classList.remove('sel'); ed.topOf(v).after(c); ed.quiet(() => ed.decorate()); })] : null, ['trash', t('delete'), () => ed.removeSelected(), { danger: true }]] : [mark ? ['scissors', t('cut'), () => act(() => document.execCommand('cut')), { kbd: 'Mod+X' }] : null, mark ? ['copy', t('copy'), () => act(() => document.execCommand('copy')), { kbd: 'Mod+C' }] : null, mark ? ['link', t('link'), () => linkDialog(W)] : null, mark && W.canComment ? ['message-square', t('c_add'), () => startComment()] : null, mark ? ['volume-2', t('read_aloud'), () => speak(mark)] : null, mark && cell ? '-' : null, ...(cell ? [T('rowAbove', 'arrow-up'), T('rowBelow', 'arrow-down'), T('colLeft', 'arrow-left'), T('colRight', 'arrow-right'), '-', ed.cells().length > 1 ? T('merge', 'merge') : null, T('split', 'split'), ['arrow-down-a-z', t('sort_az'), () => act(() => ed.sort(1))], ['sigma', t('t_sum'), () => act(() => ed.sumColumn())], '-', T('delRow', 'trash', true), T('delCol', 'trash', true), T('drop', 'trash', true)] : [])]);
  });
  // a click on the margins or under the text puts the caret where a person expects it
  if (editable) desk.addEventListener('mousedown', (e) => {
    if (ed.ed.contains(e.target) || e.button || e.target.closest('.ruler,.mguide')) return;
    e.preventDefault();
    ed.select(null);
    ed.ed.focus({ preventScroll: true });
    const last = ed.ed.lastElementChild, r = last.getBoundingClientRect(), box = ed.ed.getBoundingClientRect();
    if (e.clientY > r.bottom) { if (last.matches('table,figure,hr,.pb,.toc,.beside,.callout,pre')) { const p = document.createElement('p'); p.append(document.createElement('br')); ed.ed.append(p); ed.collapse(p); ed.scan(); } else ed.collapse(last, true); return; }
    // the empty space after a page break is not a place to write: the caret goes to the end of the text before it, as in Word
    const pb = [...ed.ed.querySelectorAll(':scope > .pb')].find((b) => { const q = b.getBoundingClientRect(); return e.clientY >= q.top - 2 && e.clientY <= q.bottom; });
    if (pb) { const prev = pb.previousElementSibling, next = pb.nextElementSibling; if (prev && !prev.matches('hr,.pb,.toc,figure')) ed.collapse(prev, true); else if (next) ed.collapse(next); return; }
    const x = Math.max(box.left + 2, Math.min(box.right - 2, e.clientX)), c = document.caretPositionFromPoint?.(x, e.clientY), k = c ? [c.offsetNode, c.offset] : ((q) => q && [q.startContainer, q.startOffset])(document.caretRangeFromPoint?.(x, e.clientY));
    // never between two blocks: inside the nearest one
    if (k && k[0] === ed.ed) { const b = ed.ed.children[Math.min(k[1], ed.ed.children.length - 1)]; if (b && !b.matches('hr,.pb,.toc,figure')) ed.collapse(b, k[1] >= ed.ed.children.length); return; }
    if (k && ed.ed.contains(k[0])) getSelection().collapse(...k);
  });

  // header and footer: shown on the margins of every page; a double click there writes them (they live in the Page panel)
  W.bands = (kind = 'header', z = 'c') => {
    if (!editable) return;
    setTab('page', true);
    setTimeout(() => { const box = panel.querySelector('.bands'); box?.scrollIntoView({ block: 'start', behavior: 'smooth' }); panel.querySelector(`[data-band="${kind}-${z}"]`)?.focus?.(); }, 90);
  };
  const bandAt = (e) => {
    const g = ed.pager.g;
    if (!editable || W.fluid || !g) return null;
    for (const [i, sh] of [...ed.pager.sheets.children].entries()) {
      const r = sh.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
      const top = g.mt * W.zoom, low = (g.ph - g.mt - g.hc) * W.zoom, kind = e.clientY < r.top + top ? 'header' : e.clientY > r.bottom - low ? 'footer' : null;
      if (!kind) return null;
      const x = (e.clientX - r.left) / r.width;
      return { kind, page: i + 1, z: x < 1 / 3 ? 'l' : x > 2 / 3 ? 'r' : 'c', left: r.left, width: r.width, top: kind === 'header' ? r.top : r.bottom - low, height: kind === 'header' ? top : low };
    }
    return null;
  };
  const bandHint = h('div.bandhint', { hidden: true, 'aria-hidden': 'true' }, h('span'));
  if (editable) {
    document.body.append(bandHint);
    let hintF = 0;
    desk.addEventListener('mousemove', (e) => { cancelAnimationFrame(hintF); hintF = requestAnimationFrame(() => { const b = e.buttons ? null : bandAt(e); bandHint.hidden = !b; if (!b) return; Object.assign(bandHint.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' }); bandHint.firstChild.textContent = t('band_dbl_' + b.kind); }); });
    desk.addEventListener('mouseleave', () => { bandHint.hidden = true; });
    desk.addEventListener('scroll', () => { bandHint.hidden = true; }, { passive: true });
    desk.addEventListener('dblclick', (e) => { const b = bandAt(e); if (!b) return; e.preventDefault(); getSelection().removeAllRanges(); bandHint.hidden = true; if (b.page === 1 && !ed.settings.firstPage) W.setSettings({ firstPage: true }); W.bands(b.kind, b.z); });
  }

  // ------------------------------------------------------------------ selection: what is on, floating bars

  let lastKey = '';
  function selection(st) {
    W.st = st;
    if (st.inEd) W.lastCaret = ed.caret() || W.lastCaret;
    if (editable) {
      for (const k of ['bold', 'italic', 'underline', 'strike']) B[k].on(st[k]);
      for (const k of ['ul', 'ol', 'check']) B[k].on(k === st.type);
      B.link.on(!!st.link);
      const ty = TYPES.includes(st.type) ? st.type : '';
      if (B.type.value !== ty) B.type.value = ty;
      if (st.font && B.font.value !== st.font) B.font.value = FONTS.includes(st.font) || ed.settings.fonts?.some((f) => f.n === st.font) ? st.font : '';
      const sz = st.size ? String(st.size) : '';
      if (B.size.value !== sz) { if (!SIZES_PT.includes(st.size) && st.size) { B.size.querySelector('[data-x]')?.remove(); B.size.append(h('option', { value: sz, 'data-x': true }, sz)); } B.size.value = sz; }
      undoB.button.disabled = !st.canUndo;
      redoB.button.disabled = !st.canRedo;
      W.bub.forEach((b) => b.on(st[b.k]));
      objectBar(st);
      rulers?.draw();
      const key = st.sel ? 's' + [...ed.ed.querySelectorAll('figure,hr,.toc,.pb')].indexOf(st.sel) : st.cell ? 't' : 'p' + (st.block?.id || '') + st.type;
      // as in SavPresentations: choosing an object (picture, chart, table, line…) opens its Format panel; leaving it goes back to the panel that was open
      if (key !== lastKey) {
        const obj = (key[0] === 's' && !st.sel.matches('.pb')) || key[0] === 't', was = lastKey[0] === 's' || lastKey[0] === 't';
        lastKey = key;
        if (obj && !mobile() && !['comments', 'notes', 'history', 'find'].includes(W.tab)) { if (W.tab !== 'format') { W.backTab = W.tab; setTab('format', true); } else if (!panel.contains(document.activeElement)) drawPanel(); }
        else if (!obj && was && W.tab === 'format' && W.backTab !== undefined) { const k = W.backTab; W.backTab = undefined; if (k) setTab(k, true); else setTab('format'); }
        else if (W.tab === 'format' && !panel.contains(document.activeElement)) drawPanel();
      }
    }
    floatBars();
  }
  function floatBars() {
    const st = W.st || {}, r = ed.range(), touch = matchMedia('(pointer: coarse)').matches;
    const show = r && !r.collapsed && !st.sel && bubble.childElementCount && prefs().bubble !== false && !(touch && editable) && !ed.ed.querySelector('.csel') && r.toString().trim() && !document.querySelector('sav-dialog[open],sav-popover[open]');
    bubble.hidden = !show;
    if (show) over(bubble, r.getBoundingClientRect());
    const target = st.sel || (st.cell && st.cell.isConnected ? st.cell.closest('table') : null), on = editable && objbar.childElementCount && target?.isConnected && (bubble.hidden || !!st.sel) && W.tab !== 'format';
    objbar.hidden = !on;
    if (on) over(objbar, target.getBoundingClientRect(), true);
  }
  function over(bar, r, edge) {
    const box = desk.getBoundingClientRect(), w = bar.offsetWidth, hh = bar.offsetHeight;
    if (r.bottom < box.top + 20 || r.top > box.bottom) { bar.hidden = true; return; }
    let y = r.top - hh - 8;
    if (y < box.top + 26) y = edge ? box.top + 26 : r.bottom + 8;
    bar.style.top = Math.min(y, innerHeight - hh - 60) + 'px';
    bar.style.left = Math.max(box.left + 4, Math.min(box.right - w - 4, r.left + r.width / 2 - w / 2)) + 'px';
  }
  function objectBar(st) {
    const key = st.sel ? 's' + [...ed.ed.querySelectorAll('figure,hr,.toc,.pb')].indexOf(st.sel) + (st.sel.dataset.a || '') + (st.sel.parentNode.dataset?.k || '') : st.cell ? 't' + Math.min(2, ed.cells().length) + st.cell.colSpan + st.cell.rowSpan : '';
    if (key === W.objKey) return;
    W.objKey = key;
    const I = (ic, l, fn, o) => iconBtn(ic, l, fn, { place: 'top', ...o }), T = (k, ic) => I(ic, t('t_' + k), () => act(() => ed.table(k)));
    if (!key) return put(objbar);
    if (!st.sel) return put(objbar, dropBtn('rows-3', t('t_rows'), [['arrow-up', t('t_rowAbove'), () => act(() => ed.table('rowAbove'))], ['arrow-down', t('t_rowBelow'), () => act(() => ed.table('rowBelow'))], ['panel-top', t('t_header'), () => act(() => ed.table('header'))], '-', ['trash', t('t_delRow'), () => act(() => ed.table('delRow')), { danger: true }]]), dropBtn('columns-3', t('t_cols'), [['arrow-left', t('t_colLeft'), () => act(() => ed.table('colLeft'))], ['arrow-right', t('t_colRight'), () => act(() => ed.table('colRight'))], ['ruler', t('t_even'), () => act(() => ed.table('even'))], '-', ['trash', t('t_delCol'), () => act(() => ed.table('delCol')), { danger: true }]]), ed.cells().length > 1 ? T('merge', 'merge') : null, st.cell.colSpan > 1 || st.cell.rowSpan > 1 ? T('split', 'split') : null, colorPop(t('t_fill'), '', (v) => act(() => ed.table('fill', v)), { trigger: h('sav-button', { icon: 'paintbrush', label: t('t_fill'), title: t('t_fill'), size: 'sm', appearance: 'ghost', variant: 'neutral', square: true }), list: PASTEL, none: t('none') }), I('sliders-horizontal', t('format_tab'), () => setTab('format', true)), T('drop', 'trash'));
    const f = st.sel;
    if (!f.matches('figure')) return put(objbar, f.matches('hr,.toc') ? I('sliders-horizontal', t('format_tab'), () => setTab('format', true)) : null, I('trash', t('delete'), () => ed.removeSelected()));
    const box = f.closest('.beside'), set = (fn) => ed.do(() => { fn(); ed.quiet(() => ed.decorate()); ed.dirty.add(ed.topOf(f)); W.objKey = null; });
    return put(objbar, box ? null : [['l', 'left', 'text-align-start'], ['c', 'center', 'text-align-center'], ['r', 'right', 'text-align-end']].map(([k, l, ic]) => { const b = I(ic, t(l), () => set(() => { f.dataset.a = k; })); b.on((f.dataset.a || 'c') === k); return b; }), dropBtn('wrap-text', t('text_around'), () => [['panel-left', t('img_beside_l'), () => ed.besideFigure(f, 'l'), { check: box?.dataset.k === 'l' }], ['panel-right', t('img_beside_r'), () => ed.besideFigure(f, 'r'), { check: box?.dataset.k === 'r' }], ['rows-2', t('img_alone'), () => ed.besideFigure(f, null), { check: !box }]]), I('sliders-horizontal', t('format_tab'), () => setTab('format', true)), I('trash', t('delete'), () => ed.removeSelected()));
  }

  // ------------------------------------------------------------------ outline

  let leftOn = !mobile() && prefs().outline !== false && innerWidth > 1150;
  function toggleLeft() { leftOn = !leftOn; frame.classList.toggle('left-open', leftOn); if (!mobile()) setPrefs({ outline: leftOn }).catch(() => {}); drawLeft(); setTimeout(() => (W.fit ? setZoom('fit', true) : ed.later()), 60); }
  function drawLeft() {
    frame.classList.toggle('left-open', leftOn);
    if (!leftOn) return;
    const list = ed.headings(), key = JSON.stringify(list);
    if (key === left._k) return;
    left._k = key;
    const tree = h('sav-tree', { label: t('outline'), selectable: true }), stack = [{ l: 0, n: tree }];
    for (const x of list) { while (stack.at(-1).l >= x.level) stack.pop(); const n = h('sav-tree-item', { label: x.text.slice(0, 120), value: x.id, expanded: true }); stack.at(-1).n.append(n); stack.push({ l: x.level, n }); }
    tree.addEventListener('sav-select', (e) => { document.getElementById(e.detail.value)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (mobile()) toggleLeft(); });
    put(left, h('div.phead', h('h2', t('outline')), iconBtn('panel-left-close', t('close'), () => toggleLeft())), list.length ? h('div.outl', tree) : h('p.muted.hint.outl', t('outline_empty')));
  }

  // ------------------------------------------------------------------ side panel

  const TABS = [...(editable ? [['elements', 'shapes'], ['format', 'sliders-horizontal'], ['page', 'panel-top'], ['style', 'palette'], ['images', 'images']] : []), ...(isLocal ? [] : [['comments', 'message-square'], ['notes', 'sticky-note']]), ...(editable && !isLocal ? [['history', 'history']] : [])];
  function drawRail() { put(rail, TABS.map(([k, ic]) => h('sav-bottom-nav-item', { label: t('tab_' + k), icon: ic, value: k, badge: k === 'comments' ? W.comments.filter((c) => !c.parent && !c.resolved && !c.private).length || null : null, current: W.tab === k }))); rail.hidden = !TABS.length; }
  rail.addEventListener('sav-select', (e) => { e.stopPropagation(); W.backTab = undefined; setTab(e.detail.value); });
  keepCaret(rail);
  function setTab(name, force) {
    flushSettings();
    W.tab = W.tab === name && !force ? '' : name;
    frame.classList.toggle('has-panel', !!W.tab);
    if (W.tab !== 'find') clearFind();
    drawRail();
    drawPanel();
    floatBars();
    setTimeout(() => (W.fit ? setZoom('fit', true) : ed.later()), 30);
  }
  W.setTab = setTab;
  function drawPanel() {
    W.form = null;
    if (!W.tab) return put(panel);
    const body = h('div.pbody'), name = W.tab;
    W.pbody = body;
    put(panel, h('div.phead', h('h2', t('tab_' + name)), iconBtn('x', t('close'), () => setTab(name))), body);
    if (name === 'elements') put(body, elementsPanel(W));
    else if (name === 'format') { put(body, formatPanel(W)); } else if (name === 'page' || name === 'style') { const s = structuredClone(ed.settings), up = (p) => { Object.assign(s, p); W.setSettings(p); }; W.form = (name === 'page' ? pageForm : styleForm)(s, up); const refresh = W.form.refresh; W.form.refresh = (n) => { Object.assign(s, n); refresh?.(n); }; put(body, W.form); } else if (name === 'images') put(body, imagesPanel(W));
    else if (name === 'find') drawFind();
    else if (name === 'history') drawHistory();
    else drawNotes(name);
    if (['elements', 'format'].includes(name)) keepCaret(body);
    return undefined;
  }

  function clearFind() { CSS.highlights?.delete('sd-find'); CSS.highlights?.delete('sd-find-now'); }
  function drawFind() {
    const q = h('sav-input', { label: t('f_find'), value: getSelection().toString().slice(0, 80).replace(/\n.*/s, ''), clearable: true }), w = h('sav-input', { label: t('f_with') }), cs = h('sav-switch', { size: 'sm' }, t('f_case')), info = h('span.muted');
    let found = [], i = 0;
    const show = () => {
      clearFind();
      info.textContent = q.value ? (found.length ? t('f_count', { n: i + 1, m: found.length }) : t('no_match')) : '';
      if (!found.length) return;
      if (CSS.highlights) { CSS.highlights.set('sd-find', new Highlight(...found)); CSS.highlights.set('sd-find-now', new Highlight(found[i])); }
      const r = found[i].getBoundingClientRect(), b = desk.getBoundingClientRect();
      if (r.top < b.top + 60 || r.bottom > b.bottom - 60) desk.scrollBy({ top: r.top - b.top - b.height / 3 });
    };
    const run = () => { ed.scan(); found = ed.find(q.value, { matchCase: cs.checked }); i = Math.min(i, Math.max(0, found.length - 1)); show(); };
    const go = (d) => { run(); if (found.length) { i = (i + d + found.length) % found.length; show(); } };
    q.addEventListener('input', () => { i = 0; run(); });
    q.addEventListener('sav-clear', run);
    cs.addEventListener('change', run);
    q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') setTab('find'); });
    put(W.pbody, h('div.form', q, h('div.prow', info, h('span.grow'), iconBtn('chevron-left', t('previous'), () => go(-1)), iconBtn('chevron-right', t('next'), () => go(1))), cs, editable ? [w, h('div.prow.wrap', btn(t('f_one'), { size: 'sm', onclick: () => { if (found[i]) { ed.replace([found[i]], w.value); run(); } } }), btn(t('f_all'), { size: 'sm', variant: 'primary', onclick: () => { run(); const n = found.length; ed.replace(found, w.value); run(); if (n) toast(t('replaced', { n }), 'success'); } }))] : null));
    setTimeout(() => { q.focus?.(); run(); }, 60);
  }

  async function drawHistory() {
    const body = W.pbody;
    put(body, h('sav-spinner'));
    try {
      await W.sync?.flush();
      const { versions } = await api('version.list', undefined, { doc: pid });
      if (body !== W.pbody) return;
      put(body, btn(t('h_save'), { icon: 'history', size: 'sm', block: true, onclick: async () => { const n = await ask(t('h_save'), t('h_name')); if (n) { await W.sync.flush(); await api('version.save', { doc: pid, name: n }); drawHistory(); } } }),
        versions.length ? h('div.stack.versions', versions.map((v) => tile(v.name || when(v.at), () => preview(v).catch(fail), { class: 'version' }, h('strong', v.name || new Date(v.at).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' })), h('span.muted.small', `${v.name ? when(v.at) : t('h_auto')} · ${v.words} ${t('words')}${v.by ? ' · ' + v.by : ''}`)))) : empty('history', t('h_none'), t('h_none_t')));
    } catch (e) { put(body, h('p.muted', errText(e))); }
  }
  async function preview(v) {
    const { content } = await api('version.get', undefined, { doc: pid, id: v.id }), box = h('div.vpreview'), pp = h('div.paper');
    box.append(pp);
    dialog({ title: v.name || when(v.at), width: '56rem', body: box, actions: [{ label: t('close') }, { label: t('h_restore'), icon: 'rotate-ccw', primary: true, run: async () => { if (!(await confirm(t('h_restore'), t('h_restore_t'), t('restore'), false))) return false; await W.sync.flush(); await api('version.restore', { doc: pid, id: v.id }); toast(t('h_restored'), 'success'); reload(); return undefined; } }], onclose: () => e2.destroy() });
    const e2 = new Editor(pp, { editable: false, labels: {}, imageUrl: (id) => store.imageUrl(id), zoom: () => parseFloat(pp.style.zoom) || 1, onChange() {} });
    setTimeout(() => { e2.load(content, v.title); pp.style.zoom = Math.min(1, (box.clientWidth - 30) / parseFloat(pp.style.getPropertyValue('--pw'))); e2.later(); }, 60);
  }

  // ------------------------------------------------------------------ comments and personal notes

  let showDone = false;
  async function refreshComments() { try { setComments(await api('comment.list', undefined, { doc: pid })); } catch { /* next time */ } }
  function setComments(r) { W.comments = r.comments; if (W.sync) W.sync.stamp = r.stamp; drawRail(); drawComments(); if (['comments', 'notes'].includes(W.tab) && !panel.querySelector('sav-textarea:focus-within')) drawNotes(W.tab); }
  function drawComments() {
    if (!CSS.highlights) return;
    const find = (c) => { const b = c.quote && document.getElementById('b-' + c.block); return b ? ed.find(c.quote, { matchCase: true, block: b }).slice(0, 1) : []; }, open = W.comments.filter((c) => !c.parent && !c.resolved);
    CSS.highlights.set('sd-comment', new Highlight(...open.filter((c) => !c.private).flatMap(find)));
    CSS.highlights.set('sd-note', new Highlight(...open.filter((c) => c.private).flatMap(find)));
  }
  function startComment(priv) {
    const r = ed.range(), b = ed.selected()[0];
    if (!r || !b) return;
    W.draft = { block: b.id.slice(2), quote: r.toString().split('\n')[0].trim().slice(0, 300) };
    setTab(priv ? 'notes' : 'comments', true);
    setTimeout(() => W.pbody.querySelector('sav-textarea')?.focus(), 80);
  }
  function drawNotes(name) {
    const body = W.pbody, priv = name === 'notes';
    if (!S.user) return put(body, empty(priv ? 'sticky-note' : 'message-square', t('c_signin_h'), t('c_signin'), primary(t('sign_in'), { href: '#/signin' })));
    const mayAdd = W.canComment && (priv || can(W.doc.role, 'commenter')), roots = W.comments.filter((c) => !c.parent && c.private === priv && (showDone || !c.resolved)), ta = h('sav-textarea', { placeholder: t(priv ? 'n_new' : 'c_new'), rows: 3, maxlength: 4000, size: 'sm' });
    const send = async () => { const v = ta.value.trim(); if (!v) return; const r = await api('comment.add', { doc: pid, body: v, private: priv, ...(W.draft || {}) }); W.draft = null; setComments(r); drawNotes(name); };
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send().catch(fail); });
    const one = (c) => {
      const b = c.block && document.getElementById('b-' + c.block), reply = c.parent ? null : W.comments.filter((x) => x.parent === c.id);
      const inner = [h('div.chead', face(c.by, null, 28), h('div.grow', h('strong', c.mine ? t('you') : c.by), h('span.muted.small', when(c.at))), c.parent || c.private ? null : iconBtn(c.resolved ? 'rotate-ccw' : 'check', t(c.resolved ? 'c_reopen' : 'c_resolve'), () => api('comment.resolve', { doc: pid, id: c.id, on: !c.resolved }).then(setComments)), c.mine || (W.doc.role === 'owner' && !c.private) ? iconBtn('trash', t('delete'), () => api('comment.delete', { doc: pid, id: c.id }).then(setComments)) : null),
        c.quote ? btn(b ? c.quote.slice(0, 120) : t('c_gone'), { size: 'sm', appearance: 'ghost', icon: 'text-quote', class: 'quoteb', onclick: () => { if (!b) return; b.scrollIntoView({ behavior: 'smooth', block: 'center' }); b.animate([{ background: '#fbe6dd' }, { background: 'transparent' }], 1400); } }) : null, h('p.cbody', c.body)];
      if (c.parent) return h('div.reply', inner);
      const box = h('sav-input', { placeholder: t('c_reply'), size: 'sm' });
      box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && box.value.trim()) api('comment.add', { doc: pid, parent: c.id, body: box.value.trim() }).then(setComments).catch(fail); });
      return h('sav-card.comment' + (c.resolved ? '.done' : ''), h('div.stack', inner, reply.map(one), !c.private && can(W.doc.role, 'commenter') && W.canComment ? box : null));
    };
    return put(body, mayAdd ? h('div.form', W.draft?.quote ? h('sav-alert', { variant: 'primary', noicon: true }, '“' + W.draft.quote + '”') : null, ta, h('div.prow', h('span.grow'), primary(t(priv ? 'n_add' : 'c_send'), { size: 'sm', onclick: send }))) : null, roots.length ? h('div.stack.clist', roots.map(one)) : empty(priv ? 'sticky-note' : 'message-square', t(priv ? 'n_none' : 'c_none'), t(priv ? 'n_none_t' : 'c_none_t')), !priv && W.comments.some((c) => c.resolved) ? toggle(t('c_resolved'), showDone, (v) => { showDone = v; drawNotes(name); }) : null);
  }

  // ------------------------------------------------------------------ files, print, menu

  async function bundle() {
    flushSettings();
    ed.scan();
    const snap = ed.snapshot(), images = {};
    for (const id of imageIds(snap.blocks)) { const b = await store.imageBlob(id).catch(() => null); if (b) images[id] = b; }
    return { title: ed.title, settings: snap.settings, blocks: snap.blocks, images };
  }
  W.bundle = bundle;
  // SavDrive: the cloud next to the grid of the apps saves this file into the drive (../assets/savoffice/savoffice.js)
  if (!lim.noDownload) window.SavOffice?.exporter?.({ key: pid, make: async () => { const b = await bundle(); return { blob: await toSavdoc(b), name: fileName(b.title, 'savdoc') }; } });
  async function save(kind) {
    const n = toast(t('preparing'), 'neutral', { duration: 0 });
    try {
      const b = await bundle();
      // PDF: the file itself; where the browser does not allow drawing the pages (some Safari), the print window as before
      const make = { pdf: () => pdfFile().catch((e) => { console.warn(e); n.remove(); toast(t('pdf_hint'), 'neutral'); printDoc(); return null; }), savdoc: () => toSavdoc(b), docx: async () => (await import('./docx.js')).toDocx(b), odt: async () => (await import('./odf.js')).toOdt(b), doc: async () => (await import('./odf.js')).toDoc(b), html: () => toHtml(b), epub: () => toEpub(b), md: () => toMarkdown(b), txt: () => toText(b) };
      const out = await make[kind]();
      if (out) download(out, fileName(b.title, kind));
    } finally { n.remove(); }
  }
  /** The pages exactly as on screen, ready to be printed or written as PDF; end() takes them away. */
  async function printable() {
    flushSettings();
    ed.scan();
    ed.select(null);
    const z = W.zoom, fluid = W.fluid;
    W.fluid = false;
    ed.dress();
    paper.style.zoom = 1;
    W.zoom = 1;
    ed.layout();
    await Promise.all([...ed.ed.querySelectorAll('img')].map((i) => i.decode?.().catch(() => {})));
    ed.layout();
    const pages = ed.pager.printable(ed.settings, ed.title), [w, hh] = [pages.style.getPropertyValue('--pw'), pages.style.getPropertyValue('--ph')];
    W.fluid = fluid;
    ed.dress();
    paper.style.zoom = z;
    W.zoom = z;
    ed.layout();
    const st = h('style');
    st.textContent = `@page { size: ${parseFloat(w) / 96}in ${parseFloat(hh) / 96}in; margin: 0; }`;
    document.head.append(st);
    document.body.append(pages);
    await Promise.all([...pages.querySelectorAll('img')].map((i) => i.decode?.().catch(() => {})));
    return { pages, end: () => { pages.remove(); st.remove(); document.body.classList.remove('printing'); } };
  }
  async function printDoc() {
    const { pages, end } = await printable();
    document.body.classList.add('printing');
    const done = () => { end(); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    W.printing = pages;
    if (!W.noPrint) window.print();
  }
  /** Save as PDF: the file itself, without the print window (as in SavPresentations). */
  async function pdfFile() {
    const { pages, end } = await printable();
    pages.classList.add('pdfwork');
    try { return await (await import('./pdf.js')).toPdf(pages, ed.title, ed.settings); } finally { end(); }
  }
  W.printDoc = printDoc;
  async function toAccount() { const b = await bundle(), id = await keep(b); await local.remove(pid); toast(t('saved_account'), 'success'); W.close(); location.hash = '#/d/' + id; }
  const speaking = () => window.speechSynthesis?.speaking;
  function speak(txt) {
    const syn = window.speechSynthesis;
    if (!syn) return toast(t('no_speech'), 'warning');
    if (speaking() && !txt) { syn.cancel(); return undefined; }
    syn.cancel();
    const all = txt || (() => { const l = [...ed.ed.children], i = Math.max(0, l.indexOf(ed.selected()[0])); return l.slice(i).map((b) => b.innerText).join('\n'); })();
    for (const part of all.match(/[^.!?\n]+[.!?\n]*/g) || []) { if (!part.trim()) continue; const u = new SpeechSynthesisUtterance(part); u.lang = ed.settings.lang; syn.speak(u); }
    toast(t('reading_now'), 'neutral');
    return undefined;
  }
  function countsDialog() {
    W.counts = ed.counts();
    const c = W.counts, text = [...ed.ed.children].filter((b) => !b.matches('.toc,.pb')).map((b) => b.innerText).join('\n'), sent = Math.max(1, (text.match(/[.!?…]+(\s|$)/g) || []).length), letters = (text.match(/\p{L}/gu) || []).length;
    const it = ed.settings.lang === 'it', score = !c.words ? null : it ? Math.round(89 + (300 * sent - 10 * letters) / c.words) : ed.settings.lang === 'en' ? Math.round(206.835 - 1.015 * (c.words / sent) - 84.6 * ((text.match(/[aeiouy]+/gi) || []).length / c.words)) : null, clamp = score === null ? null : Math.max(0, Math.min(100, score));
    const sel = getSelection().toString().trim(), goal = num(t('goal'), +localStorage.getItem('savdocuments-goal-' + pid) || '', (v) => { if (v) localStorage.setItem('savdocuments-goal-' + pid, v); else localStorage.removeItem('savdocuments-goal-' + pid); W.countsDirty = true; ed.later(); }, { min: 0, max: 1e6, step: 100, empty: true, size: 'md' });
    const stat = (v, l) => h('sav-stat', { label: l, value: typeof v === 'number' ? v.toLocaleString(getLang()) : v });
    dialog({ title: t('counts'), width: '34rem', body: h('div.form', h('div.stats', stat(c.words, t('words_l')), stat(c.chars, t('characters_l')), stat(W.fluid ? '–' : ed.pager.pages, t('pages_l')), stat(ed.ed.querySelectorAll('p,li').length, t('paragraphs_l')), stat(sent, t('sentences_l')), stat(`${Math.max(1, Math.round(c.words / 220))}'`, t('reading_l'))), sel ? h('p.muted', t('sel_counts', { n: (sel.match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu) || []).length, m: sel.length })) : null, clamp === null ? null : h('div', h('span.flabel', `${t('readability')}: ${clamp}/100 · ${t(clamp > 79 ? 'rd_easy' : clamp > 59 ? 'rd_mid' : clamp > 39 ? 'rd_hard' : 'rd_very')}`), h('sav-progress-bar', { value: clamp, max: 100 })), goal), actions: [{ label: t('done'), primary: true }] });
  }
  function shortcuts() {
    const L = [[t('bold'), 'Mod+B'], [t('italic'), 'Mod+I'], [t('underline'), 'Mod+U'], [t('strike'), 'Mod+Shift+X'], [t('code'), 'Mod+E'], [t('link'), 'Mod+K'], [t('clear'), 'Mod+\\'], [t('s_h1') + '…4', 'Mod+Alt+1…4'], [t('s_p'), 'Mod+Alt+0'], [t('s_ol'), 'Mod+Shift+7'], [t('s_ul'), 'Mod+Shift+8'], [t('s_check'), 'Mod+Shift+9'], [t('left') + ' / ' + t('center') + ' / ' + t('right') + ' / ' + t('justify'), 'Mod+Shift+L E R J'], [t('indent'), 'Mod+]'], [t('copy_format'), 'Mod+Alt+C'], [t('paste_format'), 'Mod+Alt+V'], [t('paste_plain'), 'Mod+Shift+V'], [t('page_break'), 'Mod+Enter'], [t('c_add'), 'Mod+Alt+M'], [t('find'), 'Mod+F'], [t('palette_l'), 'Mod+J'], [t('insert'), '/'], [t('undo'), 'Mod+Z'], [t('redo'), 'Mod+Shift+Z'], [t('print'), 'Mod+P']];
    dialog({ title: t('shortcuts'), width: '34rem', body: h('div.keys', L.map(([l, k]) => [h('span', l), h('kbd', K(k))])) });
  }
  /** SavBooks, next door, makes a new book from this document (it reads it with the same sign-in): the document does not change. */
  const toBook = async () => { await W.sync?.flush(); window.open(new URL('../savbooks/#/from/' + pid, location.href.split('#')[0]).href, '_blank', 'noopener'); };
  const duplicate = async () => { await W.sync?.flush(); const r = await api('doc.duplicate', { doc: pid, title: `${t('copy_of')} ${ed.title}`.slice(0, 160) }); location.hash = '#/d/' + r.doc.id; };
  const owner = data.doc.role === 'owner';
  function moreItems() {
    return [...(mobile() && !S.user ? [['log-in', t('sign_in'), () => { location.hash = '#/signin'; }], '-'] : []), ['search', t('find'), () => setTab('find', true), { kbd: 'Mod+F' }], editable && !isLocal ? ['history', t('history'), () => setTab('history', true)] : null, ['volume-2', speaking() ? t('stop_reading') : t('read_aloud'), () => speak()], editable ? ['maximize', t('focus'), () => focusMode()] : null, ['tally-5', t('counts'), () => countsDialog()], '-', ...dlItems(), !isLocal && S.user && !data.doc.review && !lim.noCopy ? ['book-open', t('to_book'), () => toBook()] : null, lim.noDownload ? null : ['printer', t('print'), () => printDoc(), { kbd: 'Mod+P' }], ['file-up', t('open_'), () => importFile()], !isLocal && S.user && !data.doc.review && !lim.noCopy ? ['copy', t('duplicate'), () => duplicate()] : null, owner && !isLocal ? ['layout-template', t('as_template'), async () => { await setPrefs({ templates: [...new Set([...(prefs().templates || []), pid])].slice(-30) }); toast(t('as_template_done'), 'success'); }] : null, editable && !mobile() ? ['settings-2', t('toolbar_edit'), () => toolsDialog()] : null, ['keyboard', t('shortcuts'), () => shortcuts()], !isLocal ? ['link', t('copy_link'), () => copyText(location.href)] : null, !isLocal && !owner && !data.doc.review ? ['flag', t('report'), () => reportDialog(pid)] : null, owner && !isLocal && !data.doc.deleted ? '-' : null, owner && !isLocal && !data.doc.deleted ? ['trash', t('to_trash'), async () => { await W.sync?.flush(); await api('doc.trash', { doc: pid }); toast(t('moved_trash')); location.hash = '#/'; }, { danger: true }] : null];
  }

  // command palette
  const pal = (W.palette = h('sav-command', { placeholder: t('palette_ph'), 'empty-label': t('no_match'), label: t('palette_l') })), cmds = {};
  const group = (label, list) => { const g = h('optgroup', { label }); list.filter(Boolean).forEach(([ic, l, fn, o], i) => { const id = label + i; cmds[id] = fn; g.append(h('option', { value: id, 'data-icon': ic, 'data-shortcut': o?.kbd ? K(o.kbd) : null }, l)); }); pal.append(g); };
  if (editable) {
    group(t('insert'), [...listOf().map(([i, l, w]) => [i, l, () => W.insert(w)]), ...CHARTS.map((c) => [CHART_ICONS[c], `${t('chart')}: ${t('ct_' + c)}`, () => W.insert('chart:' + c)]), ...FLOWS.map((c) => [FLOW_ICONS[c], `${t('diagram')}: ${t('fl_' + c)}`, () => W.insert('flow:' + c)])]);
    group(t('styles'), [...TYPES.map((k) => [TYPE_ICONS[k], t('s_' + k), () => act(() => ed.block(k))]), ['list', t('s_ul'), () => act(() => ed.list('ul'))], ['list-ordered', t('s_ol'), () => act(() => ed.list('ol'))], ['list-checks', t('s_check'), () => act(() => ed.list('check'))]]);
    group(t('panels'), TABS.map(([k, ic]) => [ic, t('tab_' + k), () => setTab(k, true)]));
  }
  group(t('tools'), [...moreItems().filter((x) => Array.isArray(x)), ['list-tree', t('outline'), () => toggleLeft()]]);
  pal.addEventListener('sav-select', (e) => { const fn = cmds[e.detail.value]; if (fn) setTimeout(() => { const r = fn(); if (r?.catch) r.catch(fail); }, 80); });
  document.body.append(pal);

  // ------------------------------------------------------------------ beginning and end

  buildToolbars();
  readerBubble();
  useFonts(data.content.settings);
  ed.load(data.content, data.doc.title);
  firstZoom();
  showRulers();
  if (!isLocal && !data.doc.review && !data.doc.deleted) {
    W.sync = new Sync({ pid, rev: data.doc.rev, role: data.doc.role, editor: ed, stamp: data.stamp, on: {
      state: (s) => setState(s), people: (p) => setPeople(p), title: (x) => { title.value = x; document.title = x + ' – SavDocuments'; }, comments: () => refreshComments(),
      role: () => { toast(t('role_changed'), 'warning'); reload(); }, reload: () => { toast(t('reloaded')); reload(); }, error: (e) => { toast(errText(e), 'danger', { duration: 0 }); setState('offline'); },
    } });
    if (editable && W.sync.recover()) toast(t('recovered'), 'success');
  }
  setState('saved');
  drawRail();
  drawLeft();
  if (editable) { selection(ed.state()); if (!matchMedia('(pointer: coarse)').matches) { ed.ed.focus({ preventScroll: true }); const f = ed.ed.firstElementChild; ed.collapse(f.matches('table') ? ed.ed.querySelector('td,th') : f); } }
  if (data.doc.deleted) toast(t('err_doc_in_trash'), 'warning');
  const unload = (e) => { flushSettings(); ed.scan(); if (W.sync?.pending || saveT) { W.sync?.flush(); e.preventDefault(); } };
  addEventListener('beforeunload', unload);
  W.close = () => {
    window.SavOffice?.exporter?.(null);
    flushSettings();
    ed.scan();
    if (saveT) saveLocal();
    if (!isLocal && !data.doc.review && !data.doc.deleted && S.user) offline.put('doc:' + pid, { ...data, doc: { ...W.doc, title: ed.title, rev: W.sync?.rev ?? data.doc.rev }, content: ed.snapshot(), comments: W.comments || [] });
    W.sync?.flush().finally(() => W.sync.stop());
    ed.destroy();
    rulers?.destroy();
    ro.disconnect();
    slashMenu?.remove();
    bandHint.remove();
    pal.remove();
    window.speechSynthesis?.cancel();
    clearTimeout(W.outT);
    removeEventListener('keydown', globalKeys);
    removeEventListener('beforeunload', unload);
    for (const k of ['sd-find', 'sd-find-now', 'sd-comment', 'sd-note']) CSS.highlights?.delete(k);
  };
  window.__writer = W;
  return W;
}
