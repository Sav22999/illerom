/**
 * "New": a dialog in the middle of the screen, as in the other apps of SavOffice. First what to make — a task, or a list
 * shown as a list, a kanban board, a Gantt chart or an Eisenhower matrix, or a list of habits — then, for a task, its few essential fields
 * (the rest is in its panel), for a list its name and a ready-made start (templates with tasks, columns and dates).
 *
 * A template is made in one request: tasks.import with a .savtas built here (the dates are counted from today).
 * The Eisenhower matrix is a board whose four columns are the quadrants (ids q1…q4): board.js draws it two by two.
 */
import { colorPop, dialog, h, icon, put, segmented, select, tile, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { S, api, inbox, keep, listById } from './store.js';
import { go, prefs } from './account.js';
import { addDays, todayKey, weekday } from './time.js';
import { openTask, LIST_COLORS } from './task.js';
import { defaultRemind } from './tasks.js';

const tz = () => prefs().tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const L = (en, it) => (getLang() === 'it' ? it : en);
const stop = (n) => { n.addEventListener('keydown', (e) => e.stopPropagation()); return n; };

/** The four quadrants of the Eisenhower matrix (their ids tell board.js to draw it as a matrix). */
export const MATRIX = () => [{ id: 'q1', name: L('Urgent and important', 'Urgente e importante'), done: false }, { id: 'q2', name: L('Important, not urgent', 'Importante, non urgente'), done: false },
  { id: 'q3', name: L('Urgent, not important', 'Urgente, non importante'), done: false }, { id: 'q4', name: L('Neither urgent nor important', 'Né urgente né importante'), done: false }];
export const isMatrix = (l) => l?.view === 'board' && l.columns?.length === 4 && l.columns.every((c, i) => c.id === 'q' + (i + 1));

// ------------------------------------------------------------------ what can be made

const KINDS = [
  ['task', 'circle-check', 'nk_task', 'nk_task_t'],
  ['list', 'list-checks', 'nk_list', 'nk_list_t'],
  ['board', 'square-kanban', 'nk_board', 'nk_board_t'],
  ['gantt', 'chart-gantt', 'nk_gantt', 'nk_gantt_t'],
  ['matrix', 'grid-2x2', 'nk_matrix', 'nk_matrix_t'],
  ['habits', 'flame', 'nk_habits', 'nk_habits_t'],
];

/** A small drawing of each kind, for its card. */
function thumb(kind) {
  const line = (w, c = '') => h('span.nl', { style: `width:${w}%${c ? ';background:' + c : ''}` });
  if (kind === 'task') return h('div.nth.ntask', h('div.nrow', h('i.nbox'), line(64)), h('div.nmeta', h('i.nchip'), h('i.nchip.s')), h('div.nbell', icon('bell')));
  if (kind === 'list') return h('div.nth.nlist', [70, 52, 80, 46].map((w, i) => h('div.nrow', h('i.nbox' + (i === 2 ? '.on' : '')), line(w))));
  if (kind === 'board') return h('div.nth.nboard', [[60, 80], [70], [50, 66]].map((col) => h('div.ncol', col.map((w) => h('i.ncard', line(w))))));
  if (kind === 'gantt') return h('div.nth.ngantt', [[4, 34], [24, 30], [46, 40], [80, 0]].map(([a, w]) => h('div.ngrow', w ? h('i.nbar', { style: `left:${a}%;width:${w}%` }) : h('i.ndia', { style: `left:${a}%` }))));
  if (kind === 'habits') return h('div.nth.nhabits', [[1, 1, 1, 0, 1, 1, 0], [1, 0, 1, 1, 0, 0, 0], [0, 1, 1, 1, 1, 0, 0]].map((r) => h('div.nhrow', r.map((on) => h('i.nhd' + (on ? '.on' : ''))))));
  return h('div.nth.nmatrix', ['#c93a2f', '#0b7a87', '#c27a06', '#8a8f9d'].map((c) => h('i.nq', { style: `--q:${c}` }, line(60), line(40))));
}

// ------------------------------------------------------------------ templates

/** The ready-made starts of each kind: [id, icon, name, {color, icon, columns, tasks}] (days counted from today). */
function templates(kind) {
  const k = todayKey(tz()), d = (n) => addDays(k, n), mon = addDays(k, (7 - weekday(k)) % 7 || 7);
  const tk = (en, it, o = {}) => ({ title: L(en, it), ...o });
  const cl = (...items) => items.map(([en, it]) => ({ t: L(en, it), d: false }));
  const blank = ['blank', 'plus', L('Empty', 'Vuota'), {}];
  if (kind === 'list') return [blank,
    ['groceries', 'shopping-cart', L('Groceries', 'Spesa'), { color: '#0f8a63', icon: 'shopping-cart', tasks: [tk('Bread', 'Pane'), tk('Milk', 'Latte'), tk('Fruit', 'Frutta'), tk('Vegetables', 'Verdura'), tk('Eggs', 'Uova'), tk('Coffee', 'Caffè'), tk('Washing-up liquid', 'Detersivo per i piatti')] }],
    ['trip', 'plane', L('Trip', 'Viaggio'), { color: '#1f56d1', icon: 'plane', tasks: [tk('Check passport or ID card', 'Controllare passaporto o carta d’identità', { due: d(3) }), tk('Book the accommodation', 'Prenotare l’alloggio', { due: d(5), priority: 3 }),
      tk('Travel insurance', 'Assicurazione di viaggio', { due: d(10) }), tk('Pack the suitcase', 'Preparare la valigia', { due: d(20), checklist: cl(['Chargers', 'Caricabatterie'], ['Medicines', 'Medicine'], ['Clothes', 'Vestiti'], ['Toiletries', 'Beauty case']) }), tk('Check in online', 'Fare il check-in online', { due: d(21) })] }],
    ['home', 'house', L('Home', 'Casa'), { color: '#7a5c3e', icon: 'house', tasks: [tk('Laundry', 'Lavatrice', { due: k, rrule: 'FREQ=WEEKLY' }), tk('Water the plants', 'Annaffiare le piante', { due: d(1), rrule: 'FREQ=DAILY;INTERVAL=3' }),
      tk('Pay the bills', 'Pagare le bollette', { due: d(5), rrule: 'FREQ=MONTHLY', priority: 2 }), tk('Clean the fridge', 'Pulire il frigorifero', { due: d(7), rrule: 'FREQ=MONTHLY' }), tk('Take out the recycling', 'Portare fuori la differenziata', { due: d(2), rrule: 'FREQ=WEEKLY' })] }],
    ['week', 'calendar-days', L('My week', 'La mia settimana'), { color: '#6a2cf0', icon: 'calendar-days', tasks: [tk('Plan the week', 'Pianificare la settimana', { due: mon, rrule: 'FREQ=WEEKLY', priority: 2 }), tk('Weekly review', 'Revisione della settimana', { due: addDays(mon, 4), rrule: 'FREQ=WEEKLY' }), tk('Sport', 'Sport', { due: addDays(mon, 1), rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' })] }]];
  if (kind === 'board') {
    const cols = (...n) => n.map(([id, en, it, done]) => ({ id, name: L(en, it), done: !!done }));
    return [blank,
      ['project', 'briefcase', L('Project', 'Progetto'), { color: '#6a2cf0', icon: 'briefcase', columns: cols(['ideas', 'Ideas', 'Idee'], ['todo', 'To do', 'Da fare'], ['doing', 'Doing', 'In corso'], ['review', 'Review', 'Revisione'], ['done', 'Done', 'Fatto', 1]),
        tasks: [tk('Define the goals', 'Definire gli obiettivi', { col: 'todo', priority: 3 }), tk('Who does what', 'Chi fa cosa', { col: 'todo' }), tk('First draft', 'Prima bozza', { col: 'doing' }), tk('Ideas for the launch', 'Idee per il lancio', { col: 'ideas' })] }],
      ['sprint', 'repeat', L('Sprint', 'Sprint'), { color: '#1f56d1', icon: 'repeat', columns: cols(['backlog', 'Backlog', 'Backlog'], ['sprint', 'This sprint', 'Questo sprint'], ['doing', 'In progress', 'In corso'], ['test', 'Testing', 'In test'], ['done', 'Done', 'Fatto', 1]),
        tasks: [tk('Sprint planning', 'Pianificazione dello sprint', { col: 'sprint', due: k }), tk('Sprint review', 'Revisione dello sprint', { col: 'sprint', due: d(13) }), tk('First user story', 'Prima user story', { col: 'backlog' })] }],
      ['content', 'text', L('Editorial plan', 'Piano editoriale'), { color: '#c2307a', icon: 'book-open', columns: cols(['ideas', 'Ideas', 'Idee'], ['draft', 'Draft', 'Bozza'], ['review', 'Review', 'Revisione'], ['out', 'Published', 'Pubblicato', 1]),
        tasks: [tk('Article: ten tips', 'Articolo: dieci consigli', { col: 'ideas' }), tk('Newsletter of the month', 'Newsletter del mese', { col: 'draft', due: d(7) }), tk('Post for the event', 'Post per l’evento', { col: 'ideas' })] }]];
  }
  if (kind === 'gantt') return [blank,
    ['plan', 'briefcase', L('Project plan', 'Piano di progetto'), { color: '#0b7a87', icon: 'chart-gantt', tasks: [tk('Analysis', 'Analisi', { start: k, due: d(4) }), tk('Design', 'Progettazione', { start: d(5), due: d(11) }), tk('Development', 'Sviluppo', { start: d(12), due: d(29) }),
      tk('Testing', 'Test', { start: d(26), due: d(34) }), tk('Release', 'Rilascio', { due: d(36), priority: 3 })] }],
    ['event', 'users', L('Event', 'Evento'), { color: '#c2307a', icon: 'users', tasks: [tk('Choose the date', 'Scegliere la data', { start: k, due: d(3) }), tk('Book the place', 'Prenotare il luogo', { start: d(2), due: d(9) }), tk('Send the invitations', 'Mandare gli inviti', { start: d(10), due: d(14) }),
      tk('Catering', 'Catering', { start: d(10), due: d(20) }), tk('The event', 'L’evento', { due: d(30), priority: 3 })] }],
    ['move', 'house', L('Moving house', 'Trasloco'), { color: '#c27a06', icon: 'house', tasks: [tk('Quotes from movers', 'Preventivi dei traslocatori', { start: k, due: d(6) }), tk('Boxes and packing', 'Scatole e imballaggi', { start: d(7), due: d(24) }),
      tk('Change of address and utilities', 'Cambio di residenza e utenze', { start: d(14), due: d(26) }), tk('Moving day', 'Giorno del trasloco', { due: d(28), priority: 3 })] }]];
  if (kind === 'habits') return [blank,
    ['health', 'heart', L('Health', 'Salute'), { color: '#0f8a63', icon: 'heart', tasks: [tk('Drink 2 litres of water', 'Bere 2 litri d’acqua'), tk('Walk 30 minutes', 'Camminare 30 minuti'), tk('Gym', 'Palestra', { rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }), tk('In bed by 23:00', 'A letto entro le 23')] }],
    ['mind', 'book-open', L('Mind', 'Mente'), { color: '#6a2cf0', icon: 'book-open', tasks: [tk('Read 20 minutes', 'Leggere 20 minuti'), tk('Ten minutes of meditation', 'Dieci minuti di meditazione'), tk('Practise a language', 'Esercitarsi con una lingua', { rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }), tk('Write a diary', 'Scrivere un diario')] }],
    ['home', 'house', L('Home', 'Casa'), { color: '#c27a06', icon: 'house', tasks: [tk('Tidy up for ten minutes', 'Riordinare per dieci minuti'), tk('Water the plants', 'Annaffiare le piante', { rrule: 'FREQ=WEEKLY;BYDAY=MO,TH' }), tk('Cook something at home', 'Cucinare qualcosa a casa')] }]];
  if (kind === 'matrix') return [blank,
    ['priorities', 'flag', L('Priorities of the week', 'Priorità della settimana'), { color: '#c93a2f', icon: 'flag', tasks: [tk('Deadline of tomorrow', 'Scadenza di domani', { col: 'q1', due: d(1), priority: 3 }), tk('Plan the next month', 'Pianificare il mese prossimo', { col: 'q2' }),
      tk('Answer the emails', 'Rispondere alle email', { col: 'q3', due: k }), tk('Tidy up the desktop', 'Riordinare la scrivania', { col: 'q4' })] }]];
  return [];
}

// ------------------------------------------------------------------ the dialog

/**
 * init: {kind: task|list|board|gantt|matrix, list, due, starred, tags} — what the screen suggests (the list on screen,
 * today in "Today"…).
 */
export function newDialog(ctx, init = {}) {
  let kind = KINDS.some((x) => x[0] === init.kind) ? init.kind : 'task', tpl = 'blank', color = LIST_COLORS[S.lists.length % LIST_COLORS.length];
  const cards = {};
  const kinds = h('div.nkinds', KINDS.map(([k, ic, name, text]) => (cards[k] = tile(t(name), () => { kind = k; tpl = 'blank'; paint(); }, { class: 'nkind', 'data-k': k }, thumb(k), h('div.ntext', h('b', icon(ic), ' ', t(name)), h('small', t(text)))))));
  const form = h('div.nform');

  // a task: the few fields that matter at once
  const lists = S.lists.filter((l) => !l.archived);
  const title = h('sav-input', { label: t('title_l'), placeholder: t('title_ph'), maxlength: 255 });
  const listSel = select(t('list'), lists.map((l) => [l.id, l.name]), init.list && listById(init.list) ? init.list : prefs().defaultList && listById(prefs().defaultList) ? prefs().defaultList : inbox().id, null, { size: 'md' });
  const due = stop(h('sav-date-picker', { label: t('due'), value: init.due || '', clearable: true }));
  const time = stop(h('sav-time-picker', { label: t('time'), step: 5, clearable: true }));
  let priority = 0;
  const prio = segmented(t('priority'), '0', [['0', '=' + t('p_none'), t('p_none')], ['1', '=' + t('p_low'), t('p_low')], ['2', '=' + t('p_medium'), t('p_medium')], ['3', '=' + t('p_high'), t('p_high')]], (v) => { priority = +v; }, { show: true, class: 'prio' });
  const more = h('sav-checkbox', {}, t('open_details'));
  const taskForm = h('div.form', title, h('div.grid3', listSel, due, time), prio, more);

  // a list: name, colour, a ready-made start
  const name = h('sav-input', { label: t('name'), maxlength: 120, placeholder: t('list_ph') });
  const col = colorPop(t('color'), color, (v) => { if (v) color = v; }, { list: LIST_COLORS });
  const tplBox = h('div.ntpls');
  const listForm = h('div.form', h('div.nname', name, h('div.cf', h('span.flabel', t('color')), col)), h('div', h('span.flabel', t('start_with')), tplBox));

  const paint = () => {
    for (const [k, c] of Object.entries(cards)) { c.classList.toggle('on', k === kind); c.setAttribute('aria-pressed', String(k === kind)); }
    d.setAttribute('label', t(kind === 'task' ? 'new_task' : 'new_' + (kind === 'list' ? 'list' : kind)));
    if (kind === 'task') { put(form, taskForm); requestAnimationFrame(() => title.focus()); return; }
    const tps = templates(kind);
    put(tplBox, tps.map(([id, ic, label, x]) => h('sav-chip', { size: 'md', selected: id === tpl || null, onclick: () => { tpl = id; if (x.color) { color = x.color; col.show_?.(color); } if (!name.value.trim() || tps.some((y) => y[2] === name.value.trim())) name.value = id === 'blank' ? '' : label; paint(); } }, icon(ic, { slot: 'prefix' }), label)),
      tpl !== 'blank' ? h('p.muted.small.ntplinfo', t('tpl_info', { n: tps.find((y) => y[0] === tpl)?.[3].tasks?.length || 0 })) : null);
    put(form, listForm);
    requestAnimationFrame(() => name.focus());
  };

  const create = async () => {
    if (kind === 'task') {
      const v = title.value.trim();
      if (!v) { title.focus(); throw Object.assign(new Error(), { code: 'title_required' }); }
      const body = { title: v, list: listSel.value, due: due.value || null, time: due.value ? time.value || null : null, priority, tz: tz(), starred: !!init.starred, tags: init.tags || [] };
      if (body.due) body.remind = defaultRemind(body.due, body.time);
      const r = await api('tasks.task.save', body);
      keep(r.task);
      ctx.redraw();
      toast(t('added_to', { l: listById(r.task.list)?.name || '' }), 'success');
      if (more.checked) setTimeout(() => openTask(r.task.id, ctx), 250);
      return;
    }
    const x = templates(kind).find((y) => y[0] === tpl)?.[3] || {};
    const label = name.value.trim() || (tpl !== 'blank' ? templates(kind).find((y) => y[0] === tpl)[2] : '');
    if (!label) { name.focus(); throw Object.assign(new Error(), { code: 'name_required' }); }
    const view = kind === 'list' ? 'list' : kind === 'gantt' ? 'gantt' : kind === 'habits' ? 'habits' : 'board';
    const columns = kind === 'matrix' ? MATRIX() : x.columns;
    const ic = x.icon || { list: 'list-checks', board: 'square-kanban', gantt: 'chart-gantt', matrix: 'grid-2x2', habits: 'flame' }[kind];
    let l;
    if (x.tasks?.length) {
      const tasks = x.tasks.map((y) => ({ ...y, remind: y.due ? defaultRemind(y.due, null) : null }));
      l = (await api('tasks.import', { savtas: { format: 'savtas', version: 1, name: label, color, icon: ic, view, columns, tasks }, tz: tz() })).list;
    } else l = (await api('tasks.list.save', { name: label, color, icon: ic, view, ...(columns ? { columns } : {}) })).list;
    await ctx.refresh();
    go('#/l/' + l.id);
  };

  const d = dialog({ title: t('new_l'), width: '52rem', cls: 'newdlg', body: h('div.form', h('span.flabel', t('what_new')), kinds, form), actions: [{ label: t('cancel') }, { label: t('create'), icon: 'plus', primary: true, run: create }] });
  paint();
  return d;
}
