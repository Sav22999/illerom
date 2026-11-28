/**
 * Answering a form (#/f/<form>, #/f/<form>/e/<secret> to change answers already sent): anybody with the link, no account
 * needed unless the form asks for one. Pages start at every "section"; the answers being written are kept in this browser
 * until they are sent (a closed tab loses nothing). The look is the one chosen by the author: colour, font, background.
 */
import { btn, copyText, empty, errText, h, icon, primary, put, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, formLink } from './store.js';
import { go, langButton } from './account.js';
import { answered, control, problem, reqMark } from './inputs.js';
import { OTHER, STATIC } from './models.js';
import { moment } from './time.js';

const draftKey = (id) => 'savforms-draft-' + id;
const readDraft = (id) => { try { return JSON.parse(localStorage.getItem(draftKey(id)) || 'null'); } catch { return null; } };
const writeDraft = (id, v) => { try { if (v) localStorage.setItem(draftKey(id), JSON.stringify(v)); else localStorage.removeItem(draftKey(id)); } catch { /* private mode */ } };

/** Text of the author with its line breaks, and the addresses in it as links. */
export function richText(s, tag = 'p') {
  const n = h(tag + '.rich');
  for (const [i, line] of String(s || '').split('\n').entries()) {
    if (i) n.append(h('br'));
    for (const part of line.split(/(https?:\/\/[^\s<>"]+)/g)) n.append(/^https?:\/\//.test(part) ? h('a', { href: part, target: '_blank', rel: 'noopener nofollow ugc' }, part) : part);
  }
  return n;
}

/** The look of a form on the page that holds it: colour (--fc), font, background. */
export function themed(box, theme) {
  box.classList.add('themed', 'font-' + (theme.font || 'sans'), 'back-' + (theme.back || 'tint'));
  box.style.setProperty('--fc', theme.color || '#86329e');
  return box;
}

/** The head of a form: the band (or the picture) in its colour, the title and the description. */
export function headCard(f, ...extra) {
  return h('section.fcard.fhead', f.theme?.header ? h('img.fhimg', { src: f.theme.header, alt: '' }) : h('i.fband'),
    h('div.fcin', h('h1', f.title || t('untitled')), f.descr ? richText(f.descr) : null, ...extra));
}

/** The pages of a form: a new one at every section ([{section, items}]). */
export function pagesOf(items) {
  const pages = [{ section: null, items: [] }];
  for (const q of items) { if (q.t === 'section') pages.push({ section: q, items: [] }); else pages[pages.length - 1].items.push(q); }
  return pages.filter((p, i) => i === 0 || p.items.length || p.section?.descr);
}

export async function fillScreen(root, id, editToken = '') {
  scrollTo(0, 0);
  put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  let r;
  try { r = await api('pub.form', undefined, { id, edit: editToken }); } catch (e) {
    put(root, h('div.fill.themed.back-tint', h('main.fwrap', h('section.fcard', empty(e.code === 'not_found' ? 'circle-x' : 'cloud-off', e.code === 'not_found' ? t('form_missing') : errText(e), e.code === 'not_found' ? t('form_missing_t') : '')))));
    return () => {};
  }
  const f = r.form, set = f.settings, me = r.me, mine = r.mine;
  document.title = (f.title || t('untitled')) + ' – SavForms';
  document.body.classList.add('filling');
  const page = themed(h('div.fill'), f.theme), main = h('main.fwrap');
  const top = h('header.ftop', h('a.fbrand', { href: './', title: 'SavForms' }, h('img', { src: 'icons/favicon.svg', width: 22, height: 22, alt: '' }), h('span', 'Sav', h('b', 'Forms'))), h('div.spacer'),
    f.isOwner ? btn(t('edit_form'), { icon: 'pencil', size: 'sm', appearance: 'outline', href: '#/e/' + f.id }) : null, langButton());
  put(root, page);
  page.append(top, main, h('footer.ffoot', h('span', t('made_with'), ' ', h('a', { href: './' }, 'SavForms')), h('a', { href: 'privacy.html' }, 'Privacy'), h('a', { href: 'terms.html' }, t('terms_c')), h('span.muted', t('never_passwords'))));

  const stop = (ic, title, text, ...kids) => put(main, headCard(f), h('section.fcard.fstop', empty(ic, title, text || '', ...kids)));
  const summaryBtn = () => (set.showSummary ? btn(t('see_results'), { icon: 'chart-column', href: '#/s/' + f.id }) : null);

  // who may answer
  const editing = !!(mine && mine.answers && set.allowEdit);
  if (set.requireSignin && !me) {
    stop('lock', t('signin_to_answer'), t('signin_to_answer_t'), primary(t('sign_in'), { icon: 'log-in', onclick: () => { sessionStorage.setItem('savforms-next', location.hash); go('#/signin'); } }));
    return () => {};
  }
  if (set.requireSignin && me && !me.verified) { stop('mail', t('unverified'), me.email); return () => {}; }
  if (mine && set.onePerPerson && !set.allowEdit) { stop('circle-check', t('already_answered'), t('already_answered_t', { w: moment(mine.when) }), summaryBtn()); return () => {}; }
  if (f.state !== 'open' && !(editing && f.state === 'full')) {
    const why = f.state === 'soon' ? t('opens_on', { w: moment(f.opens, f.tz) }) : f.state === 'full' ? t('form_full_t') : f.why === 'deadline' ? t('ended_on', { w: moment(f.closes, f.tz) }) : t('form_closed_t');
    stop(f.state === 'soon' ? 'calendar-clock' : 'door-closed', t(f.state === 'soon' ? 'form_soon' : f.state === 'full' ? 'form_full' : 'form_closed'), set.closedMsg || why, summaryBtn());
    return () => {};
  }

  // the answers being written: those sent before (to change them), or the draft of this browser
  const A = editing ? { ...mine.answers } : { ...(readDraft(f.id)?.answers || {}) };
  const who = { email: editing ? mine.email || '' : readDraft(f.id)?.email || '', name: editing ? mine.name || '' : readDraft(f.id)?.name || '' };
  const started = Date.now();
  let saveT = 0;
  const saveDraft = () => { if (editing) return; clearTimeout(saveT); saveT = setTimeout(() => writeDraft(f.id, { answers: A, email: who.email, name: who.name, at: Date.now() }), 400); };

  // the questions of each page, shuffled once when the form asks for it
  const pages = pagesOf(f.items).map((p) => ({ ...p, items: set.shuffleQuestions ? [...p.items].sort(() => Math.random() - .5) : p.items }));
  let at = 0;
  const trail = []; // the pages gone through, for Back: with jumps the one before is not always at - 1
  /** Where the page leads (as the server reckons, lib/forms.php form_path): the first answered choice of the page that sends
   *  somewhere, otherwise where its section says; -1 = the form ends here. */
  const order = new Map(f.items.map((q, i) => [q.id, i]));
  const pageOfSection = (sid) => { const i = order.get(sid); if (i == null) return null; const n = pages.findIndex((pg) => pg.section && order.get(pg.section.id) >= i); return n < 0 ? -1 : n; };
  function nextOf(n) {
    const p = pages[n];
    let go = null;
    for (const q of p.items) if (go === null && q.branch && typeof A[q.id] === 'string') go = (q.opts || []).find((o) => o.id === A[q.id])?.go ?? null;
    if (go === null && p.section?.go) go = p.section.go;
    if (go === 'submit') return -1;
    const to = go ? pageOfSection(go) : null;
    if (to != null && to > n) return to;
    return n + 1 < pages.length ? n + 1 : -1;
  }
  const cards = new Map();
  const showErr = (qid, key) => { const c = cards.get(qid); if (!c) return; const e = c.querySelector('.qerr'); e.textContent = key ? t(key) : ''; e.hidden = !key; c.classList.toggle('bad', !!key); };

  const qCard = (q) => {
    if (q.t === 'text') return h('section.fcard.ftext', q.title ? h('h2', q.title) : null, q.descr ? richText(q.descr) : null);
    if (q.t === 'image') return h('section.fcard.fimage', q.src ? h('img', { src: q.src, alt: q.alt || '', loading: 'lazy' }) : null, q.title ? h('p.cap', q.title) : null);
    const card = h('section.fcard.fq', { 'data-id': q.id }, h('h3.qtitle', h('span', q.title || t('untitled_q')), q.req ? reqMark() : null), q.descr ? richText(q.descr, 'div.qdescr') : null,
      control(q, A, { shuffle: true, onChange: () => { showErr(q.id, ''); saveDraft(); progress(); if (q.branch) paintNav?.(); } }), h('p.qerr', { hidden: true, role: 'alert' }));
    cards.set(q.id, card);
    return card;
  };
  const whoCard = () => {
    if (set.collectEmail === 'account' && me) return h('section.fcard.fwho', icon('user-check'), h('span', t('answering_as', { n: me.name, e: me.email })));
    if (set.collectEmail !== 'ask') return null;
    const em = h('sav-input', { type: 'email', value: who.email, label: t('your_email'), required: true, autocomplete: 'email', placeholder: t('email_ph') });
    const nm = h('sav-input', { value: who.name, label: t('your_name_opt'), autocomplete: 'name', maxlength: 80 });
    em.addEventListener('input', () => { who.email = em.value.trim(); showErr('_email', ''); saveDraft(); });
    nm.addEventListener('input', () => { who.name = nm.value.trim(); saveDraft(); });
    const card = h('section.fcard.fq.fwhoask', { 'data-id': '_email' }, h('div.grid2', em, nm), h('small.muted', t('email_why')), h('p.qerr', { hidden: true, role: 'alert' }));
    cards.set('_email', card);
    return card;
  };
  const bar = h('sav-progress-bar.fprog', { value: 0, 'aria-label': t('progress') });
  const progress = () => { const all = f.items.filter((q) => !STATIC.includes(q.t)); bar.value = Math.round((100 * all.filter((q) => answered(q, A)).length) / Math.max(1, all.length)); };

  const check = (p) => {
    let first = null;
    if (at === 0 && set.collectEmail === 'ask' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email)) { showErr('_email', 'err_answer_email'); first = '_email'; }
    for (const q of p.items) { if (STATIC.includes(q.t)) continue; const k = problem(q, A); showErr(q.id, k); if (k && !first) first = q.id; }
    if (first) { cards.get(first)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); cards.get(first)?.querySelector('sav-input,sav-textarea,sav-select,sav-radio-group,input,button')?.focus?.(); }
    return !first;
  };

  const hp = h('input.hp', { type: 'text', name: 'website', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' }); // only machines fill it in

  async function send(b) {
    const p = pages[at];
    if (!check(p)) return;
    // every page before must be right too (a page may have been skipped by the address)
    for (let i = 0; i >= 0 && i < pages.length; i = nextOf(i)) if (pages[i].items.some((q) => !STATIC.includes(q.t) && problem(q, A))) { at = i; draw(); check(pages[i]); return; }
    // only the answers of questions that are still there
    const ids = new Set(f.items.map((q) => q.id)), out = {};
    for (const [k, v] of Object.entries(A)) if (ids.has(k.replace(OTHER, ''))) out[k] = v;
    try {
      const res = await api('pub.submit', { id: f.id, answers: out, email: who.email, name: who.name, seconds: Math.round((Date.now() - started) / 1000), edit: editToken || undefined, website: hp.value });
      clearTimeout(saveT);
      writeDraft(f.id, null);
      done(res);
    } catch (e) {
      if (e.data?.question) { const qid = e.data.question, i = pages.findIndex((pg) => pg.items.some((q) => q.id === qid)); if (i >= 0 && i !== at) { at = i; draw(); } showErr(qid, 'err_' + e.code); cards.get(qid)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (e.code === 'csrf' || e.code === 'unauthenticated') { toast(t('err_csrf'), 'danger'); return; }
      throw e;
    }
  }

  function done(res) {
    const link = res.edit ? formLink(f.id) + '/e/' + res.edit : '';
    const quiz = res.quiz;
    const review = quiz ? h('div.review', f.items.filter((q) => quiz.per[q.id]).map((q) => {
      const p = quiz.per[q.id], right = quiz.correct?.[q.id];
      const names = right ? (q.opts ? right.map((x) => q.opts.find((o) => o.id === x)?.label).filter(Boolean) : right).join(', ') : '';
      return h('div.rv' + (p.right ? '.ok' : '.no'), icon(p.right ? 'circle-check' : 'circle-x'), h('div.grow', h('b', q.title || t('untitled_q')), !p.right && names ? h('small', t('right_answer', { a: names })) : null), h('span.pts', `${p.got}/${p.points}`));
    })) : null;
    put(main, headCard(f), h('section.fcard.fdone',
      h('div.donepic', icon(quiz ? 'trophy' : 'party-popper')),
      h('h2', t(res.changed ? 'answers_changed' : 'answers_sent')),
      res.confirm ? richText(res.confirm) : h('p.muted', t('answers_sent_t')),
      quiz ? h('div.score', h('strong', `${quiz.score}/${quiz.max}`), h('small', t('your_score'))) : null, review,
      link ? h('div.editlink', h('b', t('change_later')), h('small.muted', t('change_later_t')), h('div.linkrow', h('code', link), btn(t('copy'), { icon: 'copy', size: 'sm', onclick: () => copyText(link, t('link_copied')) }))) : null,
      h('div.prow.wrap.center', set.anotherLink && !set.onePerPerson ? btn(t('another_answer'), { icon: 'rotate-ccw', onclick: () => { history.replaceState(null, '', '#/f/' + f.id); dispatchEvent(new HashChangeEvent('hashchange')); } }) : null,
        link ? btn(t('change_now'), { icon: 'pencil', href: '#/f/' + f.id + '/e/' + res.edit, onclick: () => setTimeout(() => dispatchEvent(new HashChangeEvent('hashchange')), 0) }) : null, res.summary ? primary(t('see_results'), { icon: 'chart-column', href: '#/s/' + f.id }) : null)));
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  let paintNav = null;
  function draw() {
    const p = pages[at];
    // Next or Send: it can change while answering a choice that leads somewhere
    const nav = h('div.fnav');
    paintNav = () => {
      const to = nextOf(at);
      put(nav, at > 0 ? btn(t('back'), { icon: 'arrow-left', onclick: () => { at = trail.length ? trail.pop() : Math.max(0, at - 1); draw(); scrollTo({ top: 0 }); } }) : null, h('div.spacer'),
        pages.length > 1 && set.progress ? h('div.fpwrap', h('small.muted', t('page_of', { a: at + 1, b: pages.length })), bar) : null,
        to < 0 ? primary(t(editing ? 'save_answers' : 'send'), { icon: 'send', onclick: send }) : primary(t('next'), { icon: 'arrow-right', onclick: () => { if (check(p)) { trail.push(at); at = to; draw(); scrollTo({ top: 0 }); } } }));
    };
    const intro = at === 0 ? headCard(f, h('p.reqnote', reqMark(), ' ', t('required_note'))) : null;
    put(main,
      editing ? h('sav-alert', { variant: 'neutral', appearance: 'soft', class: 'fbanner' }, icon('pencil', { slot: 'icon' }), t('changing_answers', { w: moment(mine.when) })) : null,
      f.isOwner ? h('sav-alert', { variant: 'warning', appearance: 'soft', class: 'fbanner' }, icon('eye', { slot: 'icon' }), t('owner_preview')) : null,
      intro, at > 0 && p.section ? h('section.fcard.fsec', h('i.fband'), h('div.fcin', h('h2', p.section.title || t('k_section')), p.section.descr ? richText(p.section.descr) : null)) : null,
      at === 0 ? whoCard() : null, p.items.map(qCard),
      nav, hp);
    paintNav();
    progress();
  }
  draw();
  if (!editing && readDraft(f.id) && Object.keys(A).length) toast(t('draft_back'), 'neutral', { duration: 5000 });
  return () => { clearTimeout(saveT); document.body.classList.remove('filling'); };
}
