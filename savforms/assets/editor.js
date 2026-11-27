/**
 * The editor of a form: its questions (the form as it will look, the chosen question opened for changes), its answers
 * (results.js) and its settings. It saves by itself while one works (forms.save, only the parts that changed). The look
 * (colour, font, background, picture on top) is in the side; on narrow screens it is a dialog.
 */
import { btn, colorPop, confirm, copyText, dialog, drop, dropBtn, empty, fail, h, icon, iconBtn, mobile, put, segmented, select, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, drop as dropForm, formLink, keep } from './store.js';
import { appsButton } from './office.js';
import { commands, go, userMenu } from './account.js';
import { CHOICE, KINDS, OTHER, STATIC, kindIcon, kindName, newItem, uid } from './models.js';
import { control, reqMark } from './inputs.js';
import { headCard, richText, themed } from './fill.js';
import { stateBadge } from './home.js';
import { LOCAL_TZ, ZONES, fromLocalInput, moment, toLocalInput } from './time.js';

const COLORS = ['#86329e', '#6a2cf0', '#1f56d1', '#0b7a87', '#0f8a63', '#c27a06', '#e0532f', '#c93a2f', '#c2307a', '#4a5875'];
const GRADED = ['single', 'dropdown', 'multi', 'short'];

/** A picture made smaller in the browser (at most `side` pixels, JPEG, under the limit of the server) as a data: URL. */
export async function shrinkImage(file, side = 1400, limit = 330000) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw Object.assign(new Error('bad_image'), { code: 'bad_image' });
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    let w = img.naturalWidth, hgt = img.naturalHeight, s = Math.min(1, side / Math.max(w, hgt));
    for (let q = .86; ; q -= .12) {
      const c = document.createElement('canvas');
      c.width = Math.round(w * s); c.height = Math.round(hgt * s);
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', Math.max(.4, q));
      if (d.length * .75 < limit) return d;
      if (q < .5) s *= .75;
    }
  } finally { URL.revokeObjectURL(url); }
}
const pickFile = (accept) => new Promise((ok) => { const i = h('input', { type: 'file', accept }); i.addEventListener('change', () => ok(i.files[0] || null)); i.click(); });

/** append() without the empty pieces (the native one writes "null"). */
const add = (n, ...kids) => { n.append(...kids.flat().filter((x) => x !== null && x !== undefined && x !== false)); return n; };

/** An input of text inside the form canvas that grows with what is written. */
function grow(tag, value, placeholder, oninput, o = {}) {
  const n = h(tag === 'input' ? 'input' : 'textarea', { class: 'ce ' + (o.cls || ''), value: tag === 'input' ? value || '' : null, placeholder, rows: tag === 'input' ? null : 1, maxlength: o.max || null, 'aria-label': o.label || placeholder, spellcheck: 'true' });
  if (tag !== 'input') n.value = value || '';
  const fit = () => { if (tag !== 'input') { n.style.height = 'auto'; n.style.height = n.scrollHeight + 'px'; } };
  n.addEventListener('input', () => { fit(); oninput(n.value); });
  n.addEventListener('keydown', (e) => { if (e.key === 'Enter' && tag === 'input' && o.onEnter) { e.preventDefault(); o.onEnter(); } });
  requestAnimationFrame(fit);
  new ResizeObserver(fit).observe(n);
  return n;
}

export async function editorScreen(root, id, tab = 'questions') {
  const r = await api('forms.get', undefined, { id });
  const F = r.form;
  let sel = null, pending = {}, timer = 0, saving = null, gone = false;
  const status = h('span.savest', { 'aria-live': 'polite' });
  const setStatus = (k) => { status.textContent = k ? t(k) : ''; status.dataset.s = k; };

  // ---------------------------------------------------------------- saving as one works
  async function flush() {
    clearTimeout(timer);
    if (!Object.keys(pending).length) return saving;
    const body = { id: F.id, ...pending };
    pending = {};
    setStatus('saving');
    saving = api('forms.save', body).then((res) => {
      Object.assign(F, { state: res.form.state, why: res.form.why, responses: res.form.responses, updated: res.form.updated });
      if ('items' in body) F.items.forEach((q, i) => { const s = res.form.items[i]; if (s && s.id !== q.id) q.id = s.id; });
      keep(res.form);
      if (!Object.keys(pending).length) setStatus('saved');
      refreshHead();
    }).catch((e) => { setStatus('not_saved'); Object.assign(pending, { ...body, ...pending }); delete pending.id; fail(e); });
    return saving;
  }
  const save = (part, now = false) => { Object.assign(pending, part); setStatus('changed'); clearTimeout(timer); timer = setTimeout(flush, now ? 0 : 700); };
  const saveItems = () => save({ items: F.items });
  const onUnload = (e) => { if (Object.keys(pending).length) { flush(); e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', onUnload);

  // ---------------------------------------------------------------- the bar
  const title = h('input.etitle', { value: F.title, placeholder: t('untitled'), maxlength: 200, 'aria-label': t('form_title') });
  title.addEventListener('input', () => { F.title = title.value; save({ title: F.title }); syncTitle(); });
  const badge = h('span.ebadge');
  const refreshHead = () => { put(badge, stateBadge(F)); tabs.querySelector('[value="answers"]')?.replaceChildren(...[icon('chart-column'), ' ', t('tab_answers'), F.responses ? h('span.tcount', String(F.responses)) : null].filter(Boolean)); };
  const tabs = segmented(t('tabs'), tab, [['questions', 'clipboard-list', t('tab_questions')], ['answers', 'chart-column', t('tab_answers')], ['settings', 'settings', t('tab_settings')]], (v) => { history.replaceState(null, '', '#/e/' + F.id + '/' + v); show(v); }, { class: 'etabs' });
  tabs.querySelectorAll('sav-radio').forEach((x) => x.append(' ', t('tab_' + x.getAttribute('value'))));
  const moreList = () => [
      ['copy-plus', t('duplicate'), async () => { await flush(); const x = await api('forms.duplicate', { id: F.id }); keep(x.form); go('#/e/' + x.form.id); }],
      ['download', t('download_savfor'), async () => { await flush(); (await import('./files.js')).saveSavfor(F.id, false); }],
      ['printer', t('print_form'), () => { flush(); window.open(formLink(F.id), '_blank', 'noopener'); }],
      '-', ['trash', t('delete_form'), async () => { if (!(await confirm(t('delete_form'), F.responses ? t('delete_form_answers', { n: F.responses }) : t('delete_form_text'), t('delete')))) return; pending = {}; await api('forms.delete', { id: F.id }); dropForm(F.id); go('#/'); }, { danger: true }],
  ];
  const shareBtn = btn(t('share'), { icon: 'send', variant: 'primary', appearance: 'solid', size: 'sm', onclick: () => shareDialog() });
  const bar = h('header.etop', iconBtn('arrow-left', t('back_forms'), () => go('#/')), h('img.elogo', { src: 'icons/favicon.svg', width: 30, height: 30, alt: '' }),
    h('div.etitlebox', title, h('div.emeta', badge, status)), h('div.spacer'),
    iconBtn('eye', t('preview'), () => { flush(); window.open(formLink(F.id), '_blank', 'noopener'); }), shareBtn,
    dropBtn('ellipsis-vertical', t('more'), moreList, { caret: false, placement: 'bottom-end' }), appsButton(), userMenu());
  const syncTitle = () => { document.title = (F.title || t('untitled')) + ' – SavForms'; const h1 = body.querySelector('.fhead .ftitle'); if (h1 && h1 !== document.activeElement) h1.value = F.title; };
  const body = h('div.ebody');
  put(root, h('div.editor', bar, h('div.etabbar', tabs), body));
  refreshHead();
  // the search of actions (⌘J / Ctrl+J): the tabs, then what the bar and its menu do
  commands([t('tabs'), [['clipboard-list', t('tab_questions'), () => { tabs.value = 'questions'; history.replaceState(null, '', '#/e/' + F.id + '/questions'); show('questions'); }], ['chart-column', t('tab_answers'), () => { tabs.value = 'answers'; history.replaceState(null, '', '#/e/' + F.id + '/answers'); show('answers'); }], ['settings', t('tab_settings'), () => { tabs.value = 'settings'; history.replaceState(null, '', '#/e/' + F.id + '/settings'); show('settings'); }]]],
    [t('more'), [['send', t('share'), () => shareDialog()], ['eye', t('preview'), () => { flush(); window.open(formLink(F.id), '_blank', 'noopener'); }], ...moreList().filter(Array.isArray).map(([ic, l, fn]) => [ic, l, fn]), ['arrow-left', t('back_forms'), '#/']]]);
  syncTitle();

  function show(v) {
    tab = v;
    if (v === 'answers') { flush(); import('./results.js').then((m) => { if (tab === 'answers' && !gone) m.ownerResults(body, F, { flush }); }); return; }
    if (v === 'settings') return settingsTab();
    questionsTab();
  }

  // ---------------------------------------------------------------- questions
  let canvas = null;
  function questionsTab() {
    canvas = themed(h('div.canvas'), F.theme);
    const side = mobile() ? null : lookPanel();
    put(body, h('div.qlayout', h('div.qcol', canvas), side ? h('aside.qside', side) : null));
    drawCanvas();
  }
  const pos = (qid) => F.items.findIndex((q) => q.id === qid);
  function addItem(k, after = sel) {
    const q = newItem(k);
    const i = after ? pos(after) + 1 : F.items.length;
    F.items.splice(i < 1 && after ? F.items.length : i, 0, q);
    sel = q.id;
    saveItems();
    drawCanvas();
    requestAnimationFrame(() => { const c = canvas.querySelector(`[data-id="${q.id}"]`); c?.scrollIntoView({ behavior: 'smooth', block: 'center' }); c?.querySelector('.qt-title')?.focus(); });
  }
  const addMenu = (label = t('add_question'), o = {}) => dropBtn('plus', label, () => {
    const groups = ['text', 'choice', 'scale', 'time', 'layout'];
    return groups.flatMap((g, gi) => [gi ? '-' : null, { head: t('g_' + g) }, ...KINDS.filter((k) => k[2] === g).map(([k, ic]) => [ic, kindName(k), () => addItem(k, o.after)])]).filter(Boolean);
  }, { text: true, appearance: o.appearance || 'outline', variant: o.variant || 'neutral', size: 'sm', placement: 'bottom-start' });

  function drawCanvas() {
    if (!canvas) return;
    const head = h('section.fcard.fhead.ehead' + (sel === 'head' ? '.on' : ''), { onclick: () => { if (sel === 'head') return; const prev = F.items.find((x) => x.id === sel); sel = 'head'; if (prev) redraw(prev); markSel(); } },
      F.theme.header ? h('img.fhimg', { src: F.theme.header, alt: '' }) : h('i.fband'),
      h('div.fcin', grow('input', F.title, t('untitled'), (v) => { F.title = v; title.value = v; save({ title: v }); }, { cls: 'ftitle', max: 200, label: t('form_title') }),
        grow('textarea', F.descr, t('form_descr_ph'), (v) => { F.descr = v; save({ descr: v }); }, { cls: 'fdescr', max: 5000 })));
    const list = h('div.qlist');
    F.items.forEach((q, i) => list.append(itemCard(q, i)));
    put(canvas, h('div.fwrap', head, list, F.items.length ? null : h('section.fcard.qempty', empty('clipboard-list', t('no_questions'), t('no_questions_t'))),
      h('div.addrow', addMenu(t('add_question'), { appearance: 'solid', variant: 'primary', after: null }), mobile() ? btn(t('look'), { icon: 'palette', size: 'sm', onclick: () => dialog({ title: t('look'), body: lookPanel(), width: '24rem' }) }) : null)));
  }
  const markSel = () => canvas?.querySelectorAll('.qcard, .ehead').forEach((c) => c.classList.toggle('on', (c.dataset.id || 'head') === sel));
  const redraw = (q) => { const old = canvas.querySelector(`[data-id="${q.id}"]`); if (old) old.replaceWith(itemCard(q, pos(q.id))); };

  function move(q, d) {
    const i = pos(q.id), j = i + d;
    if (j < 0 || j >= F.items.length) return;
    [F.items[i], F.items[j]] = [F.items[j], F.items[i]];
    saveItems(); drawCanvas();
    requestAnimationFrame(() => canvas.querySelector(`[data-id="${q.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

  function itemCard(q, i) {
    const on = sel === q.id;
    const card = h('section.fcard.qcard' + (on ? '.on' : '') + (q.t === 'section' ? '.qsec' : ''), { 'data-id': q.id, onclick: (e) => { if (sel === q.id) return; if (e.target.closest('sav-button,sav-dropdown,button')) return; sel = q.id; const prev = canvas.querySelector('.qcard.on'); if (prev) redraw(F.items.find((x) => x.id === prev.dataset.id) || q); redraw(q); markSel(); requestAnimationFrame(() => canvas.querySelector(`[data-id="${q.id}"] .qt-title`)?.focus()); } });
    // dragging a card by its handle moves it (on touch screens the arrows do it)
    const grip = h('div.qgrip', { draggable: 'true', title: t('drag_to_move') }, icon('grip-vertical'));
    grip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', q.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
    grip.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('dropto'); });
    card.addEventListener('dragleave', () => card.classList.remove('dropto'));
    card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('dropto'); const from = pos(e.dataTransfer.getData('text/plain')), to = pos(q.id); if (from < 0 || from === to) return; const [x] = F.items.splice(from, 1); F.items.splice(to, 0, x); saveItems(); drawCanvas(); });
    add(card, grip);
    if (!on) return previewCard(card, q, i);

    const changed = () => saveItems();
    const kind = select(null, KINDS.map(([k]) => [k, kindName(k)]), q.t, (v) => changeKind(q, v), { size: 'sm', class: 'qkind', 'aria-label': t('kind') });
    kind.prepend(icon(kindIcon(q.t), { slot: 'prefix' }));
    const head = h('div.qedit-head', grow('textarea', q.title, t(q.t === 'section' ? 'section_title_ph' : q.t === 'text' ? 'text_title_ph' : q.t === 'image' ? 'image_caption_ph' : 'question_ph'), (v) => { q.title = v; changed(); }, { cls: 'qt-title', max: 600 }), kind);
    const descr = q.t === 'image' ? null : grow('textarea', q.descr, t(q.t === 'text' || q.t === 'section' ? 'text_body_ph' : 'descr_ph'), (v) => { q.descr = v; changed(); }, { cls: 'qt-descr', max: 3000 });
    const quiz = F.settings.quiz && GRADED.includes(q.t);
    add(card, head, descr, kindBody(q, changed, quiz));

    const foot = h('div.qfoot',
      quiz ? h('div.points', icon('trophy'), h('sav-number-input', { value: q.points ?? 1, min: 0, max: 100, size: 'sm', limits: 'never', 'aria-label': t('points'), onchange: (e) => { q.points = Math.max(0, Math.min(100, +e.currentTarget.value || 0)); changed(); } }), h('small.muted', t('points'))) : null,
      h('div.spacer'),
      iconBtn('chevron-up', t('move_up'), () => move(q, -1), { disabled: i === 0 || null }), iconBtn('chevron-down', t('move_down'), () => move(q, 1), { disabled: i === F.items.length - 1 || null }),
      iconBtn('copy-plus', t('duplicate'), () => { const c = structuredClone(q); c.id = uid(); for (const k of ['opts', 'rows', 'cols']) if (c[k]) { const map = {}; c[k] = c[k].map((o) => { const n = uid(); map[o.id] = n; return { ...o, id: n }; }); if (k === 'opts' && c.correct) c.correct = c.correct.map((x) => map[x]).filter(Boolean); } F.items.splice(pos(q.id) + 1, 0, c); sel = c.id; saveItems(); drawCanvas(); }),
      iconBtn('trash', t('delete'), () => { const i2 = pos(q.id); F.items.splice(i2, 1); sel = F.items[Math.max(0, i2 - 1)]?.id || null; saveItems(); drawCanvas(); toast(t('question_deleted'), 'neutral', { duration: 5000 }); }),
      STATIC.includes(q.t) ? null : h('span.qsep'),
      STATIC.includes(q.t) ? null : (() => { const s = h('sav-switch', { checked: !!q.req || null, size: 'sm' }, t('required')); s.addEventListener('change', () => { q.req = s.checked; changed(); }); return s; })(),
      CHOICE.includes(q.t) ? dropBtn('ellipsis-vertical', t('more'), () => [
        ['shuffle', t('shuffle_opts'), () => { q.shuffle = !q.shuffle; changed(); redraw(q); }, { check: !!q.shuffle }],
        q.t === 'single' || q.t === 'multi' ? ['plus', t('other_option'), () => { q.other = !q.other; changed(); redraw(q); }, { check: !!q.other }] : null,
        q.t === 'multi' ? ['sliders-horizontal', t('how_many'), () => limitsDialog(q, () => { changed(); redraw(q); })] : null,
      ], { caret: false, placement: 'bottom-end' }) : null);
    add(card, foot);
    return card;
  }

  /** A question not chosen: as the people who answer will see it (its controls do nothing here). */
  function previewCard(card, q) {
    if (q.t === 'section') add(card, h('div.secmark', icon('rows-3'), t('k_section')), h('h2', q.title || t('k_section')), q.descr ? richText(q.descr) : null);
    else if (q.t === 'text') add(card, q.title ? h('h2', q.title) : h('h2.muted', t('k_text')), q.descr ? richText(q.descr) : null);
    else if (q.t === 'image') add(card, q.src ? h('img.qimg', { src: q.src, alt: q.alt || '' }) : h('div.noimg', icon('image'), t('no_image')), q.title ? h('p.cap', q.title) : null);
    else add(card, h('h3.qtitle', h('span', q.title || h('span.muted', t('untitled_q'))), q.req ? reqMark() : null), q.descr ? richText(q.descr, 'div.qdescr') : null, h('div.qprev', control(q, {}, { disabled: true })));
    return card;
  }

  function changeKind(q, k) {
    if (k === q.t) return;
    const fresh = newItem(k, { id: q.id, title: q.title, descr: q.descr });
    if (!STATIC.includes(k)) fresh.req = !!q.req;
    // the choices go from one kind of choice to the other
    if (CHOICE.includes(k) && q.opts) fresh.opts = q.opts;
    if ((k === 'grid' || k === 'checkgrid') && q.rows) Object.assign(fresh, { rows: q.rows, cols: q.cols });
    Object.keys(q).forEach((x) => delete q[x]);
    Object.assign(q, fresh);
    saveItems();
    redraw(q);
  }

  /** The list of choices (or rows, or columns) of a question, with "correct" for a quiz. */
  function optList(q, key, changed, o = {}) {
    const box = h('div.opts');
    const marker = (j) => q.t === 'ranking' ? h('b.onum', String(j + 1)) : icon(o.icon || (q.t === 'multi' || q.t === 'checkgrid' ? 'square' : q.t === 'dropdown' ? 'hash' : 'circle'));
    const draw = (focus) => {
      put(box, q[key].map((op, j) => {
        const inp = grow('input', op.label, o.ph ? o.ph(j + 1) : t('option_n', { n: j + 1 }), (v) => { op.label = v; changed(); }, { cls: 'optin', max: 300, onEnter: () => { addAt(j + 1); } });
        inp.addEventListener('paste', (e) => {
          const lines = (e.clipboardData?.getData('text') || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          if (lines.length < 2) return;
          e.preventDefault();
          op.label = lines[0];
          q[key].splice(j + 1, 0, ...lines.slice(1, 100).map((label) => ({ id: uid(), label })));
          changed(); draw();
        });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && q[key].length > 1) { e.preventDefault(); remove(j, true); } });
        const correct = o.quiz ? (() => {
          const isOn = (q.correct || []).includes(op.id);
          return iconBtn(isOn ? 'circle-check' : 'circle', t(isOn ? 'is_correct' : 'mark_correct'), () => { const c = new Set(q.correct || []); if (c.has(op.id)) c.delete(op.id); else { if (q.t !== 'multi') c.clear(); c.add(op.id); } q.correct = [...c]; changed(); draw(); }, { class: 'corr' + (isOn ? ' on' : '') });
        })() : null;
        return h('div.optrow' + (o.quiz && (q.correct || []).includes(op.id) ? '.right' : ''), marker(j), inp, correct, q[key].length > 1 ? iconBtn('x', t('remove'), () => remove(j)) : null);
      }), q[key].length < (o.max || 100) ? h('div.optrow.addopt', marker(q[key].length), h('button.linkbtn', { type: 'button', onclick: () => addAt(q[key].length) }, o.addLabel || t('add_option')),
        key === 'opts' && q.other ? h('span.muted', ' · ', t('other_added')) : key === 'opts' && (q.t === 'single' || q.t === 'multi') ? [h('span.muted', ' ' + t('or') + ' '), h('button.linkbtn', { type: 'button', onclick: () => { q.other = true; changed(); redraw(q); } }, t('add_other'))] : null) : null,
      key === 'opts' && q.other ? h('div.optrow.other', marker(q[key].length), h('span.muted.grow', t('other') + '…'), iconBtn('x', t('remove'), () => { q.other = false; changed(); redraw(q); })) : null);
      if (focus != null) requestAnimationFrame(() => box.querySelectorAll('.optin')[focus]?.focus());
    };
    const addAt = (j) => { q[key].splice(j, 0, { id: uid(), label: '' }); changed(); draw(j); };
    const remove = (j, focusPrev) => { const [x] = q[key].splice(j, 1); if (q.correct) q.correct = q.correct.filter((c) => c !== x.id); changed(); draw(focusPrev ? Math.max(0, j - 1) : null); };
    draw();
    return box;
  }

  function kindBody(q, changed, quiz) {
    const num = (label, v, set, o = {}) => { const n = h('sav-number-input', { label, value: v ?? '', size: 'sm', limits: 'never', ...o }); n.addEventListener('change', () => { const x = String(n.value).trim() === '' ? null : Number(String(n.value).replace(',', '.')); set(Number.isFinite(x) ? x : null); changed(); }); return n; };
    const line = (label, v, set, o = {}) => { const i = h('sav-input', { label, value: v || '', size: 'sm', ...o }); i.addEventListener('input', () => { set(i.value); changed(); }); return i; };
    switch (q.t) {
      case 'single': case 'multi': case 'dropdown': case 'ranking':
        return h('div.kbody', optList(q, 'opts', changed, { quiz: quiz && q.t !== 'ranking' }), quiz && !(q.correct || []).length ? h('small.muted.qhint', icon('info'), ' ', t('quiz_mark_hint')) : null);
      case 'grid': case 'checkgrid':
        return h('div.kbody.grid2', h('div', h('span.flabel', t('rows')), optList(q, 'rows', changed, { icon: 'rows-3', ph: (n) => t('row_n', { n }), addLabel: t('add_row'), max: 50 })), h('div', h('span.flabel', t('cols')), optList(q, 'cols', changed, { icon: q.t === 'grid' ? 'circle' : 'square', ph: (n) => t('col_n', { n }), addLabel: t('add_col'), max: 20 })));
      case 'scale':
        return h('div.kbody', h('div.prow.wrap', select(t('from'), [['0', '0'], ['1', '1']], String(q.min), (v) => { q.min = +v; changed(); redraw(q); }, { size: 'sm', class: 'w6' }), select(t('to'), Array.from({ length: 9 }, (_, i) => [String(i + 2), String(i + 2)]), String(q.max), (v) => { q.max = +v; changed(); redraw(q); }, { size: 'sm', class: 'w6' })),
          h('div.grid2', line(t('label_n', { n: q.min }), q.minLabel, (v) => { q.minLabel = v; }, { maxlength: 60, placeholder: t('scale_low_ph') }), line(t('label_n', { n: q.max }), q.maxLabel, (v) => { q.maxLabel = v; }, { maxlength: 60, placeholder: t('scale_high_ph') })),
          h('div.qprev', control(q, {}, { disabled: true })));
      case 'rating':
        return h('div.kbody', h('div.prow.wrap', select(t('levels'), Array.from({ length: 8 }, (_, i) => [String(i + 3), String(i + 3)]), String(q.max), (v) => { q.max = +v; changed(); redraw(q); }, { size: 'sm', class: 'w6' }),
          segmented(t('shape'), q.icon, [['star', 'star', t('star')], ['heart', 'heart', t('heart')], ['thumbs-up', 'thumbs-up', t('thumb')], ['smile', 'smile', t('smile')]], (v) => { q.icon = v; changed(); redraw(q); })), h('div.qprev', control(q, {}, { disabled: true })));
      case 'number':
        return h('div.kbody', h('div.prow.wrap', num(t('min'), q.min, (v) => { q.min = v; }), num(t('max'), q.max, (v) => { q.max = v; }), (() => { const s = h('sav-switch', { checked: !!q.int || null, size: 'sm' }, t('whole_numbers')); s.addEventListener('change', () => { q.int = s.checked; changed(); }); return s; })()), h('div.qprev', control(q, {}, { disabled: true })));
      case 'short': case 'long':
        return h('div.kbody', h('div.qprev', control(q, {}, { disabled: true })), h('div.prow.wrap', num(t('max_chars'), q.max || null, (v) => { q.max = v ? Math.round(v) : 0; }, { min: 0, max: q.t === 'short' ? 500 : 10000, placeholder: t('no_limit') })),
          quiz && q.t === 'short' ? line(t('right_answers'), (q.correct || []).join(' | '), (v) => { q.correct = v.split('|').map((s) => s.trim()).filter(Boolean); }, { help: t('right_answers_t') }) : null);
      case 'email': case 'date': case 'time':
        return h('div.kbody', h('div.qprev', control(q, {}, { disabled: true })));
      case 'image': {
        const pic = h('div.imgbox', q.src ? h('img.qimg', { src: q.src, alt: q.alt || '' }) : h('div.noimg', icon('image'), t('no_image')));
        return h('div.kbody', pic, h('div.prow.wrap', btn(t(q.src ? 'replace_image' : 'choose_image'), { icon: 'upload', size: 'sm', onclick: async () => { const f = await pickFile('image/png,image/jpeg,image/webp,image/gif'); if (!f) return; q.src = await shrinkImage(f); changed(); redraw(q); } }),
          q.src ? btn(t('remove'), { icon: 'trash', size: 'sm', appearance: 'ghost', onclick: () => { q.src = ''; changed(); redraw(q); } }) : null), line(t('alt_text'), q.alt, (v) => { q.alt = v; }, { maxlength: 300, help: t('alt_text_t') }));
      }
    }
    return null;
  }

  function limitsDialog(q, done) {
    const n = q.opts.length + (q.other ? 1 : 0);
    const opts = [['0', t('no_limit')], ...Array.from({ length: n }, (_, i) => [String(i + 1), String(i + 1)])];
    let mn = String(q.min || 0), mx = String(q.max || 0);
    dialog({ title: t('how_many'), width: '24rem', body: h('div.form', h('p.muted', t('how_many_t')), select(t('at_least_n'), opts, mn, (v) => { mn = v; }), select(t('at_most_n'), opts, mx, (v) => { mx = v; })),
      actions: [{ label: t('cancel') }, { label: t('save'), primary: true, run: () => { q.min = +mn; q.max = +mx && +mx < +mn ? +mn : +mx; done(); } }] });
  }

  // ---------------------------------------------------------------- look
  function lookPanel() {
    const th = F.theme, set = (p) => { Object.assign(th, p); save({ theme: th }); if (canvas) { canvas.className = 'canvas'; themed(canvas, th); } };
    const cp = h('sav-color-picker', { value: th.color, swatches: COLORS.join(' '), picker: 'custom', size: 'sm', 'aria-label': t('color') });
    cp.addEventListener('change', (e) => { const v = String(e.detail?.value ?? cp.value).toLowerCase(); if (/^#[0-9a-f]{6}$/.test(v)) set({ color: v }); });
    const header = h('div.hdrbox', th.header ? h('img', { src: th.header, alt: '' }) : h('small.muted', t('no_header')));
    return h('div.look', h('h3', icon('palette'), ' ', t('look')),
      h('div', h('span.flabel', t('color')), cp),
      select(t('font'), [['sans', t('font_sans')], ['serif', t('font_serif')], ['rounded', t('font_rounded')], ['mono', t('font_mono')]], th.font, (v) => set({ font: v }), { size: 'sm' }),
      select(t('background'), [['tint', t('back_tint')], ['plain', t('back_plain')], ['dots', t('back_dots')], ['waves', t('back_waves')]], th.back, (v) => set({ back: v }), { size: 'sm' }),
      h('div', h('span.flabel', t('header_image')), header, h('div.prow', btn(t(th.header ? 'replace_image' : 'choose_image'), { icon: 'upload', size: 'sm', onclick: async () => { const f = await pickFile('image/png,image/jpeg,image/webp'); if (!f) return; set({ header: await shrinkImage(f, 1600, 300000) }); put(header, h('img', { src: th.header, alt: '' })); drawCanvas(); } }),
        btn(t('remove'), { size: 'sm', appearance: 'ghost', onclick: () => { set({ header: '' }); put(header, h('small.muted', t('no_header'))); drawCanvas(); } }))),
      h('sav-divider'), h('h3', icon('plus'), ' ', t('add')), h('div.addgrid', KINDS.map(([k, ic]) => h('button.addk', { type: 'button', title: kindName(k), onclick: () => addItem(k) }, icon(ic), h('span', kindName(k))))));
  }

  // ---------------------------------------------------------------- settings
  function settingsTab() {
    const st = F.settings;
    const row = (label, help, control) => h('div.orow', h('div.orow-t', h('b', label), help ? h('small', help) : null), h('div.orow-c', control));
    const section = (title, text, ...rows) => h('div.osec', h('h2', title), text ? h('p.muted', text) : null, h('sav-card.ocard', { appearance: 'outlined' }, h('div.orows', rows.filter(Boolean))));
    const sw = (k, label, help, o = {}) => { const s = h('sav-switch', { checked: !!st[k] || null, disabled: o.disabled || null, 'aria-label': label }); s.addEventListener('change', () => { st[k] = s.checked; o.then?.(s.checked); save({ settings: st }); if (o.redraw) settingsTab(); }); return row(label, help, s); };
    const when = (key, label, help) => {
      const i = h('sav-date-picker', { mode: 'datetime', value: toLocalInput(F[key], F.tz), placeholder: t('not_set'), size: 'sm', 'aria-label': label });
      i.addEventListener('change', () => { F[key] = fromLocalInput(i.value, F.tz); save({ [key]: F[key] }, true); settingsTab(); });
      return row(label, help, h('div.prow', i, F[key] ? iconBtn('x', t('remove'), () => { F[key] = null; save({ [key]: null }, true); settingsTab(); }) : null));
    };
    const accept = h('sav-switch', { checked: F.accepting || null, 'aria-label': t('accepting') });
    accept.addEventListener('change', () => { F.accepting = accept.checked; save({ accepting: F.accepting }, true); });
    const limit = h('sav-number-input', { value: st.limit || '', min: 0, max: 20000, size: 'sm', placeholder: t('no_limit'), limits: 'never', 'aria-label': t('limit') });
    limit.addEventListener('change', () => { st.limit = Math.max(0, Math.round(+limit.value || 0)); save({ settings: st }); });
    const text = (k, label, ph) => { const a = h('sav-textarea', { value: st[k] || '', rows: 3, resize: 'auto', maxlength: 2000, placeholder: ph, 'aria-label': label }); a.addEventListener('input', () => { st[k] = a.value; save({ settings: st }); }); return a; };
    const calLink = F.closes ? btn(t('see_in_calendar'), { size: 'sm', appearance: 'ghost', icon: 'external-link', href: S.calendarUrl + '#/day/' + toLocalInput(F.closes, F.tz).slice(0, 10) }) : null;
    const inCal = h('sav-switch', { checked: F.inCalendar || null, 'aria-label': t('in_calendar') });
    inCal.addEventListener('change', () => { F.inCalendar = inCal.checked; save({ inCalendar: F.inCalendar }, true); });

    put(body, h('main.smain.esettings',
      section(t('s_answers'), t('s_answers_t'),
        row(t('accepting'), t('accepting_t'), accept),
        when('opens', t('opens_at'), t('opens_at_t')),
        when('closes', t('deadline'), F.closes ? t('deadline_on', { w: moment(F.closes, F.tz) }) : t('deadline_t')),
        row(t('in_calendar'), t('in_calendar_t'), h('div.prow', calLink, inCal)),
        row(t('timezone'), t('timezone_form_t'), select(null, ZONES.map((z) => [z, z.replace(/_/g, ' ')]), F.tz || LOCAL_TZ, (v) => { F.tz = v; save({ tz: v }, true); settingsTab(); }, { size: 'sm', searchable: true, 'aria-label': t('timezone') })),
        row(t('limit'), t('limit_t'), limit)),
      section(t('s_people'), t('s_people_t'),
        row(t('collect_email'), t('collect_email_t'), select(null, [['none', t('ce_none')], ['ask', t('ce_ask')], ['account', t('ce_account')]], st.collectEmail, (v) => { st.collectEmail = v; if (v === 'account') st.requireSignin = true; save({ settings: st }); settingsTab(); }, { size: 'sm', 'aria-label': t('collect_email') })),
        sw('requireSignin', t('require_signin'), t('require_signin_t'), { disabled: st.collectEmail === 'account' || st.onePerPerson }),
        sw('onePerPerson', t('one_per_person'), t('one_per_person_t'), { then: (v) => { if (v) st.requireSignin = true; }, redraw: true }),
        sw('allowEdit', t('allow_edit'), t('allow_edit_t'))),
      section(t('s_after'), t('s_after_t'),
        row(t('confirm_msg'), t('confirm_msg_t'), text('confirm', t('confirm_msg'), t('answers_sent_t'))),
        sw('showSummary', t('show_summary'), t('show_summary_t')),
        sw('anotherLink', t('another_link'), t('another_link_t')),
        row(t('closed_msg'), t('closed_msg_t'), text('closedMsg', t('closed_msg'), t('form_closed_t')))),
      section(t('s_quiz'), t('s_quiz_t'),
        sw('quiz', t('quiz_mode'), t('quiz_mode_t'), { redraw: true }),
        st.quiz ? sw('showScore', t('show_score'), t('show_score_t')) : null,
        st.quiz ? sw('showAnswers', t('show_answers'), t('show_answers_t')) : null),
      section(t('s_present'), null, sw('progress', t('progress_bar'), t('progress_bar_t')), sw('shuffleQuestions', t('shuffle_q'), t('shuffle_q_t'))),
      section(t('s_notify'), null, sw('notify', t('notify_each'), S.config.mailReady === false ? t('mail_off') : t('notify_each_t', { e: S.user.email })))));
  }

  // ---------------------------------------------------------------- sharing
  function shareDialog() {
    flush();
    const link = formLink(F.id);
    const mail = `mailto:?subject=${encodeURIComponent(F.title || t('untitled'))}&body=${encodeURIComponent(t('share_mail_body') + '\n\n' + link)}`;
    const accept = h('sav-switch', { checked: F.accepting || null }, t('accepting'));
    accept.addEventListener('change', () => { F.accepting = accept.checked; save({ accepting: F.accepting }, true); });
    dialog({ title: t('share_form'), width: '32rem', body: h('div.share',
      h('section', h('h3', t('share_link')), h('div.linkrow', h('code', link), btn(t('copy'), { icon: 'copy', variant: 'primary', appearance: 'solid', onclick: () => copyText(link, t('link_copied')) })),
        h('div.prow.wrap', btn(t('open'), { icon: 'external-link', size: 'sm', appearance: 'ghost', href: link, target: '_blank' }), btn(t('by_email'), { icon: 'mail', size: 'sm', appearance: 'ghost', href: mail }),
          navigator.share ? btn(t('share_other'), { icon: 'share-2', size: 'sm', appearance: 'ghost', onclick: () => navigator.share({ title: F.title, url: link }).catch(() => {}) }) : null)),
      h('section', h('h3', t('who_answers')), accept, h('small.muted', [F.settings.requireSignin ? t('who_signin') : t('who_anyone'), F.closes ? t('deadline_on', { w: moment(F.closes, F.tz) }) : null].filter(Boolean).join(' · ')),
        btn(t('more_settings'), { size: 'sm', appearance: 'ghost', icon: 'settings', onclick: () => { document.querySelector('sav-dialog')?.hide(); tabs.value = 'settings'; history.replaceState(null, '', '#/e/' + F.id + '/settings'); show('settings'); } }))), actions: [{ label: t('close') }] });
  }

  show(tab);
  return () => { gone = true; removeEventListener('beforeunload', onUnload); flush(); };
}
