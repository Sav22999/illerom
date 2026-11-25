/** Comments (seen by everybody) and personal notes (seen only by their author), tied to a slide, an element or an area. */
import { state, api, get, h, icon, btn, iconBtn, item, oops, ok, ago, go, confirmBox, $ } from './core.js';
import { t } from './i18n.js';

export function createMarks(ed) {
  const deck = ed.deck;
  let comments = [], notes = [], showResolved = false, filter = 'slide', open = null, loaded = {};
  const m = {};

  m.load = async (kind) => {
    try {
      if (kind !== 'notes') comments = (await get('comment.list', { d: deck.uid })).comments;
      if (kind !== 'comments' && state.user) notes = (await get('note.list', { d: deck.uid })).notes;
      loaded = { comments: true, notes: true };
    } catch (e) { if (!e.network) oops(e); }
    ed.refreshMarks?.();
  };
  m.count = (kind) => (kind === 'comments' ? comments.filter((c) => !c.parent && !c.resolved).length : notes.length);
  const threads = () => comments.filter((c) => !c.parent && (showResolved || !c.resolved) && (deck.slide(c.s) || !c.s));
  const kindOf = () => (ed.tab === 'notes' ? 'notes' : ed.tab === 'comments' ? 'comments' : null);

  /** Numbered pins of the open panel, on the slide. */
  m.pins = (overlay, k) => {
    const kind = kindOf();
    if (!kind) return;
    const list = kind === 'notes' ? notes : threads();
    list.filter((c) => c.s === ed.sid).forEach((c, i) => {
      const el = c.a?.e && deck.el(ed.sid, c.a.e), b = el || (c.a?.x != null ? { x: c.a.x, y: c.a.y, w: c.a.w || 0, h: c.a.h || 0 } : null);
      if (!b) return;
      if (b.w && (open === c.id || el)) overlay.append(h('div.parea', { class: (open === c.id ? 'on ' : '') + kind, style: `left:${b.x * k}px;top:${b.y * k}px;width:${b.w * k}px;height:${b.h * k}px;${el?.r ? `transform:rotate(${el.r}deg)` : ''}` }));
      overlay.append(h('button.pin', { type: 'button', class: (open === c.id ? 'on ' : '') + kind, style: `left:${(b.x + b.w) * k}px;top:${b.y * k}px`, title: c.body.slice(0, 80), onclick: (e) => { e.stopPropagation(); open = c.id; ed.refreshMarks(); $(`[data-mark="${c.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, String(i + 1)));
    });
  };

  /** Choosing what a comment or note is about: a press on an element, or an area drawn on the slide. */
  async function choose() {
    ed.startPick(t('pick_hint'));
    return new Promise((resolve) => { ed.onPicked = resolve; });
  }
  function composer(kind) {
    let a = ed.sel.size === 1 ? { e: [...ed.sel][0] } : null;
    const text = h('sav-textarea', { placeholder: t(kind === 'notes' ? 'note_ph' : 'comment_ph'), rows: 2, resize: 'auto', maxlength: kind === 'notes' ? 4000 : 2000 });
    text.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
    const what = h('span.muted.what');
    const label = () => { what.textContent = a ? (a.e ? t('on_element') : t('on_area')) : t('on_slide'); };
    label();
    const send = async () => {
      const body = text.value.trim();
      if (!body) return text.focus();
      try { await api(kind === 'notes' ? 'note.save' : 'comment.add', { d: deck.uid, s: ed.sid, a, body }); text.value = ''; a = null; await m.load(kind); } catch (e) { oops(e); }
    };
    return h('div.composer', text, h('div.prow', btn(t('point_at'), async () => { const r = await choose(); if (r) { a = r; label(); text.focus(); } }, { size: 'sm', appearance: 'outline', variant: 'neutral', icon: 'pointer' }), what, h('div.spacer'), btn(t('send'), send, { size: 'sm' })));
  }
  const goTo = (c) => { open = c.id; if (c.s && c.s !== ed.sid && deck.slide(c.s)) ed.goto(c.s); else ed.refreshMarks(); };
  const where = (c) => (deck.slide(c.s) ? t('slide') + ' ' + (deck.index(c.s) + 1) : t('whole_deck'));
  const linkify = (body) => body.split(/(https?:\/\/[^\s<>"']+)/).map((p, i) => (i % 2 ? h('a', { href: p, target: '_blank', rel: 'noopener noreferrer nofollow' }, p) : p));
  const head = (title, kind) => h('div.phead2', h('sav-chip-group', { required: true, value: filter, label: title, onchange: (e) => { filter = e.detail?.value ?? e.target.value; ed.refreshMarks(); } }, ...['slide', 'all'].map((v) => h('sav-chip', { value: v, size: 'sm', selected: filter === v }, t('f_' + v + '_s')))), kind === 'comments' && h('sav-switch', { size: 'sm', checked: showResolved, onchange: (e) => { showResolved = e.target.checked; ed.refreshMarks(); } }, t('resolved')));
  const signIn = () => h('sav-empty-state', { heading: t('sign_in_first'), text: t('sign_in_first_t'), icon: 'user' }, btn(t('sign_in'), () => { sessionStorage.setItem('sp-back', location.pathname + location.search); go('?signin=login'); }));

  m.commentsPanel = () => {
    const list = threads().filter((c) => filter === 'all' || c.s === ed.sid);
    const one = (c, reply) => h('div.cm', h('sav-avatar', { 'auto-text': true, label: c.name, style: `--size:28px;background:${c.color};color:#fff;border-radius:50%` }), h('div', h('div.cmh', h('b', c.name), h('small', ago(c.at))), h('p', ...linkify(c.body)), h('div.cma',
      !reply && deck.canComment && (c.user === state.user?.id || deck.canEdit) && h('button.lk', { type: 'button', onclick: () => act('comment.resolve', { id: c.id, on: !c.resolved }) }, c.resolved ? t('reopen') : t('resolve')),
      c.user === state.user?.id && h('button.lk', { type: 'button', onclick: async () => { const { promptBox } = await import('./core.js'); const v = await promptBox(t('edit'), t('comment'), c.body, t('save'), 2000); if (v) act('comment.edit', { id: c.id, body: v }); } }, t('edit')),
      (c.user === state.user?.id || deck.role === 'owner') && h('button.lk', { type: 'button', onclick: async () => { if (await confirmBox(t('delete'), t('delete_comment_t'), t('delete'))) act('comment.delete', { id: c.id }); } }, t('delete')))));
    const act = async (a, data) => { try { await api(a, { d: deck.uid, ...data }); m.load('comments'); } catch (e) { oops(e); } };
    const thread = (c) => {
      const inp = h('sav-input', { size: 'sm', placeholder: t('reply'), maxlength: 2000 });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) act('comment.add', { parent: c.id, body: inp.value }); });
      return h('div.thread', { 'data-mark': c.id, class: (open === c.id ? 'on ' : '') + (c.resolved ? 'done' : ''), onclick: () => { if (open !== c.id) goTo(c); } }, h('small.muted', where(c)), one(c), ...comments.filter((r) => r.parent === c.id).map((r) => one(r, true)), deck.canComment && open === c.id && inp);
    };
    return h('div', deck.meta.opts.comments === false ? h('sav-alert', t('comments_are_off')) : !state.user ? signIn() : deck.canComment ? composer('comments') : h('p.muted', t('only_view')), head(t('comments'), 'comments'), list.length ? h('div', ...list.map(thread)) : h('p.muted.hint', t('no_comments')));
  };
  m.notesPanel = () => {
    if (!state.user) return signIn();
    const list = notes.filter((c) => filter === 'all' || c.s === ed.sid || !deck.slide(c.s));
    const act = async (a, data) => { try { await api(a, { d: deck.uid, ...data }); m.load('notes'); } catch (e) { oops(e); } };
    const note = (c) => {
      const tx = h('sav-textarea', { value: c.body, rows: 2, resize: 'auto', maxlength: 4000 });
      tx.addEventListener('keydown', (e) => e.stopPropagation());
      tx.addEventListener('change', () => { if (tx.value.trim() && tx.value.trim() !== c.body) act('note.save', { id: c.id, body: tx.value }); });
      return h('div.thread.note', { 'data-mark': c.id, class: open === c.id ? 'on' : '', onclick: () => { if (open !== c.id) goTo(c); } }, h('div.cmh', h('small.muted', where(c) + (c.a?.e ? ' · ' + t('on_element') : c.a ? ' · ' + t('on_area') : ''), ' · ', ago(c.at)), h('div.spacer'), iconBtn('trash', t('delete'), async () => { if (await confirmBox(t('delete'), t('delete_note_t'), t('delete'))) act('note.delete', { id: c.id }); }, { size: 'sm' })), tx);
    };
    return h('div', h('p.muted.hint', icon('lock'), ' ', t('notes_private')), composer('notes'), head(t('notes'), 'notes'), list.length ? h('div', ...list.map(note)) : h('p.muted.hint', t('no_notes')));
  };
  return m;
}
