/** The screen of a presentation: editing for who can, looking (with comments and personal notes) for the others. */
import { state, api, get, h, icon, btn, iconBtn, item, tile, isApp, openLink, segmented, $, $$, clamp, uid, go, oops, ok, toast, errText, mobile, isMac, userSetting, dialog, confirmBox, promptBox, uploadPicture, copyText, fileName } from './core.js';
import { t } from './i18n.js';
import { brand, logo } from './auth.js';
import { userMenu } from './home.js';
import { Deck, fixSlide } from './model.js';
import { context, slideContext, styleOf, FORMATS } from './themes.js';
import { slideNode, thumb, sorted } from './render.js';
import { makeSlide, relayout } from './layouts.js';
import { createStage } from './stage.js';
import { elementsPanel, propsPanel, pagePanel, pickIcon, layoutsPanel, themePanel, mediaPanel, optionsBody } from './panels.js';
import { createMarks } from './marks.js';
import { startShow, videoNode } from './present.js';
import { shareDialog, reportDialog, deckUrl } from './share.js';
import { pickPicture, pickVideo, uploadFiles } from './media.js';
import { downloadMenu } from './files.js';
import { addFeatures } from './features.js';
import { SHAPES } from './shapes.js';
import { sampleChart, sampleTable, CHARTS, CHART_ICONS } from './parts.js';
import { gridPanel, GRIDS, gridOf, firstFree, cellRect, arrange, inCell, readAll, growGrid, nextGrid, assign, makeRoom } from './grid.js';
import { pageRulesDialog, pageName } from './pages.js';
import { plain, textToHtml, fragment, serialize, okLink } from './richtext.js';

export async function deckScreen(app, deckId, q) {
  document.body.classList.add('ed');
  app.append(h('div.center', h('sav-spinner', { style: 'font-size:2rem' })));
  let data;
  const localId = q.get('l') || '';
  state.local = localId;
  if (localId) { // a presentation of this browser
    const L = await import('./local.js'), x = await L.local.get(localId);
    if (!x) { app.replaceChildren(h('header.htop', brand(), h('div.spacer')), h('div.center', h('sav-empty-state', { heading: t('cant_open'), text: t('local_missing'), icon: 'hard-drive' }, btn(t('on_device'), () => go('?p=local'))))); return; }
    await L.loadUrls(L.mediaOf(x));
    data = { deck: { uid: 'l' + x.id, title: x.title, meta: x.meta, seq: 0, slides: x.slides, status: 'active', access: 'private', perms: {}, ruled: [] }, role: 'owner' };
  } else try { data = await get('deck.get', { d: deckId }); (await import('./local.js')).cache.set('deck:' + deckId, data); } catch (e) {
    // no connection: the copy of the last visit, changes leave when the connection comes back
    const old = e.network && (await (await import('./local.js')).cache.get('deck:' + deckId));
    if (old) { data = old; setTimeout(() => toast(t('offline_open'), 'warning'), 600); } else {
    const signIn = e.status === 401;
    app.replaceChildren(h('header.htop', brand(), h('div.spacer'), state.user && userMenu()), h('div.center', h('sav-empty-state', { heading: signIn ? t('need_sign_in') : t('cant_open'), text: e.network ? t('err_network') : errText(e), icon: signIn ? 'lock' : 'presentation' }, signIn ? btn(t('sign_in'), () => { sessionStorage.setItem('sp-back', location.pathname + location.search); go('?signin=login'); }) : btn(t('home'), () => go('./')))));
    return;
    }
  }
  app.textContent = '';
  const deck = new Deck(data.deck, data.role);
  deck.local = localId;
  if (localId) deck.created = (await (await import('./local.js')).local.get(localId)).created;
  const ed = { deck, user: state.user, sel: new Set(), sid: deck.order()[0]?.sid || '', tab: '', editing: null, closeText() {}, root: app, editor: deck.canWrite, get edit() { return deck.canEditPage(this.sid); }, simple: userSetting('simple', false), relayout: false };
  ed.ctx = context(deck.meta);
  document.title = deck.title + ' – SavPresentations';
  if (q.get('slide') && deck.slide(q.get('slide'))) ed.sid = q.get('slide');

  // ------------------------------------------------------------------ frame
  const stage = ed.stage = createStage(ed), marks = ed.marks = createMarks(ed);
  ed.drawPins = marks.pins;
  const title = h('sav-input.dtitle', { value: deck.title, maxlength: 150, readonly: !deck.canEdit, size: 'sm', 'aria-label': t('title'), onchange: () => { const v = title.value.trim(); if (v) deck.do({ k: 'deck.set', p: { title: v } }); else title.value = deck.title; }, onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') title.blur(); } });
  const status = h('span.status', { role: 'status' }), people = h('div.people-now'), undoB = iconBtn('undo-2', t('undo'), () => deck.undo()), redoB = iconBtn('redo-2', t('redo'), () => deck.redo());
  const zoomEl = h('sav-zoom', { value: 100, min: 10, max: 500, step: 10, size: 'sm', appearance: 'plain' });
  let zoomSet = false;
  zoomEl.addEventListener('change', (e) => { if (!zoomSet) stage.setZoom((e.detail?.value ?? zoomEl.value) / 100); });
  ed.onZoom = (v) => { zoomSet = true; zoomEl.value = v; zoomSet = false; };
  const menu = h('sav-dropdown', { placement: 'bottom-end', 'sheet-on-mobile': true, label: deck.title }, h('sav-button', { slot: 'trigger', icon: 'ellipsis-vertical', appearance: 'ghost', variant: 'neutral', square: true, label: t('more') }));
  const fillMenu = () => { const e = deck.canEdit; menu.querySelectorAll(':not([slot="trigger"])').forEach((x) => { if (x.parentElement === menu) x.remove(); }); menu.append(...[e && item('options', 'settings', t('deck_options')), e && !deck.limited && !deck.local && item('vers', 'history', t('versions')), e && h('sav-divider'), item('over', 'layout-grid', t('overview')), item('find', 'search', t('find_replace')), e && item('text', 'file-text', t('add_from_text')), e && item('credits', 'copyright', t('credits_slide')), h('sav-divider'), (e || deck.meta.opts.download !== false) && item('dl', 'download', t('download')), !deck.local && state.user && (e || deck.meta.opts.copy !== false) && item('copy', 'copy', t('make_copy')), !deck.local && item('link', 'link', t('copy_link')), deck.local && state.user && item('upload', 'cloud-upload', t('move_to_account')), h('sav-divider'), ed.editor && item('mode', 'arrow-left-right', t('mode_change')), !mobile() && item('tools', 'settings-2', window.SavOffice?.bars ? window.SavOffice.bars.menuLabel() : t('toolbar_edit')), item('keys', 'keyboard', t('shortcuts')), deck.role !== 'owner' && item('report', 'flag', t('report'), { variant: 'danger' })].filter(Boolean)); };
  fillMenu();
  ed.options = () => dialog(t('deck_options'), optionsBody(ed), [[t('done'), true]], { width: '40rem' });
  ed.download = () => downloadMenu(ed);
  ed.share = () => shareDialog(deck.uid, deck.title, ed); // also from the palette (⌘J)
  ed.copyLink = () => copyText(deckUrl(deck.uid));
  // SavDrive: the cloud next to the grid of the apps saves this presentation into the drive (../assets/savoffice/savoffice.js)
  if (deck.canEdit || deck.meta.opts?.download !== false) window.SavOffice?.exporter?.({ key: localId ? 'l' + localId : deckId, make: async () => ({ blob: await (await import('./files.js')).makeSavpre(ed.deck), name: fileName(ed.deck.title, 'savpre') }) });
  menu.addEventListener('sav-select', async (e) => {
    try {
      switch (e.detail.value) {
        case 'mode': return void modeDialog();
        case 'options': return void ed.options();
        case 'over': return void ed.overview();
        case 'find': return void ed.findReplace();
        case 'text': return void ed.fromText();
        case 'vers': return void ed.versions();
        case 'tools': return void toolsDialog();
        case 'upload': { const { moveToAccount } = await import('./home.js'); await deck.saveLocal(true); const r = await moveToAccount(deck.local); if (r) go('?d=' + r); return; }
        case 'dl': return void downloadMenu(ed);
        case 'copy': { const r = await api('deck.duplicate', { d: deck.uid, title: t('copy_of', { title: deck.title }) }); return go('?d=' + r.uid); }
        case 'credits': return ed.creditsSlide();
        case 'link': return copyText(deckUrl(deck.uid));
        case 'keys': return void shortcuts();
        case 'report': return void reportDialog(deck.uid);
      }
    } catch (x) { oops(x); }
  });
  /** Simple mode: pages are grids, elements go into the cells. Advanced: everything moves freely. It is a choice of each person. */
  /** The column of the pages can be hidden, for more room; it is remembered in this browser. */
  const toggleStrip = () => { const off = !app.classList.contains('nostrip'); app.classList.toggle('nostrip', off); localStorage.setItem('sp-strip', off ? 'off' : ''); };
  if (localStorage.getItem('sp-strip') === 'off' && !mobile()) app.classList.add('nostrip');
  /** Choosing the mode: what each one is, side by side. */
  function modeDialog() {
    let dlg;
    const card = (v, ic, title, text, points) => tile(title, () => { ed.setMode(v === 'simple'); dlg.close(); }, { class: 'modecard' + ((v === 'simple') === ed.simple ? ' on' : '') }, h('div.modec', icon(ic), h('b', title), h('p.muted', text), h('ul', ...points.map((p) => h('li', p))), (v === 'simple') === ed.simple && h('sav-badge', { appearance: 'soft', variant: 'primary' }, t('mode_now'))));
    dialog(t('mode_change'), h('div.stack', h('p.muted', t('mode_change_t')), h('div.modes', card('simple', 'layout-grid', t('mode_simple'), t('mode_simple_long'), [t('mode_simple_1'), t('mode_simple_2'), t('mode_simple_3')]), card('adv', 'move', t('mode_adv'), t('mode_adv_long'), [t('mode_adv_1'), t('mode_adv_2'), t('mode_adv_3')]))), [], { width: '40rem', ref: (d) => (dlg = d) });
  }
  /** Simple or advanced, at the bottom right as in the settings: a choice of each person, it follows them everywhere. */
  const modeSw = segmented(t('mode'), ed.simple ? 'simple' : 'adv', [['simple', 'layout-grid', t('mode_simple') + ' · ' + t('mode_simple_t')], ['adv', 'move', t('mode_adv') + ' · ' + t('mode_adv_t')]], (v) => ed.setMode(v === 'simple'));
  modeSw.classList.add('modesw');
  modeSw.setAttribute('title', t('mode'));
  ed.setMode = (simple) => {
    if (ed.simple === simple) return;
    ed.closeText(); ed.simple = simple; fillMenu(); modeSw.value = simple ? 'simple' : 'adv';
    app.classList.toggle('simple', simple);
    // what was drawn freely becomes cells, without moving
    if (simple) { const n = readAll(ed); if (n) toast(t('grid_done', { n })); }
    ed.select([]); stage.draw(); drawRail();
    setTab(simple ? 'grid' : ed.tab === 'grid' ? 'elements' : ed.tab);
    if (state.user && !state.offline) api('auth.settings', { settings: { simple } }).then((r) => { state.user = r.user; }).catch(() => {});
  };
  // ------------------------------------------------------------------ toolbar: every button adds something to the page
  const dropTool = (ic, label, items) => { const d = h('sav-dropdown', { label }, h('sav-button', { slot: 'trigger', icon: ic, caret: true, appearance: 'ghost', variant: 'neutral', size: 'sm', label }, h('span.insl', label)), ...items); d.addEventListener('sav-select', (e) => ed.insert(e.detail.value)); return d; };
  const addTool = (ic, label, what) => h('sav-tooltip', { content: label, placement: 'bottom', delay: 350 }, h('sav-button', { icon: ic, appearance: 'ghost', variant: 'neutral', size: 'sm', onclick: () => (typeof what === 'function' ? what() : ed.insert(what)), label }, h('span.insl', label)));
  const drawn = { rect: 'square', round: 'rectangle-horizontal', ellipse: 'circle', triangle: 'triangle', diamond: 'diamond', star: 'star', hexagon: 'hexagon', arrow: 'arrow-right', speech: 'message-square', heart: 'heart', cloud: 'cloud', plus: 'plus' };
  /** The bars chosen (⋮ → Customise the bars): with the account, in this browser for who has none. */
  const barsSaved = () => (state.user ? userSetting('bars', {}) : (() => { try { return JSON.parse(localStorage.getItem('savpresentations-bars') || '{}'); } catch { return {}; } })()) || {};
  /** A bar as each person chose it: its list, in order, with '|' a separator, '_' a fixed space and '~' an adaptive one
   *  (SavOffice.bars); what it has at first when nothing was chosen. */
  const BARS = window.SavOffice?.bars;
  const barPick = (id, def, items, old) => { const v = barsSaved()[id] ?? old; return BARS ? BARS.pick(v, def, items) : def; };
  const barList = (id, def, items, old) => { const l = barPick(id, def, items, old); return BARS ? BARS.layout(l) : l; };
  const barEl = (k, map) => (k === '|' ? h('i.sep.so-sep') : k === '_' ? h('i.bgap') : k === '~' ? h('div.spacer') : map[k]);
  const TOOLS = {
    text: ['type', 'text', () => addTool('type', t('text'), 'text:body')], title: ['heading-1', 'r_title', () => addTool('heading-1', t('r_title'), 'text:title')], list: ['list', 'r_list', () => addTool('list', t('r_list'), 'text:list')], quote: ['quote', 'r_quote', () => addTool('quote', t('r_quote'), 'text:quote')],
    image: ['image', 'image', () => addTool('image', t('image'), 'image')], video: ['film', 'video', () => addTool('film', t('video'), 'video')],
    chart: ['chart-column', 'chart', () => dropTool('chart-column', t('chart'), CHARTS.map((c) => item('chart:' + c, CHART_ICONS[c], t('ct_' + c))))], table: ['table', 'table', () => addTool('table', t('table'), 'table')],
    shape: ['shapes', 'shape', () => dropTool('shapes', t('shape'), [...Object.entries(drawn).filter(([k]) => SHAPES.includes(k)).map(([k, ic]) => item('shape:' + k, ic, t('sh_' + k))), h('sav-divider'), item('shape:line', 'minus', t('sh_line')), item('shape:line:arrow', 'move-right', t('sh_line_arrow'))])],
    icon: ['smile', 'icon', () => addTool('smile', t('icon'), async () => { const n = await pickIcon(); if (n) ed.insert('icon:' + n); })], number: ['hash', 'r_big', () => addTool('hash', t('r_big'), 'text:big')],
  };
  const TOOLS_DEF = ['text', 'image', 'video', 'chart', 'table', 'shape', 'icon'];
  const ins = h('div.ins', { role: 'toolbar', 'aria-label': t('insert') });
  function drawTools() {
    const list = barList('insert', TOOLS_DEF, Object.keys(TOOLS).map((k) => [k]), userSetting('tools', TOOLS_DEF));
    ins.replaceChildren(h('span.inst', t('insert')), ...list.map((k) => (TOOLS[k] ? TOOLS[k][2]() : barEl(k, {})))); // customising the bar: in the ⋮ menu
  }
  drawTools();
  /** Customising the bars (⋮ → Customise the bars): the window shared by the apps of SavOffice, a tab for each bar. */
  function toolsDialog() {
    if (!window.SavOffice?.bars) return;
    const insItems = Object.keys(TOOLS).map((k) => [k, TOOLS[k][0], t(TOOLS[k][1])]);
    const bars = [{ id: 'title', items: TITLE_ITEMS(), def: TITLE_DEF, before: [[null, deck.meta.title || t('untitled')]], after: [['ellipsis-vertical', t('more')], ['layout-grid', 'SavOffice'], ['user', t('account')]] }, ed.editor && { id: 'insert', items: insItems, def: TOOLS_DEF }, { id: 'status', items: STATUS_ITEMS(), def: STATUS_DEF }].filter(Boolean);
    const value = { title: barPick('title', TITLE_DEF, TITLE_ITEMS()), insert: barPick('insert', TOOLS_DEF, insItems, userSetting('tools', TOOLS_DEF)), status: barPick('status', STATUS_DEF, STATUS_ITEMS()) };
    window.SavOffice.bars.dialog({ bars, value, save: async (v) => { const all = { ...barsSaved(), ...v }; if (state.user) state.user = (await api('auth.settings', { settings: { bars: all } })).user; else localStorage.setItem('savpresentations-bars', JSON.stringify(all)); layoutTitle(); drawTools(); layoutStatus(); } });
  }

  const present = h('sav-button', { icon: 'play', onclick: () => show() , class: 'presentb' }, h('span.insl', t('present')));
  const presentM = h('sav-dropdown', { placement: 'bottom-end' }, h('sav-button.presentm', { slot: 'trigger', icon: 'chevron-down', label: t('more'), square: true }), item('here', 'play', t('present_here'), { kbd: '⇧F5' }), item('start', 'play', t('present_start'), { kbd: 'F5' }), !isApp && h('sav-divider'), !isApp && item('view', 'presentation', t('present_speaker')));
  presentM.addEventListener('sav-select', (e) => ({ here: () => show(ed.sid), start: () => show(deck.order()[0]?.sid), view: () => show(ed.sid, { presenter: true }) })[e.detail.value]());
  const paletteB = iconBtn('command', t('palette_l') + ' · ' + (isMac ? '⌘J' : 'Ctrl+J'), () => ed.palette());
  const shareB = h('sav-button', { icon: 'user-plus', appearance: 'soft', onclick: () => shareDialog(deck.uid, deck.title, ed) }, h('span.insl', t('share')));
  // the pieces of the bars that each person may show or not, and in what order (⋮ → Customise the bars, kept with the account)
  const homeA = h('a.ehome', { href: './', 'data-go': true, title: t('home'), 'aria-label': t('home') }, logo(30)), etitle = h('div.etitle', title, status), presentG = h('sav-button-group.pgroup', present, presentM);
  // on the right, always: ⋮, the apps of SavOffice and the account (signed out too: the apps, then Sign in)
  const accountEl = !mobile() && (state.user ? userMenu() : h('span.umenu', h('savoffice-apps', { current: 'savpresentations' }), btn(t('sign_in'), () => { sessionStorage.setItem('sp-back', location.pathname + location.search); go('?signin=login'); }, { appearance: 'outline', variant: 'neutral' })));
  const T2 = { undo: ed.editor && undoB, redo: ed.editor && redoB, people, share: !deck.local && (deck.role === 'owner' || deck.role === 'editor') && shareB, download: !mobile() && (deck.canEdit || deck.meta.opts.download !== false) && iconBtn('download', t('download'), () => downloadMenu(ed)), palette: !mobile() && paletteB };
  T2.insbar = ins; T2.present = presentG;
  const TITLE_ITEMS = () => [['undo', 'undo-2', t('undo')], ['redo', 'redo-2', t('redo')], ['insbar', 'square-plus', t('bar_insbar')], ['people', 'users', t('bar_people')], ['share', 'user-plus', t('share')], ['present', 'play', t('present'), { lock: true }], ['download', 'download', t('download')], ['palette', 'command', t('palette_l')]].filter(([k]) => T2[k]);
  const TITLE_DEF = ['undo', 'redo', 'insbar', '~', 'people', 'share', 'present', 'download', 'palette'];
  const top = h('header.etop');
  /** The title bar: the logo and the title first, ⋮ and the account last (always); between them the list, in its order. */
  function layoutTitle() { top.replaceChildren(...[homeA, etitle, ...barList('title', TITLE_DEF, TITLE_ITEMS()).map((k) => barEl(k, T2)), menu, accountEl].filter(Boolean)); }
  layoutTitle();
  const strip = h('sav-sortable.strip', { 'aria-label': t('slides'), direction: mobile() ? 'horizontal' : null, handle: deck.canEdit && !mobile() ? null : '.never' }), addB = h('sav-button', { icon: 'plus', appearance: 'outline', variant: 'neutral', block: true, size: 'sm', onclick: () => ed.addSlide() }, t('new_slide'));
  const left = h('aside.eleft', strip, deck.canEdit && addB), panel = h('aside.epanel'), rail = h('sav-bottom-nav.rail', { label: t('panels') });
  // speaker notes of the page, under it
  const notesT = h('sav-textarea', { rows: 3, resize: 'vertical', size: 'sm', maxlength: 8000, placeholder: t('speaker_notes_ph'), 'aria-label': t('speaker_notes') }), notesBar = h('div.enotes', { hidden: true }, notesT);
  let notesFor = '', notesOn = userSetting('notesBar', !mobile()) && !mobile();
  const notesB = h('sav-button', { icon: 'notebook-pen', size: 'sm', appearance: 'ghost', variant: 'neutral', 'aria-expanded': 'false', onclick: () => { notesOn = !notesOn; drawNotes(); if (notesOn) notesT.focus(); if (state.user && !mobile()) api('auth.settings', { settings: { notesBar: notesOn } }).then((r) => { state.user = r.user; }).catch(() => {}); } }, t('speaker_notes'));
  const saveNotes = () => { clearTimeout(notesT.t); const s = deck.slide(notesFor); if (s && (s.d.notes || '') !== notesT.value && deck.canEditPage(notesFor)) deck.do({ k: 'slide.set', s: notesFor, p: { notes: notesT.value || null } }, 'notes' + notesFor); };
  notesT.addEventListener('input', () => { clearTimeout(notesT.t); notesT.t = setTimeout(saveNotes, 500); });
  notesT.addEventListener('change', saveNotes);
  notesT.addEventListener('keydown', (e) => e.stopPropagation());
  /** The notes of the page being seen; never over the ones being written. */
  function drawNotes() {
    const s = deck.slide(ed.sid);
    if (notesFor !== ed.sid) saveNotes();
    if (notesFor !== ed.sid || !notesT.matches(':focus-within')) { notesT.value = s?.d.notes || ''; notesFor = ed.sid; }
    notesT.toggleAttribute('readonly', !ed.edit);
    notesBar.hidden = !notesOn;
    notesB.setAttribute('aria-expanded', String(notesOn)); notesB.variant = notesOn ? 'primary' : 'neutral'; notesB.appearance = notesOn ? 'soft' : 'ghost';
    notesB.classList.toggle('has', !!s?.d.notes);
  }
  ed.saveNotes = saveNotes;
  const SB = { pages: !mobile() && iconBtn('panel-left', t('toggle_pages'), () => toggleStrip(), { size: 'sm', place: 'top' }), notes: ed.editor && notesB, fit: iconBtn('fullscreen', t('fit'), () => stage.setZoom(0), { size: 'sm', place: 'top' }), zoom: zoomEl };
  const bottom = h('div.ebottom'), slideNo = h('span.sn');
  SB.sn = slideNo;
  const STATUS_ITEMS = () => [['pages', 'panel-left', t('toggle_pages')], ['sn', 'hash', t('bar_slide'), { lock: true }], ['notes', 'notebook-pen', t('speaker_notes')], ['fit', 'fullscreen', t('fit')], ['zoom', 'zoom-in', t('bar_zoom')]].filter(([k]) => SB[k]);
  const STATUS_DEF = ['pages', 'sn', 'notes', '~', 'fit', 'zoom'];
  function layoutStatus() { bottom.replaceChildren(...barList('status', STATUS_DEF, STATUS_ITEMS()).map((k) => barEl(k, SB)).filter(Boolean)); }
  layoutStatus();
  const center = h('section.ecenter', h('div.banner'), stage.scroller, ed.editor && notesBar, bottom);
  app.append(top, h('div.emain', left, center, panel, rail));

  // ------------------------------------------------------------------ strip of slides
  const thumbs = new Map();
  let stripW = 0;
  // the width of the small slides: what the column leaves after the number and the ring of the chosen one (2.5px), and
  // after its scroll bar when it has one; at most 150px. A fixed width cut the ring on the right.
  const stripFit = () => {
    if (mobile()) return 92;
    const cw = strip.clientWidth, rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return cw ? Math.max(96, Math.min(150, Math.floor(cw - 3 - 6 - 1.7 * rem))) : 140;
  };
  function drawStrip() {
    const list = deck.order(), w = stripW = stripFit();
    strip.replaceChildren(...list.map((s, i) => {
      const b = h('div.st', { 'data-sid': s.sid, 'data-id': s.sid, 'aria-label': t('slide') + ' ' + (i + 1), tabindex: 0, onclick: () => ed.goto(s.sid), onfocus: () => { if (strip.matches(':focus-within') && b.matches(':focus-visible')) ed.goto(s.sid); } }, h('span.stn', String(i + 1)), h('div.stb', h('div.stt'), h('div.stl')), h('div.stp'));
      thumbs.set(s.sid, b);
      fillThumb(s.sid, w);
      return b;
    }));
    for (const id of [...thumbs.keys()]) if (!deck.slide(id)) thumbs.delete(id);
    markStrip();
  }
  function fillThumb(sid, w = stripW) {
    const s = deck.slide(sid), b = thumbs.get(sid);
    if (!s || !b) return;
    b.querySelector('.stt').replaceChildren(thumb(s.d, ed.ctx, w, { index: deck.index(sid), count: deck.slides.size }));
    b.classList.toggle('hid', !!s.d.hide);
    b.setAttribute('aria-label', pageName(deck, s) + (s.d.hide ? ' · ' + t('hidden') : ''));
    const mark = (ic, label) => h('sav-icon', { name: ic, label, title: label });
    b.querySelector('.stl').replaceChildren(...[s.d.name && h('span', { title: s.d.name }, s.d.name), s.d.hide && mark('eye-off', t('hidden')), deck.role === 'owner' && deck.ruled.has(sid) && mark('key-round', t('page_rules')), deck.role !== 'owner' && ed.editor && !deck.canEditPage(sid) && mark('lock', t('page_locked'))].filter(Boolean));
  }
  ed.drawStrip = () => drawStrip();
  const dirty = new Set();
  let dirtyT;
  const touch = (sid) => { dirty.add(sid); clearTimeout(dirtyT); dirtyT = setTimeout(() => { for (const d of dirty) fillThumb(d); dirty.clear(); }, 180); };
  function markStrip() {
    for (const [id, b] of thumbs) { b.classList.toggle('on', id === ed.sid); b.setAttribute('aria-current', id === ed.sid ? 'true' : 'false'); b.querySelector('.stp').replaceChildren(...deck.people.filter((p) => p.st?.s === id).slice(0, 4).map((p) => h('i', { style: `background:${p.color}`, title: p.name || t('guest') }))); }
    $('.sn', center).textContent = [t('slide_of', { a: deck.index(ed.sid) + 1, b: deck.slides.size }), deck.slide(ed.sid)?.d.name].filter(Boolean).join(' · ');
    app.classList.toggle('viewer', !ed.edit); app.classList.toggle('lockedpage', ed.editor && !ed.edit);
    if (ed.editor) drawNotes();
  }
  strip.addEventListener('sav-sort', (e) => { moveTo(e.detail.item.dataset.sid, e.detail.to); });
  function moveTo(sid, i) {
    const pos = deck.posAt(i, sid);
    deck.do({ k: 'slide.move', s: sid, pos });
  }
  strip.addEventListener('contextmenu', (e) => { const s = e.target.closest('.st'); if (!s || !ed.editor) return; e.preventDefault(); ed.goto(s.dataset.sid); slideMenu(e.clientX, e.clientY); });
  strip.addEventListener('dblclick', (e) => { const s = e.target.closest('.st'); if (s && deck.canEditPage(s.dataset.sid)) ed.renamePage(s.dataset.sid); });

  // ------------------------------------------------------------------ actions
  ed.renamePage = async (sid = ed.sid) => { const s = deck.slide(sid); if (!s) return; const n = await promptBox(t('rename_page'), t('page_name'), s.d.name || '', t('save'), 60, true); if (n !== null) deck.do({ k: 'slide.set', s: sid, p: { name: n || null } }); };
  ed.toggleHide = (sid = ed.sid) => deck.do({ k: 'slide.set', s: sid, p: { hide: deck.slide(sid)?.d.hide ? null : 1 } });
  ed.goto = (sid) => {
    if (!deck.slide(sid)) return;
    if (sid === ed.sid) { markStrip(); return; }
    ed.closeText(); ed.sid = sid; ed.sel.clear();
    if (ed.simple) readAll(ed, sid);
    history.replaceState(null, '', `?d=${deck.uid}&slide=${sid}`);
    const was = panel.dataset.lock !== String(ed.edit); panel.dataset.lock = ed.edit;
    stage.draw(); markStrip(); if (was) drawPanel(true); else ed.refreshPanel();
    thumbs.get(sid)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    deck.setState({ s: sid, sel: [], x: null, y: null });
  };
  ed.select = (ids, quiet) => {
    const before = [...ed.sel].join();
    ed.sel = new Set(ids);
    stage.overlayNow();
    if (quiet) return;
    deck.setState({ s: ed.sid, sel: [...ed.sel].slice(0, 12) });
    if (ids.length && !['comments', 'notes'].includes(ed.tab) && !mobile() && before !== ids.join()) { const was = ed.tab !== 'props' ? ed.tab : ed.backTab; setTab('props'); ed.backTab = was; } else if (!ids.length && ed.tab === 'props' && ed.backTab && before) { const k = ed.backTab; ed.backTab = ''; setTab(k); }
    else if (before !== ids.join()) ed.refreshPanel();
  };
  const put = (el, sel = true) => {
    const id = uid(), top = Math.max(0, ...Object.values(deck.slide(ed.sid).d.els).map((e) => e.z || 0));
    // simple mode: into the chosen cell, the one of what is selected, the first free one or the last
    let g = ed.simple && gridOf(ed);
    const els = deck.slide(ed.sid).d.els;
    if (g) {
      const tidy = ed.toCell === undefined && g.m === 0 && firstFree(g, els) < 0 && !growGrid(g) && nextGrid(els, ed.ctx);
      if (tidy) { // no room: the page takes the tidy grid for one block more
        g = { c: tidy.c, g: 24 };
        const next = assign(g, els, ed.ctx), cell = firstFree(g, next);
        if (cell >= 0) {
          ed.toCell = undefined;
          const z = { ...el, cell, z: top + 1, ...cellRect(g, cell, ed.ctx) };
          delete z.cr; next[id] = z;
          deck.do([{ k: 'slide.set', s: ed.sid, p: { grid: g } }, { k: 'el.add', s: ed.sid, e: id, el: z }, ...arrange(ed.sid, g, next, ed.ctx, { ...els, [id]: z })]);
          if (sel) ed.select([id]);
          return id;
        }
        g = gridOf(ed);
      }
      const free = firstFree(g, els), selCell = deck.el(ed.sid, [...ed.sel][0])?.cell, more = ed.toCell === undefined && free < 0 && growGrid(g);
      if (more) g = more;
      const cell = ed.toCell ?? (more ? g.c.length - 1 : free >= 0 ? free : selCell ?? g.c.length - 1);
      ed.toCell = undefined;
      const z = { ...el, cell, z: top + 1, ...cellRect(g, cell, ed.ctx) };
      delete z.cr;
      const next = { ...structuredClone(els), [id]: z };
      makeRoom(next, cell, id);
      for (const k of ['x', 'y', 'w', 'h']) z[k] = Math.round(z[k] * 10) / 10;
      deck.do([...(more ? [{ k: 'slide.set', s: ed.sid, p: { grid: g } }] : []), { k: 'el.add', s: ed.sid, e: id, el: z }, ...arrange(ed.sid, g, next, ed.ctx, { ...els, [id]: z })]);
      if (sel) ed.select([id]);
      return id;
    }
    for (const k of ['x', 'y', 'w', 'h']) el[k] = Math.round(el[k] * 10) / 10;
    deck.do({ k: 'el.add', s: ed.sid, e: id, el: { ...el, z: top + 1 } });
    if (sel) ed.select([id]);
    return id;
  };
  const centered = (w, hh, p) => ({ x: (p ? p.x : ed.ctx.W / 2) - w / 2, y: (p ? p.y : ed.ctx.H / 2) - hh / 2, w, h: hh });
  const needSlide = () => { if (!deck.slide(ed.sid)) ed.addSlide('blank'); };
  ed.insertText = (role, x, y, write) => {
    needSlide();
    const s = ed.ctx.s, [w, hh] = { title: [860, 110], heading: [760, 70], body: [560, 46], list: [560, 130], quote: [760, 130], big: [420, 170], caption: [420, 30], subtitle: [640, 50] }[role] || [560, 46];
    const b = centered(Math.min(w * s, ed.ctx.W * .85), hh * s, x != null ? { x, y } : null);
    const html = role === 'list' ? `<ul><li>${t('ph_item')}</li><li>${t('ph_item')}</li></ul>` : write ? '' : textToHtml(t({ title: 'ph_title', heading: 'ph_title', quote: 'ph_quote', big: 'ph_number', caption: 'ph_caption' }[role] || 'ph_text'));
    const id = put({ t: 'text', role: role === 'list' ? 'body' : role, ...b, html });
    requestAnimationFrame(() => stage.startEdit(id, 'all'));
  };
  ed.insertImage = (m, p) => { needSlide(); const k = Math.min(1, ed.ctx.W * .5 / m.w, ed.ctx.H * .6 / m.h), K = Math.max(k, Math.min(ed.ctx.W * .25 / m.w, 1)); return put({ t: 'image', src: m.src, ...centered(m.w * (m.w * k < ed.ctx.W * .2 ? K : k), m.h * (m.w * k < ed.ctx.W * .2 ? K : k), p), alt: m.name || '', credit: m.credit || '', creditUrl: okLink(m.creditUrl) ? m.creditUrl : '', ...(m.cite ? { cite: m.cite } : {}) }); };
  ed.insertVideo = (v, p) => { needSlide(); const w = ed.ctx.W * .55, hh = w * Math.min(1.6, (v.h || 720) / (v.w || 1280)); return put({ t: 'video', kind: v.kind, vid: v.vid, poster: v.poster || '', ...(v.start ? { start: v.start } : {}), ...centered(w, hh, p), credit: v.credit || '', creditUrl: okLink(v.creditUrl) ? v.creditUrl : '', ...(v.cite ? { cite: v.cite } : {}), rad: 10 }); };
  ed.setImage = (id, m) => deck.do({ k: 'el.set', s: ed.sid, e: id, p: { src: m.src, credit: m.credit || '', creditUrl: okLink(m.creditUrl) ? m.creditUrl : '', cite: m.cite || null, alt: m.name || '', fx: null, fy: null, zoom: null } });
  ed.insert = async (what, p, cell) => {
    if (!ed.edit) return deck.canWrite && toast(t('page_locked'));
    ed.closeText(); needSlide();
    ed.toCell = cell;
    const [kind, a, b] = what.split(':'), s = ed.ctx.s;
    if (kind === 'text') return ed.insertText(a, p?.x, p?.y);
    if (kind === 'image') { const m = await pickPicture(); if (m) ed.insertImage(m, p); return; }
    if (kind === 'video') { const v = await pickVideo(); if (v) ed.insertVideo(v, p); return; }
    if (kind === 'chart') return put({ t: 'chart', ct: a || 'bar', chart: sampleChart({ labels: [1, 2, 3, 4].map((n) => t('quarter') + n), a: t('series') + ' A', b: t('series') + ' B' }), ...centered(620 * s, 360 * s, p) });
    if (kind === 'table') return put({ t: 'table', cells: sampleTable(t('column')), ...centered(640 * s, 240 * s, p) });
    if (kind === 'icon') return put({ t: 'icon', ic: a, ...centered(110 * s, 110 * s, p) });
    if (kind === 'shape' && a === 'line') return put({ t: 'shape', shape: 'line', ...centered(320 * s, 24 * s, p), stroke: '@fg', sw: 3 * s, ...(b === 'arrow' ? { h2: 'arrow' } : b === 'double' ? { h1: 'arrow', h2: 'arrow' } : {}) });
    if (kind === 'shape') { const wide = /^(arrow|arrow2|chevron|homeplate|speech|rect|round|parallelogram|cloud|wave|half|trapezoid)$/.test(a); put({ t: 'shape', shape: a, ...centered((wide ? 260 : 200) * s, (wide ? 160 : 200) * s, p), fill: '@accent' }); }
  };
  ed.enter = (id) => {
    const el = deck.el(ed.sid, id);
    if (!el || el.lock) return;
    ed.select([id]);
    if (el.t === 'chart' || el.t === 'table') { setTab('props'); requestAnimationFrame(() => panel.querySelector('.dgrid sav-input')?.focus()); } else if (el.t === 'text' || (el.t === 'shape' && el.shape !== 'line')) stage.startEdit(id);
    else if (el.t === 'image') pickPicture().then((m) => m && ed.setImage(id, m));
    else if (el.t === 'video') { if (el.vid) ed.playVideo(id); else pickVideo().then((v) => v && deck.do({ k: 'el.set', s: ed.sid, e: id, p: { kind: v.kind, vid: v.vid, poster: v.poster || '', credit: v.credit || '', creditUrl: okLink(v.creditUrl) ? v.creditUrl : '', cite: v.cite || null } })); }
  };
  ed.playVideo = (id) => { const el = deck.el(ed.sid, id), v = el?.vid && videoNode(el, true); if (v) dialog(t('video'), h('div.vbox', v), [], { width: '60rem' }); };
  ed.follow = (link) => openLink(link, (sid) => ed.goto(sid));
  /** A link on an element: a slide of the presentation or a page outside (opened in a new tab, after asking). */
  ed.linkDialog = async (id = [...ed.sel][0]) => {
    const el = deck.el(ed.sid, id);
    if (!el || !ed.edit) return;
    const cur = el.link || '';
    let kind = cur.startsWith('#s:') ? 'slide' : 'web';
    const url = h('sav-input', { label: t('link_url'), placeholder: 'https://…', value: cur.startsWith('#') ? '' : cur, autofocus: kind === 'web', help: t('link_web_t') });
    url.addEventListener('keydown', (e) => e.stopPropagation());
    const list = deck.order(), slide = h('sav-select', { label: t('link_slide'), value: cur.startsWith('#s:') && deck.slide(cur.slice(3)) ? cur : '#s:' + (list[deck.index(ed.sid) + 1] || list[0])?.sid, help: t('link_slide_t') }, ...list.map((s, i) => h('option', { value: '#s:' + s.sid }, `${i + 1} · ${pageName(deck, s)}`)));
    const tabs = h('sav-tabs.linktabs', { appearance: 'segmented', active: kind }, h('sav-tab', { name: 'web', label: t('link_web'), icon: 'globe' }, h('div.stack.pad', url)), h('sav-tab', { name: 'slide', label: t('link_to_slide'), icon: 'presentation' }, h('div.stack.pad', slide)));
    tabs.addEventListener('sav-tab-show', (e) => { kind = e.detail.name; });
    const set = (v) => deck.do({ k: 'el.set', s: ed.sid, e: id, p: { link: v || null } });
    await dialog(t(cur ? 'link_edit' : 'link_add'), tabs, [...(cur ? [[t('link_remove'), () => { set(''); return true; }, { appearance: 'ghost', variant: 'danger', icon: 'unlink' }]] : []), [t('cancel'), null, { appearance: 'outline', variant: 'neutral' }], [t('save'), () => {
      if (kind === 'slide') { set(slide.value); return true; }
      let v = url.value.trim();
      if (!v) { set(''); return true; }
      if (!/^(https?:|mailto:)/i.test(v)) v = (v.includes('@') && !v.includes('/') ? 'mailto:' : 'https://') + v;
      if (!okLink(v)) { url.setAttribute('help', t('link_bad')); url.focus(); return false; }
      set(v);
      return true;
    }]], { width: '30rem' });
  };
  const selEls = () => [...ed.sel].map((id) => ({ id, el: deck.el(ed.sid, id) })).filter((x) => x.el);
  ed.deleteSel = () => { const ops = selEls().filter((x) => !x.el.lock).map((x) => ({ k: 'el.del', s: ed.sid, e: x.id })); const g = ed.simple && gridOf(ed), left = structuredClone(deck.slide(ed.sid).d.els); for (const o of ops) delete left[o.e]; ed.sel.clear(); deck.do([...ops, ...(g ? arrange(ed.sid, g, left, ed.ctx) : [])]); ed.select([]); ed.refreshPanel(); };
  const cloneInto = (list, dx, dy) => { const top = Math.max(0, ...Object.values(deck.slide(ed.sid).d.els).map((e) => e.z || 0)), ids = [], gs = {}; deck.do(list.map((el, i) => { const id = uid(); ids.push(id); return { k: 'el.add', s: ed.sid, e: id, el: { ...structuredClone(el), x: el.x + dx, y: el.y + dy, z: top + 1 + i, ...(el.g ? { g: (gs[el.g] ||= uid()) } : {}) } }; })); ed.select(ids); };
  ed.duplicateSel = () => { const l = selEls(); if (l.length && ed.simple && gridOf(ed)) { for (const x of l) put(structuredClone(x.el)); return; } if (l.length) cloneInto(l.map((x) => x.el), 20, 20); };
  ed.duplicateHere = () => { const l = selEls(); if (l.length) cloneInto(l.map((x) => x.el), 0, 0); };
  ed.zorder = (how) => {
    const all = sorted(deck.slide(ed.sid).d), sel = all.filter((x) => ed.sel.has(x.id)), rest = all.filter((x) => !ed.sel.has(x.id));
    let next;
    if (how === 'front') next = [...rest, ...sel]; else if (how === 'back') next = [...sel, ...rest];
    else { next = [...all]; const idx = sel.map((x) => next.indexOf(x)); if (how === 'up') for (const i of idx.reverse()) { if (i < next.length - 1 && !ed.sel.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]]; } else for (const i of idx) if (i > 0 && !ed.sel.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]]; }
    deck.do(next.map((x, i) => (x.z !== i + 1 ? { k: 'el.set', s: ed.sid, e: x.id, p: { z: i + 1 } } : null)));
  };
  ed.align = (how) => {
    const l = selEls().filter((x) => !x.el.lock);
    const b = l.length > 1 ? stage.bounds(l.map((x) => x.el)) : { x: 0, y: 0, w: ed.ctx.W, h: ed.ctx.H };
    if (how === 'dh' || how === 'dv') {
      const [p, sz] = how === 'dh' ? ['x', 'w'] : ['y', 'h'], s = [...l].sort((a, c) => a.el[p] - c.el[p]), tot = s.reduce((a, x) => a + x.el[sz], 0), gap = (b[sz] - tot) / (s.length - 1);
      let at = b[p];
      return deck.do(s.map((x) => { const op = { k: 'el.set', s: ed.sid, e: x.id, p: { [p]: Math.round(at * 10) / 10 } }; at += x.el[sz] + gap; return op; }));
    }
    const f = { left: (e) => ({ x: b.x }), center: (e) => ({ x: b.x + (b.w - e.w) / 2 }), right: (e) => ({ x: b.x + b.w - e.w }), top: (e) => ({ y: b.y }), middle: (e) => ({ y: b.y + (b.h - e.h) / 2 }), bottom: (e) => ({ y: b.y + b.h - e.h }) }[how];
    deck.do(l.map((x) => ({ k: 'el.set', s: ed.sid, e: x.id, p: { ...f(x.el), ...(x.el.cell != null ? { cell: null, cr: null } : {}) } })));
  };
  ed.asBackground = (id) => { const el = deck.el(ed.sid, id); if (!el?.src) return; ed.sel.clear(); deck.do([{ k: 'slide.set', s: ed.sid, p: { bg: { t: 'i', src: el.src, dim: 0, credit: el.credit || '', creditUrl: el.creditUrl || '' } } }, { k: 'el.del', s: ed.sid, e: id }]); ed.select([]); };
  // slides
  ed.addSlide = (layout) => {
    const i = deck.index(ed.sid), cur = deck.slide(ed.sid);
    if (!deck.canEdit) return toast(t('page_locked'));
    if (ed.simple && !layout) { // a page of the simple mode: a title and a place for the rest
      const g = GRIDS.find((x) => x.id === 't-one'), sid = uid();
      const title = { t: 'text', role: 'heading', ph: t('ph_title'), cell: 0, z: 1, ...cellRect(g, 0, ed.ctx) };
      for (const k of ['x', 'y', 'w', 'h']) title[k] = Math.round(title[k] * 10) / 10;
      deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(i + 1), d: { layout: '', variant: 'content', grid: { c: g.c, g: 24 }, els: { [uid()]: title } } });
      ed.goto(sid); setTab('grid');
      return;
    }
    const id = layout || (!cur ? 'cover' : cur.d.layout === 'cover' || cur.d.layout === 'section' ? 'title-body' : cur.d.layout || 'title-body');
    const { sid, d } = makeSlide(id === 'closing' ? 'title-body' : id, ed.ctx);
    if (layout === 'closing') Object.assign(d, makeSlide('closing', ed.ctx).d);
    deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(i + 1), d });
    ed.goto(sid);
  };
  ed.setLayout = (id) => { const s = deck.slide(ed.sid); if (!s) return ed.addSlide(id); const d = relayout(s.d, id, ed.ctx), ops = [{ k: 'slide.set', s: s.sid, p: { layout: id, variant: d.variant, grid: null } }]; for (const el of Object.values(d.els)) { delete el.cell; delete el.cr; } for (const e of Object.keys(s.d.els)) if (!d.els[e]) ops.push({ k: 'el.del', s: s.sid, e }); for (const [e, el] of Object.entries(d.els)) ops.push({ k: 'el.add', s: s.sid, e, el }); ed.sel.clear(); deck.do(ops); ed.select([]); if (ed.simple) readAll(ed, s.sid); };
  ed.duplicateSlide = () => { const s = deck.slide(ed.sid); if (!s) return; const d = structuredClone(s.d), els = {}; for (const el of Object.values(d.els)) els[uid()] = el; d.els = els; const sid = uid(); deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(deck.index(ed.sid) + 1), d, from: s.sid }); if (deck.ruled.has(s.sid)) deck.ruled.add(sid); ed.goto(sid); drawStrip(); };
  ed.deleteSlide = () => { const l = deck.order(), i = deck.index(ed.sid); if (l.length < 2) return toast(t('last_slide')); const next = l[i + 1] || l[i - 1], sid = ed.sid; ed.goto(next.sid); deck.do({ k: 'slide.del', s: sid }); };
  ed.setFormat = (id, w, hh, scale) => {
    const o = deck.meta.format, ops = [{ k: 'deck.set', p: { format: { id, w: Math.round(w), h: Math.round(hh) } } }];
    if (scale && (o.w !== w || o.h !== hh)) {
      const f = Math.min(w / o.w, hh / o.h), dx = (w - o.w * f) / 2, dy = (hh - o.h * f) / 2, r = (v) => Math.round(v * 10) / 10;
      const s0 = context(deck.meta).s, s1 = context({ ...deck.meta, format: { w, h: hh } }).s;
      for (const s of deck.slides.values()) for (const [e, el] of Object.entries(s.d.els)) {
        const full = el.x <= 1 && el.y <= 1 && el.w >= o.w - 2 && el.h >= o.h - 2;
        const p = full ? { x: 0, y: 0, w, h: hh } : { x: r(el.x * f + dx), y: r(el.y * f + dy), w: Math.max(1, r(el.w * f)), h: Math.max(1, r(el.h * f)) };
        for (const k of ['rad', 'sw', 'pad', 'ls']) if (el[k]) p[k] = r(el[k] * f);
        // texts without their own size follow the format: an explicit one is needed only when the box shrinks more
        if (el.size) p.size = r(el.size * f); else if ((el.t === 'text' || el.html) && Math.abs(s1 / s0 - f) > .02) p.size = r(styleOf(el, slideContext(context(deck.meta), s.d)).size * f);
        ops.push({ k: 'el.set', s: s.sid, e, p });
      }
    }
    deck.do(ops);
    // pages with a grid fill the new format exactly
    if (scale) deck.do(deck.order().filter((x) => x.d.grid).flatMap((x) => arrange(x.sid, x.d.grid, x.d.els, ed.ctx)));
  };
  ed.creditsSlide = () => {
    const seen = new Map();
    for (const s of deck.order()) { for (const el of Object.values(s.d.els)) if (el.credit) seen.set(el.credit, el.creditUrl); if (s.d.bg?.credit) seen.set(s.d.bg.credit, s.d.bg.creditUrl); }
    if (!seen.size) return toast(t('no_credits'));
    const { sid, d } = makeSlide('title-body', ed.ctx, { title: t('credits'), body: '' });
    const esc = (x) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const body = Object.values(d.els).find((e) => e.role === 'body');
    body.html = '<ul>' + [...seen].map(([c, u]) => `<li>${okLink(u) ? `<a href="${esc(u)}">${esc(c)}</a>` : esc(c)}</li>`).join('') + '</ul>'; body.size = 15 * ed.ctx.s;
    deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(deck.slides.size), d });
    ed.goto(sid);
  };

  // menus at the pointer
  function menuAt(x, y, items) {
    // the menu of a right click of SavOffice (sav-context-menu), the same in every app; this one when it is not there
    const std = items.filter(Boolean).map((i) => (Array.isArray(i) ? [i[0], i[1], i[2], { danger: i[3] === 'danger', kbd: i[4] }] : i));
    if (window.SavOffice?.context?.show?.(x, y, std)) return;
    $('.ctxm')?.remove();
    const list = items.filter(Boolean), d = h('sav-dropdown.ctxm', { placement: 'bottom-start', style: `left:${x}px;top:${y}px` }, h('span', { slot: 'trigger' }), ...list.map((i, n) => (i === '-' ? h('sav-divider') : item(String(n), i[0], i[1], { variant: i[3] || null, kbd: i[4] }))));
    d.addEventListener('sav-select', (e) => { const i = list[+e.detail.value]; setTimeout(() => i[2](), 30); });
    d.addEventListener('sav-hide', () => setTimeout(() => d.remove(), 200));
    document.body.append(d);
    requestAnimationFrame(() => d.show());
  }
  const C = isMac ? '⌘' : 'Ctrl+';
  ed.contextMenu = (x, y) => { const s = ed.sel.size, one = s === 1 && deck.el(ed.sid, [...ed.sel][0]); menuAt(x, y, s ? [['copy', t('copy'), () => document.execCommand('copy'), '', C + 'C'], ['copy-plus', t('duplicate'), ed.duplicateSel, '', C + 'D'], one && ['link', one.link ? t('link_edit') : t('link_add'), () => ed.linkDialog(), '', C + 'K'], ['paintbrush', t('copy_style'), ed.copyStyle], ed.styleClip && ['paint-roller', t('paste_style'), ed.pasteStyle], s > 1 && ['group', t('group'), ed.group, '', C + 'G'], selEls().some((z) => z.el.g) && ['ungroup', t('ungroup'), ed.ungroup], '-', ['bring-to-front', t('to_front'), () => ed.zorder('front')], ['send-to-back', t('to_back'), () => ed.zorder('back')], one?.t === 'image' && one.src && ['image', t('as_background'), () => ed.asBackground([...ed.sel][0])], ['message-square', t('comment'), () => setTab('comments')], ['sticky-note', t('my_note'), () => setTab('notes')], '-', ['trash', t('delete'), ed.deleteSel, 'danger']] : [['type', t('text'), () => ed.insert('text:body')], ['image', t('image'), () => ed.insert('image')], ['shapes', t('shapes'), () => setTab('elements')], '-', ['palette', t('theme'), () => setTab('theme')], ['panel-top', t('page'), () => setTab('page')]]); };
  const slideMenu = (x, y) => menuAt(x, y, [deck.canEdit && ['plus', t('new_slide'), () => ed.addSlide(), '', 'Ctrl+M'], deck.canEdit && ['copy-plus', t('duplicate'), ed.duplicateSlide], ed.edit && ['pencil', t('rename_page'), () => ed.renamePage()], ed.edit && [deck.slide(ed.sid)?.d.hide ? 'eye' : 'eye-off', deck.slide(ed.sid)?.d.hide ? t('show_slide') : t('hide_slide'), () => ed.toggleHide()], deck.role === 'owner' && ['key-round', t('page_rules'), () => pageRulesDialog(ed, [ed.sid])], deck.canEdit && ed.edit && ['arrow-up', t('move_up'), () => moveTo(ed.sid, deck.index(ed.sid) - 1)], deck.canEdit && ed.edit && ['arrow-down', t('move_down'), () => moveTo(ed.sid, deck.index(ed.sid) + 1)], deck.canEdit && ed.edit && '-', deck.canEdit && ed.edit && ['trash', t('delete'), ed.deleteSlide, 'danger']]);
  if (mobile() && ed.editor) { const b = iconBtn('ellipsis', t('slide'), (e) => { const r = e.currentTarget.getBoundingClientRect(); slideMenu(r.left, r.top - 260); }, { size: 'sm', place: 'top' }); $('.ebottom', center).prepend(b, iconBtn('plus', t('new_slide'), () => ed.addSlide(), { size: 'sm', place: 'top' })); }

  // ------------------------------------------------------------------ side panel
  const ALLTABS = [...(ed.editor ? [['elements', 'shapes', 'elements'], ['props', 'sliders-horizontal', 'format_tab'], ['page', 'panel-top', 'page'], ['grid', 'grid-3x3', 'grids'], ['layouts', 'layout-template', 'layouts'], ...(deck.canEdit ? [['theme', 'palette', 'theme']] : []), ...(deck.local ? [] : [['media', 'images', 'media']])] : []), ...(deck.local ? [] : [['comments', 'message-square', 'comments'], ['notes', 'sticky-note', 'notes']]), ...(deck.canEdit && !deck.limited && !deck.local ? [['history', 'history', 'versions']] : [])];
  const tabs = () => ALLTABS.filter(([k]) => k !== (ed.simple ? 'layouts' : 'grid'));
  function drawRail() { rail.replaceChildren(...tabs().map(([k, ic, l]) => { const n = k === 'comments' || k === 'notes' ? marks.count(k) : 0; return h('sav-bottom-nav-item', { label: t(l), icon: ic, value: k, badge: n || null, current: ed.tab === k }); })); }
  rail.addEventListener('sav-select', (e) => { e.stopPropagation(); setTab(ed.tab === e.detail.value ? '' : e.detail.value); });
  function setTab(k) {
    if (k !== 'props') ed.backTab = '';
    ed.tab = k;
    app.classList.toggle('has-panel', !!k);
    drawRail(); drawPanel(true); stage.overlayNow();
  }
  ed.setTab = setTab;
  function drawPanel(fresh) {
    if (!ed.tab) { panel.replaceChildren(); return; }
    const y = fresh ? 0 : panel.querySelector('.pbody')?.scrollTop || 0;
    const body = !ed.edit && !['comments', 'notes'].includes(ed.tab) ? () => h('sav-empty-state', { icon: 'lock', heading: t('page_locked'), text: t('page_locked_t') }) : { grid: gridPanel, elements: elementsPanel, props: propsPanel, page: pagePanel, layouts: layoutsPanel, theme: themePanel, media: mediaPanel, comments: marks.commentsPanel, notes: marks.notesPanel, history: () => ed.versionsPanel() }[ed.tab];
    panel.replaceChildren(h('div.phead', h('h2', t(ALLTABS.find((x) => x[0] === ed.tab)[2])), iconBtn('x', t('close'), () => setTab(''), { size: 'sm' })), h('div.pbody', body(ed)));
    panel.querySelector('.pbody').scrollTop = y;
  }
  const typing = () => { const a = deepActive(); return a && panel.contains(a.getRootNode().host || a) && /^(INPUT|TEXTAREA)$/.test(a.tagName); };
  const deepActive = () => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
  let panelT;
  /** The properties follow what is selected; never while one is being typed or a list is open. */
  ed.refreshPanel = () => { clearTimeout(panelT); panelT = setTimeout(() => { if ((ed.tab === 'props' || ed.tab === 'page' || ed.tab === 'grid') && !ed.dragging && !typing() && !panel.querySelector('sav-popover[open], sav-select[open], sav-color-picker[open]')) drawPanel(); if (ed.tab === 'comments' || ed.tab === 'notes') drawPanel(); }, 40); };
  ed.refreshMarks = () => { drawRail(); if ((ed.tab === 'comments' || ed.tab === 'notes') && !typing()) drawPanel(); stage.overlayNow(); };

  // pointing at something for a comment or a note
  ed.startPick = (hint) => { ed.picking = true; app.classList.add('picking'); toast(hint); if (mobile()) app.classList.remove('has-panel'); };
  ed.pickAt = (e, p, id) => {
    e.preventDefault();
    const box = h('div.marquee'); stage.overlay.append(box);
    const mv = (ev) => { const n = stage.pos(ev); Object.assign(box.style, { left: Math.min(p.x, n.x) * stage.k + 'px', top: Math.min(p.y, n.y) * stage.k + 'px', width: Math.abs(n.x - p.x) * stage.k + 'px', height: Math.abs(n.y - p.y) * stage.k + 'px' }); };
    const up = (ev) => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      box.remove(); ed.picking = false; app.classList.remove('picking'); if (ed.tab) app.classList.add('has-panel');
      const n = stage.pos(ev), w = Math.abs(n.x - p.x), hh = Math.abs(n.y - p.y);
      ed.onPicked?.(w > 12 && hh > 12 ? { x: Math.min(p.x, n.x), y: Math.min(p.y, n.y), w, h: hh } : id ? { e: id } : { x: p.x, y: p.y, w: 0, h: 0 });
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };

  // ------------------------------------------------------------------ changes
  deck.addEventListener('change', (e) => {
    const { ops, local } = e.detail;
    let redraw = false, all = false, stripAll = false;
    const els = new Set(), bgs = new Set();
    for (const op of ops) {
      if (op.k === 'page.rules') continue;
      if (op.k === 'deck.set') {
        if (op.p.title !== undefined) { title.value = deck.title; document.title = deck.title + ' – SavPresentations'; }
        if (op.p.theme || op.p.format || op.p.opts) { ed.ctx = context(deck.meta); all = true; fillMenu(); } else if (op.p.fonts) ed.ctx = context(deck.meta); // a new typeface only needs to be known: the text being written stays open
      } else if (op.k === 'slide.add' || op.k === 'slide.del' || op.k === 'slide.move') { stripAll = true; if (op.s === ed.sid) redraw = true; } else {
        touch(op.s);
        if (op.s !== ed.sid) continue;
        if (op.k === 'slide.set') { if (Object.keys(op.p).some((f) => f !== 'notes' && f !== 'name' && f !== 'hide')) bgs.add(1); else markStrip(); } else els.add(op.e);
      }
    }
    if (!deck.slide(ed.sid)) { const l = deck.order(); ed.closeText(); ed.sel.clear(); ed.sid = l[0]?.sid || ''; redraw = true; }
    for (const id of [...ed.sel]) if (!deck.el(ed.sid, id)) ed.sel.delete(id);
    if (ed.editing && !deck.el(ed.editing.sid, ed.editing.id)) { ed.closeText(); }
    if ((all || redraw || bgs.size) && ed.editing) ed.closeText();
    if (all || redraw || bgs.size) stage.draw();
    else if (els.size) { for (const id of els) stage.drawEl(id); stage.overlayNow(); }
    if (all || stripAll) { drawStrip(); }
    if (!ed.dragging && (!local || e.detail.undo || els.size || bgs.size || redraw)) ed.refreshPanel();
    if (all && ed.tab === 'layouts' ) drawPanel();
    buttons();
  });
  const buttons = () => { undoB.firstChild.disabled = !deck.undoStack.length; redoB.firstChild.disabled = !deck.redoStack.length; };
  const setStatus = () => { const off = deck.failed, s = !ed.editor ? t('view_only') : deck.local ? t('saved_here') : off ? t('offline_saved') : deck.saved ? t('saved_all') : t('saving'); status.replaceChildren(icon(!ed.editor ? 'eye' : off ? 'cloud-off' : deck.saved ? 'cloud-check' : 'refresh-cw'), h('span', s)); status.classList.toggle('off', !!off); };
  deck.addEventListener('status', setStatus);
  deck.addEventListener('people', () => { drawPeople(); markStrip(); stage.overlayNow(); drawBanner(); });
  deck.addEventListener('comments', () => marks.load('comments'));
  deck.addEventListener('role', () => { toast(t('role_changed')); dispatchEvent(new PopStateEvent('popstate')); });
  deck.addEventListener('reload', () => { deck.alive = false; dispatchEvent(new PopStateEvent('popstate')); });
  deck.addEventListener('denied', () => toast(t('page_denied'), 'warning'));
  deck.addEventListener('refused', (e) => toast(errText({ code: e.detail }), 'danger'));
  deck.addEventListener('lost', (e) => dialog(t('cant_open'), h('p', t('err_' + e.detail) ), [[t('home'), () => go('./')], [t('try_again'), () => location.reload(), { appearance: 'outline' }]], { persistent: true }));
  function drawPeople() {
    const seen = new Map();
    for (const p of deck.people) if (!seen.has(p.u || p.c)) seen.set(p.u || p.c, p);
    const list = [...seen.values()];
    people.replaceChildren(...list.slice(0, 4).map((p) => h('sav-tooltip', { content: p.name || t('guest'), placement: 'bottom' }, h('sav-avatar', { 'auto-text': true, label: p.name || t('guest'), button: true, style: `--size:30px;background:${p.color};color:#fff;border-radius:50%;--ring:0 0 0 2px ${p.color}`, onclick: () => { if (p.st?.s) ed.goto(p.st.s); } }))), list.length > 4 ? h('span.more', '+' + (list.length - 4)) : '');
  }

  // ------------------------------------------------------------------ keyboard and clipboard
  let clip = null;
  const busyField = () => { const a = deepActive(); return ed.editing || (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || $('sav-dialog[open], sav-command[open]') || document.body.classList.contains('showing'); };
  const onKey = (e) => {
    if (e.defaultPrevented || document.body.classList.contains('showing')) return;
    const m = e.ctrlKey || e.metaKey, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'F5') { e.preventDefault(); return show(e.shiftKey ? ed.sid : deck.order()[0]?.sid); }
    if (ed.picking && k === 'Escape') { ed.picking = false; app.classList.remove('picking'); ed.onPicked?.(null); return; }
    if (ed.editing && k === 'Escape') { const id = ed.editing.id; e.preventDefault(); ed.closeText(); ed.select([id]); return; }
    if (m && k === 'f' && !busyField()) { e.preventDefault(); return void ed.findReplace(); }
    if (busyField()) return;
    const act = (fn) => { e.preventDefault(); fn(); };
    if (strip.contains(document.activeElement) && /^(Arrow|[ ]$|Enter|Escape)/.test(k)) return; // the sortable list has its own keys
    if (k === 'PageDown' || (!ed.sel.size && (k === 'ArrowDown' || k === 'ArrowRight'))) return act(() => { const l = deck.order(); ed.goto(l[Math.min(l.length - 1, deck.index(ed.sid) + 1)]?.sid); });
    if (k === 'PageUp' || (!ed.sel.size && (k === 'ArrowUp' || k === 'ArrowLeft'))) return act(() => ed.goto(deck.order()[Math.max(0, deck.index(ed.sid) - 1)]?.sid));
    if (!ed.editor) return;
    if (m && k === 'z') return act(() => (e.shiftKey ? deck.redo() : deck.undo()));
    if (m && k === 'y') return act(() => deck.redo());
    if (m && k === 'k' && ed.sel.size === 1) return act(() => ed.linkDialog());
    if (m && k === 'd') return act(() => (ed.sel.size ? ed.duplicateSel() : ed.duplicateSlide()));
    if (m && k === 'g') return act(() => (e.shiftKey ? ed.ungroup() : ed.group()));
    if (m && e.altKey && k === 'c') return act(() => ed.copyStyle());
    if (m && e.altKey && k === 'v') return act(() => ed.pasteStyle());
    if (m && k === 'a') return act(() => ed.select(sorted(deck.slide(ed.sid).d).filter((x) => !x.lock).map((x) => x.id)));
    if (e.ctrlKey && k === 'm') return act(() => ed.addSlide());
    if (m && (k === 'b' || k === 'i' || k === 'u') && ed.sel.size) return act(() => { const f = { b: 'bold', i: 'italic', u: 'under' }[k], l = selEls().filter((x) => x.el.t !== 'image' && x.el.t !== 'video'), sc = slideContext(ed.ctx, deck.slide(ed.sid).d), on = l.some((x) => !styleOf(x.el, sc)[f]); deck.do(l.map((x) => ({ k: 'el.set', s: ed.sid, e: x.id, p: { [f]: on ? 1 : 0 } }))); });
    if (m && (k === ']' || k === '[')) return act(() => ed.zorder(k === ']' ? (e.shiftKey ? 'front' : 'up') : e.shiftKey ? 'back' : 'down'));
    if (m) return;
    if (k === 'Delete' || k === 'Backspace') return act(() => (ed.sel.size ? ed.deleteSel() : strip.contains(document.activeElement) && ed.deleteSlide()));
    if (k === 'Escape') return act(() => ed.select([]));
    if (k === 'Enter' && ed.sel.size === 1) return act(() => ed.enter([...ed.sel][0]));
    if (k === 'Tab' && stage.scroller.contains(document.activeElement)) { const l = sorted(deck.slide(ed.sid).d).filter((x) => !x.lock); if (l.length) return act(() => { const i = l.findIndex((x) => ed.sel.has(x.id)); ed.select([l[(i + (e.shiftKey ? -1 : 1) + l.length) % l.length].id]); }); }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (d && ed.sel.size && ed.simple) return;
    if (d && ed.sel.size) return act(() => { const s = e.shiftKey ? 10 : 1; deck.do(selEls().filter((x) => !x.el.lock).map((x) => ({ k: 'el.set', s: ed.sid, e: x.id, p: { x: x.el.x + d[0] * s, y: x.el.y + d[1] * s, ...(x.el.cell != null ? { cell: null, cr: null } : {}) } })), 'nudge'); });
    if (k === 't') act(() => ed.insert('text:body'));
  };
  const onCopy = (e) => {
    if (busyField() || !ed.edit) return;
    const l = selEls().map((x) => x.el), s = deck.slide(ed.sid);
    const pack = l.length ? { els: l } : document.activeElement === strip || strip.contains(document.activeElement) ? { slide: s.d } : null;
    if (!pack) return;
    e.preventDefault();
    clip = JSON.stringify(pack);
    e.clipboardData.setData('application/x-savpre', clip);
    e.clipboardData.setData('text/plain', l.map((x) => plain(x.html)).filter(Boolean).join('\n') || t('slide'));
    if (e.type === 'cut') { if (l.length) ed.deleteSel(); else ed.deleteSlide(); }
  };
  const onPaste = async (e) => {
    if (busyField() || !ed.edit) return;
    const c = e.clipboardData, files = [...c.files].filter((f) => f.type.startsWith('image/')), raw = c.getData('application/x-savpre');
    if (raw) {
      e.preventDefault();
      try { const p = JSON.parse(raw); if (p.els) cloneInto(p.els, 24, 24); else if (p.slide) { const d = fixSlide(p.slide), els = {}; for (const el of Object.values(d.els)) els[uid()] = el; const sid = uid(); deck.do({ k: 'slide.add', s: sid, pos: deck.posAt(deck.index(ed.sid) + 1), d: { ...d, els } }); ed.goto(sid); } } catch { /* not ours */ }
      return;
    }
    if (files.length) { e.preventDefault(); return uploadFiles(files, (m) => ed.insertImage(m), (v) => ed.insertVideo(v)); }
    const html = c.getData('text/html'), txt = c.getData('text/plain');
    if (!txt) return;
    e.preventDefault();
    const v = (await import('./media.js')).parseVideo(txt);
    if (v) { let poster = ''; try { if (v.kind !== 'file') poster = (await api('media.poster', v)).media.src; } catch { /* without */ } return ed.insertVideo({ ...v, poster }); }
    const box = h('div'); box.append(fragment(html || textToHtml(txt)));
    const w = Math.min(ed.ctx.W * .6, 760 * ed.ctx.s);
    put({ t: 'text', role: 'body', ...centered(w, Math.min(ed.ctx.H * .7, 40 * ed.ctx.s * Math.max(1, Math.ceil(txt.length / 48)))), html: serialize(box) });
  };
  addEventListener('keydown', onKey); addEventListener('copy', onCopy); addEventListener('cut', onCopy); addEventListener('paste', onPaste);
  // buttons of the panel do not take the focus away from the text being written
  panel.addEventListener('mousedown', (e) => { if (ed.editing && !e.composedPath().some((x) => /^(INPUT|TEXTAREA)$/.test(x.tagName))) e.preventDefault(); });
  const onResize = () => { if (stripFit() !== stripW) { mobile() ? strip.setAttribute('direction', 'horizontal') : strip.removeAttribute('direction'); drawStrip(); } };
  addEventListener('resize', onResize);
  // the column changes width on its own too (shown again, a scroll bar): the small slides follow it
  if (typeof ResizeObserver === 'function') { let raf = 0; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(onResize); }).observe(strip); }
  // swipe between slides on phones (viewers)
  if (!ed.editor) { let x0 = null; stage.scroller.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true }); stage.scroller.addEventListener('touchend', (e) => { if (x0 == null || ed.picking) return; const dx = e.changedTouches[0].clientX - x0, l = deck.order(), i = deck.index(ed.sid); if (Math.abs(dx) > 60) ed.goto(l[clamp(i + (dx < 0 ? 1 : -1), 0, l.length - 1)].sid); }, { passive: true }); }

  let running = null;
  function show(from, opt) { if (!deck.slides.size || running) return; ed.closeText(); ed.saveNotes(); const cur = deck.slide(ed.sid); running = startShow(ed, from || (cur && !cur.d.hide ? ed.sid : undefined), opt); ed.onShowEnd = (sid) => { running = null; ed.goto(sid); stage.draw(); deck.setState({ s: sid }); }; }
  ed.show = show;
  ed.shortcuts = shortcuts;
  /** Someone is presenting: whoever has the presentation open can follow their slides. */
  function drawBanner() {
    const p = deck.people.find((x) => x.st?.pr), box = $('.banner', center);
    if (!p || running) return box.replaceChildren();
    if (box.dataset.c === p.c && box.firstChild) return;
    box.dataset.c = p.c;
    box.replaceChildren(h('sav-alert', { variant: 'primary' }, h('div.prow', h('span', t('is_presenting', { name: p.name || t('guest') })), h('div.spacer'), btn(t('follow'), () => show(p.st.s, { follow: p.c }), { size: 'sm', icon: 'play' }))));
  }
  function shortcuts() { const r = (k, v) => h('div.kr', h('span', t(v)), h('kbd', k)); dialog(t('shortcuts'), h('div.keys', r('F5', 'present'), r(C + 'Z', 'undo'), r(isMac ? '⇧⌘Z' : 'Ctrl+Y', 'redo'), r('T', 'text'), r('Ctrl+M', 'new_slide'), r(C + 'D', 'duplicate'), r(C + 'J', 'palette_l'), r(C + 'K', 'link'), r(C + 'F', 'find_replace'), r(C + 'G', 'group'), r(C + (isMac ? '⌥C' : 'Alt+C'), 'copy_style'), r('Enter', 'k_write'), r('Esc', 'k_esc'), r('↑ ↓ ← →', 'k_nudge'), r('Shift', 'k_shift'), r('Alt', 'k_alt'), r(C + '[  ]', 'k_order'), r(C + t('k_wheel_n'), 'k_wheel'), r('PgUp / PgDn', 'k_pages'), r(t('k_show_n'), 'k_show')), [], { width: '30rem' }); }

  const dropFeatures = addFeatures(ed);

  // ------------------------------------------------------------------ go
  if (ed.simple && ed.editor) readAll(ed);
  drawStrip(); stage.draw(); drawRail(); buttons(); setStatus(); drawBanner();
  app.classList.toggle('viewer', !ed.edit); app.classList.toggle('simple', ed.simple && ed.editor);
  if (q.get('comments')) setTab('comments'); else if (q.get('notes')) setTab('notes'); else if (ed.editor && !mobile()) setTab(ed.simple ? 'grid' : deck.slides.size ? 'elements' : 'layouts');
  deck.state = { s: ed.sid };
  deck.start();
  if (!deck.local) marks.load();
  if (data.deck.status === 'trashed') toast(t('deck_is_trashed'), 'warning');
  if (q.get('present')) show(ed.sid);
  // for automatic checks and the console
  window.__sp = ed;
  return { leave: () => { window.SavOffice?.exporter?.(null); ed.closeText(); saveNotes(); running?.close(); dropFeatures(); stage.leave(); deck.stop(); removeEventListener('keydown', onKey); removeEventListener('copy', onCopy); removeEventListener('cut', onCopy); removeEventListener('paste', onPaste); removeEventListener('resize', onResize); app.className = ''; $$('.ctxm,.ftb').forEach((x) => x.remove()); delete window.__sp; } };
}
