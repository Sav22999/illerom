/**
 * The answers of a form. For its owner (the tab "Answers" of the editor): the numbers that matter, a chart for every
 * question (bars of SavComponents in the colour of the form; a grid is a table of counts shaded by how many chose each
 * cell), the texts written, the answers one by one, CSV and .savfor. For who answered (#/s/<form>, when the form shows
 * them): the same charts without the texts people wrote.
 */
import { btn, confirm, copyText, empty, errText, fail, h, icon, iconBtn, put, segmented, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { api, formLink, keep } from './store.js';
import { OTHER, STATIC, kindIcon } from './models.js';
import { answerText } from './inputs.js';
import { headCard, themed } from './fill.js';
import { addDays, dayLabel, duration, moment } from './time.js';

const pct = (n, of) => (of ? Math.round((100 * n) / of) : 0);
const fmtNum = (n) => (n == null ? '–' : new Intl.NumberFormat(getLang(), { maximumFractionDigits: 2 }).format(n));

/** A bar chart of one series (SavComponents), in the colour of the form (--sav-chart-1, set by the page). */
function bars(labels, values, o = {}) {
  // the top of the scale: a multiple of 4, so the lines of the grid fall on whole numbers
  const top = Math.max(4, Math.ceil(Math.max(0, ...values) / 4) * 4);
  const c = h('sav-chart-bar', { label: o.label || '', orientation: o.horizontal ? 'horizontal' : null, 'show-values': o.values !== false || null, 'no-legend': true, max: top, gap: o.gap ?? (o.horizontal ? .35 : .25), height: o.height || (o.horizontal ? Math.max(90, labels.length * 38 + 30) : 200), style: 'width:100%' });
  c.data = { labels, series: [{ name: o.name || t('answers_n'), values, color: 'var(--fci)' }] };
  return h('div.chart', c);
}

/** The days between the first and the last answer, every day (zeros too), at most the last 120. */
function timeline(days) {
  const keys = Object.keys(days).sort();
  if (!keys.length) return null;
  const all = [];
  // at least two weeks, so a few days of answers do not become a few giant bars
  const first = keys[0] < addDays(keys[keys.length - 1], -13) ? keys[0] : addDays(keys[keys.length - 1], -13);
  for (let k = first; k <= keys[keys.length - 1] && all.length < 400; k = addDays(k, 1)) all.push(k);
  const last = all.slice(-120);
  return bars(last.map((k) => dayLabel(k, { day: 'numeric', month: 'short' })), last.map((k) => days[k] || 0), { label: t('by_day'), values: false, height: 170, gap: .2 });
}

/** The chart (or list) of one question, from its summary. `pub`: for who answered (never the texts). */
function questionChart(q, s, total, pub) {
  const n = s?.n || 0;
  if (!n) return h('p.muted.noans', t('no_answers_q'));
  const lab = (id) => (id === OTHER ? t('other') : q.opts?.find((o) => o.id === id)?.label || t('removed_option'));
  switch (q.t) {
    case 'single': case 'dropdown': case 'multi': {
      const ids = [...q.opts.map((o) => o.id), ...(q.other || s.counts?.[OTHER] ? [OTHER] : [])];
      for (const k of Object.keys(s.counts || {})) if (!ids.includes(k)) ids.push(k); // answers to options removed later
      const vals = ids.map((id) => s.counts?.[id] || 0);
      return h('div', bars(ids.map((id, i) => `${lab(id)} · ${pct(vals[i], n)}%`), vals, { horizontal: true, label: q.title }),
        q.t === 'multi' ? h('small.muted', t('multi_note')) : null,
        !pub && s.others?.length ? h('details.others', h('summary', t('other_texts', { n: s.others.length })), h('ul.texts', s.others.map((x) => h('li', x)))) : null);
    }
    case 'scale': case 'rating': {
      const lo = q.t === 'scale' ? q.min : 1, keys = []; for (let v = lo; v <= q.max; v++) keys.push(v);
      const labels = keys.map((v) => String(v) + (q.t === 'scale' && v === lo && q.minLabel ? ' · ' + q.minLabel : q.t === 'scale' && v === q.max && q.maxLabel ? ' · ' + q.maxLabel : ''));
      return h('div', h('div.avgline', h('strong', fmtNum(s.avg)), h('span.muted', q.t === 'rating' ? t('avg_of', { m: q.max }) : t('average')), q.t === 'rating' ? h('sav-rating', { value: Math.round(s.avg || 0), max: q.max, icon: q.icon === 'smile' ? 'smile' : q.icon, readonly: true, style: '--size:1.1rem;--color:var(--fc)' }) : null),
        bars(labels, keys.map((v) => s.counts?.[v] || 0), { label: q.title }));
    }
    case 'number':
      return h('div', h('div.numstats', [['average', s.avg], ['median', s.median], ['smallest', s.min], ['largest', s.max]].map(([k, v]) => h('div', h('small.muted', t(k)), h('strong', fmtNum(v))))),
        s.bins?.length ? bars(s.bins.map((b) => (b.from === b.to ? fmtNum(b.from) : fmtNum(b.from) + '–' + fmtNum(b.to))), s.bins.map((b) => b.n), { label: q.title, values: s.bins.length <= 12 }) : null);
    case 'date': {
      const keys = Object.keys(s.counts || {}).sort();
      return keys.length <= 20 ? bars(keys.map((k) => dayLabel(k)), keys.map((k) => s.counts[k]), { horizontal: true, label: q.title })
        : h('ul.texts', Object.entries(s.counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, c]) => h('li', h('b', dayLabel(k)), ' · ', String(c))));
    }
    case 'time': {
      const hrs = Object.keys(s.counts || {}).map(Number), lo = Math.min(...hrs), hi = Math.max(...hrs), keys = [];
      for (let v = lo; v <= hi; v++) keys.push(v);
      return bars(keys.map((v) => String(v).padStart(2, '0') + ':00'), keys.map((v) => s.counts[v] || 0), { label: q.title, values: keys.length <= 12 });
    }
    case 'grid': case 'checkgrid': {
      const max = Math.max(1, ...q.rows.flatMap((r) => q.cols.map((c) => s.grid?.[r.id]?.[c.id] || 0)));
      return h('div.gridwrap', h('table.heat', { 'aria-label': q.title }, h('thead', h('tr', h('th'), q.cols.map((c) => h('th', { scope: 'col' }, c.label)))),
        h('tbody', q.rows.map((r) => { const sum = q.cols.reduce((a, c) => a + (s.grid?.[r.id]?.[c.id] || 0), 0); return h('tr', h('th', { scope: 'row' }, r.label), q.cols.map((c) => { const v = s.grid?.[r.id]?.[c.id] || 0; return h('td', { style: `--a:${Math.round((v / max) * 100)}%`, class: v / max > .55 ? 'dark' : '', title: `${r.label} – ${c.label}: ${v} (${pct(v, sum)}%)` }, h('b', String(v)), h('small', pct(v, sum) + '%')); })); }))),
        h('small.muted', t('heat_note')));
    }
    case 'ranking': {
      const ids = q.opts.map((o) => o.id).sort((a, b) => (s.avg?.[a] ?? 99) - (s.avg?.[b] ?? 99));
      return h('div', h('ol.rankres', ids.map((id) => h('li', h('b', lab(id)), h('span.muted', t('avg_place', { p: fmtNum(s.avg?.[id]) })), h('sav-badge', { appearance: 'soft', pill: true }, t('firsts', { n: s.first?.[id] || 0 }))))), h('small.muted', t('rank_note')));
    }
    case 'short': case 'long': case 'email':
      if (pub) return h('p.muted', t('texts_private', { n }));
      return h('div', s.same?.length ? h('div.same', h('small.muted', t('most_given')), s.same.map(([txt, c]) => h('sav-badge', { appearance: 'soft', pill: true }, `${txt} · ${c}`))) : null,
        h('ul.texts' + (q.t === 'long' ? '.long' : ''), (s.texts || []).map((x) => h('li', x))), n > (s.texts || []).length ? h('small.muted', t('latest_texts', { n: s.texts.length })) : null);
  }
  return null;
}

function summaryView(F, sum, pub = false) {
  const byId = Object.fromEntries(sum.items.map((x) => [x.id, x]));
  const items = F.items.filter((q) => !STATIC.includes(q.t));
  const tl = timeline(sum.days || {});
  return h('div.sumlist',
    !pub && tl ? h('section.rcard', h('div.rhead', icon('calendar-days'), h('h3', t('by_day'))), tl) : null,
    !pub && sum.scores ? h('section.rcard', h('div.rhead', icon('trophy'), h('h3', t('scores')), h('span.spacer'), h('span.muted', t('average') + ' ' + fmtNum(sum.scores.avg))),
      bars(Object.keys(sum.scores.bins).sort((a, b) => a - b), Object.keys(sum.scores.bins).sort((a, b) => a - b).map((k) => sum.scores.bins[k]), { label: t('scores') })) : null,
    items.map((q, i) => h('section.rcard', h('div.rhead', h('span.qno', String(i + 1)), h('div.grow', h('h3', q.title || t('untitled_q')), h('small.muted', icon(kindIcon(q.t)), ' ', t('k_' + q.t), ' · ', t('n_of_total', { n: byId[q.id]?.n || 0, m: sum.total })))),
      questionChart(q, byId[q.id], sum.total, pub))));
}

/** The answers one by one, the newest first. */
function oneByOne(box, F, onDelete) {
  let at = 0, total = 0, find = '', cur = null;
  const nav = h('div.obnav'), view = h('div.obview');
  async function load() {
    put(view, h('div.wait.small', h('sav-spinner')));
    const r = await api('forms.answers', undefined, { id: F.id, offset: at, limit: 1, q: find });
    total = r.total; cur = r.answers[0] || null;
    draw();
  }
  const search = h('sav-input', { size: 'sm', placeholder: t('search_answers'), clearable: true, 'aria-label': t('search_answers') }, icon('search', { slot: 'prefix' }));
  let st = 0;
  search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { find = search.value.trim(); at = 0; load().catch(fail); }, 300); });
  function draw() {
    put(nav, iconBtn('chevron-left', t('newer'), () => { at--; load().catch(fail); }, { disabled: at <= 0 || null }),
      h('span.obpos', total ? t('x_of_y', { x: at + 1, y: total }) : '0'), iconBtn('chevron-right', t('older'), () => { at++; load().catch(fail); }, { disabled: at >= total - 1 || null }), h('div.spacer'), search);
    if (!cur) return put(view, empty(find ? 'search' : 'inbox', t(find ? 'nothing_found' : 'no_answers'), ''));
    const A = cur.answers;
    put(view, h('section.rcard.obhead', h('div.grow', h('b', moment(cur.created)), h('small.muted', [cur.name, cur.email].filter(Boolean).join(' · ') || t('anonymous'), cur.updated !== cur.created ? ' · ' + t('changed_w', { w: when(cur.updated) }) : '')),
      cur.score != null ? h('div.obscore', h('strong', `${fmtNum(cur.score)}/${fmtNum(cur.maxScore)}`), h('small.muted', t('score'))) : null, cur.seconds != null ? h('div.obscore', h('strong', duration(cur.seconds)), h('small.muted', t('time_taken'))) : null,
      btn(t('delete'), { icon: 'trash', size: 'sm', appearance: 'ghost', variant: 'danger', onclick: async () => { if (!(await confirm(t('delete_answer'), t('delete_answer_t'), t('delete')))) return; await api('forms.answers.delete', { id: F.id, ids: [cur.id] }); toast(t('deleted'), 'success'); onDelete(); if (at >= total - 1) at = Math.max(0, at - 1); await load(); } })),
      F.items.filter((q) => !STATIC.includes(q.t)).map((q) => {
        const txt = answerText(q, A), right = F.settings.quiz && q.correct?.length ? (q.t === 'multi' ? JSON.stringify([...(A[q.id] || [])].sort()) === JSON.stringify([...q.correct].sort()) : q.t === 'short' ? q.correct.some((c) => c.trim().toLowerCase() === String(A[q.id] || '').trim().toLowerCase()) : q.correct.includes(A[q.id])) : null;
        return h('section.rcard.obq', h('div.rhead', icon(kindIcon(q.t)), h('h3.grow', q.title || t('untitled_q')), right === null ? null : icon(right ? 'circle-check' : 'circle-x', { class: right ? 'ok' : 'no' })),
          txt ? h('p.obans' + (q.t === 'long' ? '.long' : ''), txt) : h('p.muted', t('no_answer')));
      }));
  }
  put(box, nav, view);
  load().catch(fail);
}

export async function ownerResults(box, F, ctx = {}) {
  put(box, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  let r;
  try { r = await api('forms.summary', undefined, { id: F.id }); } catch (e) { put(box, h('div.wait', empty('circle-alert', errText(e), ''))); return; }
  const form = r.form, sum = r.summary;
  F.responses = form.responses; keep({ ...form, new: 0 });
  let view = 'summary';
  const content = h('div.rcontent');
  const accept = h('sav-switch', { checked: F.accepting || null }, t('accepting'));
  accept.addEventListener('change', async () => { try { F.accepting = accept.checked; const x = await api('forms.save', { id: F.id, accepting: F.accepting }); Object.assign(F, { state: x.form.state, why: x.form.why }); keep(x.form); } catch (e) { fail(e); } });
  const stat = (label, value, ic, caption) => h('sav-stat', { label, value: String(value), icon: ic, caption: caption || null });
  const draw = () => { if (view === 'summary') put(content, sum.total ? summaryView(form, sum) : empty('inbox', t('no_answers'), t('no_answers_t'), btn(t('copy_link'), { icon: 'link', onclick: () => copyText(formLink(F.id), t('link_copied')) }))); else oneByOne(content, form, () => { sum.total = Math.max(0, sum.total - 1); }); };
  put(box, themed(h('div.results'), form.theme),
    h('div.rtop',
      h('div.stats', stat(t('answers_title'), sum.total, 'inbox', form.lastResponse ? t('last_w', { w: when(form.lastResponse) }) : ''), stat(t('median_time'), duration(sum.medianSeconds), 'timer'),
        sum.scores ? stat(t('avg_score'), fmtNum(sum.scores.avg), 'trophy') : null, stat(t('status'), t({ open: 'st_open', closed: form.why === 'deadline' ? 'st_ended' : 'st_closed', soon: 'st_soon', full: 'st_full' }[form.state]), form.state === 'open' ? 'door-open' : 'door-closed', form.closes ? t('deadline_on', { w: moment(form.closes, form.tz) }) : '')),
      h('div.rtools', segmented(t('view'), view, [['summary', 'chart-column', t('summary')], ['one', 'layout-list', t('one_by_one')]], (v) => { view = v; draw(); }), h('div.spacer'), accept,
        btn(t('csv'), { icon: 'file-spreadsheet', size: 'sm', href: 'api/?r=forms.csv&id=' + F.id, download: '' }),
        btn('.savfor', { icon: 'download', size: 'sm', onclick: () => import('./files.js').then((m) => m.saveSavfor(F.id, true)) }),
        iconBtn('refresh-cw', t('refresh'), () => ownerResults(box, F, ctx)),
        sum.total ? iconBtn('trash', t('delete_all_answers'), async () => { if (!(await confirm(t('delete_all_answers'), t('delete_all_answers_t', { n: sum.total }), t('delete')))) return; await api('forms.answers.delete', { id: F.id, all: true }); toast(t('deleted'), 'success'); ownerResults(box, F, ctx); }) : null)),
    content);
  box.firstChild.append(...[...box.childNodes].slice(1));
  draw();
}

/** The charts for who answered (#/s/<form>), when the form shows them. */
export async function publicSummary(root, id) {
  put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' })));
  try {
    const r = await api('pub.summary', undefined, { id });
    const f = r.form;
    document.title = t('results_of', { t: f.title || t('untitled') }) + ' – SavForms';
    document.body.classList.add('filling');
    put(root, themed(h('div.fill'), f.theme), h('header.ftop', h('a.fbrand', { href: './' }, h('img', { src: 'icons/favicon.svg', width: 22, height: 22, alt: '' }), h('span', 'Sav', h('b', 'Forms')))),
      h('main.fwrap.results', headCard(f, h('p.muted', t('public_results', { n: r.summary.total })), h('div.prow', f.state === 'open' ? btn(t('answer_it'), { icon: 'pencil', size: 'sm', href: '#/f/' + f.id }) : null)), summaryView(f, r.summary, true)));
    root.firstChild.append(...[...root.childNodes].slice(1));
  } catch (e) {
    put(root, h('div.wait', empty(e.code === 'forbidden' ? 'lock' : 'circle-x', e.code === 'forbidden' ? t('results_private') : errText(e), '')));
  }
}
