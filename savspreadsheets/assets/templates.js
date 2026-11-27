/**
 * Ready workbooks to start from, in 5 groups. Each one is built in the language of the app (texts and the way numbers
 * are shown); the formulas are the standard English ones.
 */
import { t } from './i18n.js';
import { currencyFormat, dateFormat, toSerial } from './format.js';
import { colName, newId } from './model.js';

export const TPL_CATS = ['personal', 'work', 'school', 'plan', 'money'];
export const catName = (c) => t('tc_' + c);
export const tplName = (id) => t('tp_' + id);

const G = '#4d7c0f', GL = '#eef6e0', GM = '#d9ecc0', INK = '#1f2a17';
const H = { b: 1, bg: G, c: '#ffffff', va: 'm' }, HL = { b: 1, bg: GL, bb: 'thin ' + G }, TITLE = { b: 1, fz: 18, c: INK }, SUB = { c: '#66725c', i: 1 }, TOT = { b: 1, bt: 'medium ' + G, bg: GL };

/** A sheet from rows: each value is a number, a text, "=formula", true/false, or [value, style]. */
function sheet(name, rows, o = {}) {
  const cells = {};
  rows.forEach((row, i) => (row || []).forEach((x, j) => {
    if (x === undefined || x === null || x === '') return;
    const [v, s] = Array.isArray(x) ? x : [x, null], k = colName(j + 1 + (o.c0 || 0)) + (i + 1 + (o.r0 || 0)), c = {};
    if (typeof v === 'string' && v[0] === '=' && v.length > 1) c.f = v; else if (v !== '') c.v = v;
    if (s && Object.keys(s).length) c.s = s;
    cells[k] = c;
  }));
  const cols = {};
  (o.w || []).forEach((w, i) => { if (w) cols[colName(i + 1)] = { w }; });
  const rws = {};
  for (const [r, hh] of Object.entries(o.h || {})) rws[r] = { h: hh };
  return { id: newId(), name, cells, cols, rows: rws, merges: o.merges || [], freeze: o.freeze || { r: 0, c: 0 }, grid: o.grid !== false, cf: o.cf || [], dv: o.dv || [], charts: (o.charts || []).map((c) => ({ id: newId(), legend: true, head: true, rows: false, title: '', ...c })), filter: o.filter || null, hidden: false, color: o.color || '' };
}

export const TEMPLATES = {
  blank: { cat: 'personal', build: (L, lang) => ({ sheets: [sheet(L('Sheet1', 'Foglio1'), [])] }) },
  budget: { cat: 'personal', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) }, rows = [[[L('Monthly budget', 'Budget mensile'), TITLE]], [[L('Plan what comes in and what goes out', 'Pianifica entrate e uscite'), SUB]], [],
      [[L('Income', 'Entrate'), H], [L('Planned', 'Previsto'), { ...H, ha: 'r' }], [L('Actual', 'Effettivo'), { ...H, ha: 'r' }], [L('Difference', 'Differenza'), { ...H, ha: 'r' }]],
      [L('Salary', 'Stipendio'), [2400, M], [2400, M], ['=C5-B5', M]], [L('Other income', 'Altre entrate'), [300, M], [180, M], ['=C6-B6', M]],
      [[L('Total income', 'Totale entrate'), TOT], ['=SUM(B5:B6)', { ...TOT, ...M }], ['=SUM(C5:C6)', { ...TOT, ...M }], ['=C7-B7', { ...TOT, ...M }]], [],
      [[L('Expenses', 'Uscite'), H], [L('Planned', 'Previsto'), { ...H, ha: 'r' }], [L('Actual', 'Effettivo'), { ...H, ha: 'r' }], [L('Difference', 'Differenza'), { ...H, ha: 'r' }]]];
    const ex = [[L('Rent', 'Affitto'), 800, 800], [L('Bills', 'Bollette'), 150, 172], [L('Groceries', 'Spesa'), 400, 436], [L('Transport', 'Trasporti'), 120, 95], [L('Free time', 'Tempo libero'), 200, 240], [L('Savings', 'Risparmi'), 300, 300]];
    ex.forEach(([n, a, b], i) => rows.push([n, [a, M], [b, M], [`=B${10 + i}-C${10 + i}`, M]]));
    rows.push([[L('Total expenses', 'Totale uscite'), TOT], ['=SUM(B10:B15)', { ...TOT, ...M }], ['=SUM(C10:C15)', { ...TOT, ...M }], ['=B16-C16', { ...TOT, ...M }]], [], [[L('Left this month', 'Rimane questo mese'), { b: 1, fz: 13 }], ['=B7-B16', { b: 1, fz: 13, ...M }], ['=C7-C16', { b: 1, fz: 13, ...M }]]);
    return { sheets: [sheet(L('Budget', 'Budget'), rows, { w: [190, 120, 120, 120], h: { 1: 36 }, freeze: { r: 0, c: 0 }, cf: [{ r: 'D5:D7', k: 'lt', a: '0', b: '', s: { c: '#b3261e' } }, { r: 'D10:D16', k: 'lt', a: '0', b: '', s: { c: '#b3261e', bg: '#fdecea' } }, { r: 'C18', k: 'lt', a: '0', b: '', s: { c: '#b3261e' } }], charts: [{ k: 'donut', r: 'A10:B15', head: false, title: L('Where the money goes (planned)', 'Dove vanno i soldi (previsto)'), x: 560, y: 70, w: 380, h: 300 }] })] };
  } },
  expenses: { cat: 'personal', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) }, D = { nf: dateFormat(lang) }, cats = [L('Food', 'Cibo'), L('Home', 'Casa'), L('Transport', 'Trasporti'), L('Health', 'Salute'), L('Fun', 'Svago')];
    const data = [[toSerial(2026, 1, 3), L('Supermarket', 'Supermercato'), cats[0], 64.2], [toSerial(2026, 1, 5), L('Train tickets', 'Biglietti treno'), cats[2], 38], [toSerial(2026, 1, 9), L('Pharmacy', 'Farmacia'), cats[3], 17.5], [toSerial(2026, 1, 12), L('Electricity', 'Luce'), cats[1], 81.3], [toSerial(2026, 1, 15), L('Cinema', 'Cinema'), cats[4], 22], [toSerial(2026, 1, 18), L('Bakery', 'Panetteria'), cats[0], 9.8], [toSerial(2026, 1, 21), L('Fuel', 'Carburante'), cats[2], 55]];
    const rows = [[[L('Expense tracker', 'Registro spese'), TITLE]], [], [[L('Date', 'Data'), H], [L('Description', 'Descrizione'), H], [L('Category', 'Categoria'), H], [L('Amount', 'Importo'), { ...H, ha: 'r' }]]];
    data.forEach((r) => rows.push([[r[0], D], r[1], r[2], [r[3], M]]));
    const sum = [[], [[L('By category', 'Per categoria'), H], [L('Total', 'Totale'), { ...H, ha: 'r' }]]];
    cats.forEach((c, i) => sum.push([c, [`=SUMIF($C$4:$C$200,F${3 + i},$D$4:$D$200)`, M]]));
    sum.push([[L('Total', 'Totale'), TOT], ['=SUM(G3:G7)', { ...TOT, ...M }]]);
    const s = sheet(L('Expenses', 'Spese'), rows, { w: [110, 220, 130, 110, 30, 140, 110], freeze: { r: 3, c: 0 }, dv: [{ r: 'C4:C60', k: 'list', list: cats, a: '', b: '', strict: false }], filter: { r: 'A3:D10', h: {} }, charts: [{ k: 'pie', r: 'F2:G7', title: L('Spending by category', 'Spese per categoria'), x: 680, y: 220, w: 360, h: 280 }] });
    sum.forEach((row, i) => row.forEach((x, j) => { if (!x || (Array.isArray(x) && x.length === 0)) return; const [v, st] = Array.isArray(x) ? x : [x, null], k = colName(6 + j) + (1 + i), c = {}; if (typeof v === 'string' && v[0] === '=') c.f = v; else c.v = v; if (st) c.s = st; s.cells[k] = c; }));
    return { sheets: [s] };
  } },
  shopping: { cat: 'personal', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) }, items = [[L('Bread', 'Pane'), 1, 2.1], [L('Milk', 'Latte'), 2, 1.35], [L('Apples', 'Mele'), 6, 0.45], [L('Pasta', 'Pasta'), 3, 1.2], [L('Coffee', 'Caffè'), 1, 4.9], [L('Tomatoes', 'Pomodori'), 4, 0.6]];
    const rows = [[[L('Shopping list', 'Lista della spesa'), TITLE]], [], [[L('Done', 'Preso'), { ...H, ha: 'c' }], [L('Item', 'Articolo'), H], [L('Qty', 'Q.tà'), { ...H, ha: 'r' }], [L('Price', 'Prezzo'), { ...H, ha: 'r' }], [L('Total', 'Totale'), { ...H, ha: 'r' }]]];
    items.forEach((x, i) => rows.push([i < 2, x[0], x[1], [x[2], M], [`=C${4 + i}*D${4 + i}`, M]]));
    rows.push([], [null, [L('Total', 'Totale'), TOT], ['', TOT], ['', TOT], ['=SUM(E4:E9)', { ...TOT, ...M }]], [null, L('Still to buy', 'Ancora da prendere'), null, null, ['=SUMIF(A4:A9,FALSE,E4:E9)', M]]);
    return { sheets: [sheet(L('List', 'Lista'), rows, { w: [70, 200, 70, 100, 100], dv: [{ r: 'A4:A20', k: 'check', list: [], a: '', b: '', strict: false }], cf: [{ r: 'B4:E9', k: 'formula', a: '$A4=TRUE', b: '', s: { c: '#9aa29d' } }] })] };
  } },
  travel: { cat: 'personal', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) }, D = { nf: lang === 'it' ? 'ddd d mmm' : 'ddd d mmm' };
    const rows = [[[L('Trip planner', 'Pianificatore di viaggio'), TITLE]], [[L('Lisbon, 4 days', 'Lisbona, 4 giorni'), SUB]], [], [[L('Day', 'Giorno'), H], [L('Where', 'Dove'), H], [L('What', 'Cosa'), H], [L('Cost', 'Costo'), { ...H, ha: 'r' }], [L('Booked', 'Prenotato'), { ...H, ha: 'c' }]],
      [[toSerial(2026, 5, 14), D], 'Alfama', L('Castle and old town', 'Castello e quartiere antico'), [15, M], true], [['=A5+1', D], 'Belém', L('Tower and monastery', 'Torre e monastero'), [22, M], false], [['=A6+1', D], 'Sintra', L('Palaces, by train', 'Palazzi, in treno'), [38, M], false], [['=A7+1', D], 'Cascais', L('Beach', 'Spiaggia'), [10, M], false], [],
      [[L('Flights', 'Voli'), HL], ['', HL], ['', HL], [180, { ...HL, ...M }]], [[L('Hotel', 'Albergo'), HL], ['', HL], ['', HL], [360, { ...HL, ...M }]], [], [[L('Total', 'Totale'), TOT], ['', TOT], ['', TOT], ['=SUM(D5:D11)', { ...TOT, ...M }]]];
    return { sheets: [sheet(L('Trip', 'Viaggio'), rows, { w: [120, 120, 240, 100, 90], dv: [{ r: 'E5:E8', k: 'check', list: [], a: '', b: '', strict: false }] })] };
  } },
  invoice: { cat: 'work', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) }, D = { nf: dateFormat(lang) };
    const rows = [[[L('INVOICE', 'FATTURA'), { b: 1, fz: 24, c: G }], null, null, [L('No.', 'N.'), { ha: 'r', c: '#66725c' }], ['2026-014', { b: 1 }]], [L('Your company Ltd', 'La tua azienda S.r.l.'), null, null, [L('Date', 'Data'), { ha: 'r', c: '#66725c' }], [toSerial(2026, 3, 2), { ...D, b: 1 }]], [L('Street 1, City', 'Via Roma 1, Città'), null, null, [L('Due', 'Scadenza'), { ha: 'r', c: '#66725c' }], ['=E2+30', { ...D, b: 1 }]], [],
      [[L('Bill to', 'Destinatario'), { b: 1, c: G }]], [L('Client name', 'Nome cliente')], [L('Client address', 'Indirizzo cliente')], [],
      [[L('Description', 'Descrizione'), H], [L('Qty', 'Q.tà'), { ...H, ha: 'r' }], [L('Unit price', 'Prezzo unitario'), { ...H, ha: 'r' }], [L('VAT %', 'IVA %'), { ...H, ha: 'r' }], [L('Amount', 'Importo'), { ...H, ha: 'r' }]]];
    const it = [[L('Design work', 'Progettazione'), 12, 45, 0.22], [L('Development', 'Sviluppo'), 20, 50, 0.22], [L('Hosting (year)', 'Hosting (anno)'), 1, 120, 0.22]];
    it.forEach((x, i) => rows.push([x[0], x[1], [x[2], M], [x[3], { nf: '0%' }], [`=B${10 + i}*C${10 + i}`, M]]));
    rows.push([], [null, null, null, [L('Subtotal', 'Imponibile'), { ha: 'r' }], ['=SUM(E10:E12)', M]], [null, null, null, [L('VAT', 'IVA'), { ha: 'r' }], ['=SUMPRODUCT(E10:E12,D10:D12)', M]], [null, null, null, [L('Total', 'Totale'), { ...TOT, ha: 'r' }], ['=E14+E15', { ...TOT, ...M, fz: 13 }]], [], [[L('Payment by bank transfer within 30 days. Thank you!', 'Pagamento con bonifico entro 30 giorni. Grazie!'), SUB]]);
    return { sheets: [sheet(L('Invoice', 'Fattura'), rows, { w: [260, 70, 120, 80, 130], h: { 1: 40 }, grid: false })] };
  } },
  timesheet: { cat: 'work', build: (L, lang) => {
    const T = { nf: 'hh:mm' }, days = [L('Monday', 'Lunedì'), L('Tuesday', 'Martedì'), L('Wednesday', 'Mercoledì'), L('Thursday', 'Giovedì'), L('Friday', 'Venerdì')];
    const rows = [[[L('Weekly timesheet', 'Foglio ore settimanale'), TITLE]], [L('Name', 'Nome'), [L('Your name', 'Il tuo nome'), { b: 1 }]], [L('Hourly rate', 'Tariffa oraria'), [25, { nf: currencyFormat('EUR', lang) }]], [],
      [[L('Day', 'Giorno'), H], [L('Start', 'Inizio'), { ...H, ha: 'r' }], [L('End', 'Fine'), { ...H, ha: 'r' }], [L('Break (min)', 'Pausa (min)'), { ...H, ha: 'r' }], [L('Hours', 'Ore'), { ...H, ha: 'r' }]]];
    days.forEach((d, i) => rows.push([d, [9 / 24, T], [(i === 4 ? 16 : 18) / 24, T], 60, [`=(C${6 + i}-B${6 + i})*24-D${6 + i}/60`, { nf: '0.00' }]]));
    rows.push([], [[L('Total hours', 'Ore totali'), TOT], ['', TOT], ['', TOT], ['', TOT], ['=SUM(E6:E10)', { ...TOT, nf: '0.00' }]], [L('To pay', 'Da pagare'), null, null, null, ['=E12*B3', { b: 1, nf: currencyFormat('EUR', lang) }]]);
    return { sheets: [sheet(L('Hours', 'Ore'), rows, { w: [140, 90, 90, 110, 90], cf: [{ r: 'E6:E10', k: 'gt', a: '8', b: '', s: { c: '#b45309', b: 1 } }] })] };
  } },
  projects: { cat: 'work', build: (L, lang) => {
    const D = { nf: dateFormat(lang) }, st = [L('To do', 'Da fare'), L('In progress', 'In corso'), L('Done', 'Fatto'), L('Blocked', 'Bloccato')];
    const tasks = [[L('Research', 'Ricerca'), 'Anna', st[2], toSerial(2026, 3, 2), toSerial(2026, 3, 9), 1], [L('Wireframes', 'Bozzetti'), 'Luca', st[2], toSerial(2026, 3, 9), toSerial(2026, 3, 16), 1], [L('Design', 'Grafica'), 'Anna', st[1], toSerial(2026, 3, 16), toSerial(2026, 3, 30), 0.6], [L('Development', 'Sviluppo'), 'Marco', st[1], toSerial(2026, 3, 23), toSerial(2026, 4, 20), 0.35], [L('Testing', 'Prove'), 'Sara', st[0], toSerial(2026, 4, 20), toSerial(2026, 4, 27), 0], [L('Launch', 'Lancio'), 'Luca', st[0], toSerial(2026, 4, 28), toSerial(2026, 4, 28), 0]];
    const rows = [[[L('Project tracker', 'Avanzamento progetto'), TITLE]], [[L('Done', 'Completato'), SUB], ['=AVERAGE(G4:G9)', { nf: '0%', b: 1, c: G }]], [[L('Task', 'Attività'), H], [L('Owner', 'Responsabile'), H], [L('Status', 'Stato'), H], [L('Start', 'Inizio'), H], [L('Due', 'Scadenza'), H], [L('Days', 'Giorni'), { ...H, ha: 'r' }], [L('Progress', 'Avanzamento'), { ...H, ha: 'r' }]]];
    tasks.forEach((x, i) => rows.push([x[0], x[1], x[2], [x[3], D], [x[4], D], [`=NETWORKDAYS(D${4 + i},E${4 + i})`, null], [x[5], { nf: '0%' }]]));
    return { sheets: [sheet(L('Tasks', 'Attività'), rows, { w: [180, 110, 130, 110, 110, 80, 130], freeze: { r: 3, c: 1 }, dv: [{ r: 'C4:C30', k: 'list', list: st, a: '', b: '', strict: true }], filter: { r: 'A3:G9', h: {} },
      cf: [{ r: 'G4:G30', k: 'bars', a: '', b: '', s: {}, c1: '#9ccc4a' }, { r: 'C4:C30', k: 'eq', a: st[2], b: '', s: { bg: '#d3f3d8', c: '#14532d' } }, { r: 'C4:C30', k: 'eq', a: st[3], b: '', s: { bg: '#ffc9c9', c: '#9f1239' } }, { r: 'E4:E30', k: 'formula', a: 'AND(E4<TODAY(),G4<1)', b: '', s: { c: '#b3261e', b: 1 } }] })] };
  } },
  sales: { cat: 'work', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang, 0) }, months = lang === 'it' ? ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const prods = [[L('Coffee', 'Caffè'), [4200, 4500, 4800, 5100, 5600, 6100]], [L('Tea', 'Tè'), [1800, 1700, 1900, 2100, 2000, 2300]], [L('Pastries', 'Dolci'), [2600, 2800, 3100, 2900, 3300, 3600]]];
    const rows = [[[L('Sales report', 'Rapporto vendite'), TITLE]], [[L('First half of the year', 'Primo semestre'), SUB]], [], [[L('Product', 'Prodotto'), H], ...months.map((m) => [m, { ...H, ha: 'r' }]), [L('Total', 'Totale'), { ...H, ha: 'r' }], [L('Share', 'Quota'), { ...H, ha: 'r' }]]];
    prods.forEach(([n, v], i) => rows.push([n, ...v.map((x) => [x, M]), [`=SUM(B${5 + i}:G${5 + i})`, { ...M, b: 1 }], [`=H${5 + i}/$H$8`, { nf: '0.0%' }]]));
    rows.push([[L('Total', 'Totale'), TOT], ...months.map((_, j) => [`=SUM(${colName(2 + j)}5:${colName(2 + j)}7)`, { ...TOT, ...M }]), ['=SUM(H5:H7)', { ...TOT, ...M }], ['=SUM(I5:I7)', { ...TOT, nf: '0%' }]], [], [[L('Growth Jan → Jun', 'Crescita gen → giu'), { b: 1 }], ['=G8/B8-1', { nf: '+0.0%;-0.0%', b: 1, c: G }]]);
    return { sheets: [sheet(L('Sales', 'Vendite'), rows, { w: [200, 80, 80, 80, 80, 80, 80, 100, 80], freeze: { r: 4, c: 1 }, cf: [{ r: 'B5:G7', k: 'scale', a: '', b: '', s: {}, c1: '#ffffff', c2: '#9ccc4a' }], charts: [{ k: 'column', r: 'A4:G7', rows: true, title: L('Monthly sales', 'Vendite mensili'), x: 214, y: 290, w: 480, h: 300 }, { k: 'line', r: 'A4:G7', rows: true, title: L('Trend', 'Andamento'), x: 710, y: 290, w: 420, h: 300 }] })] };
  } },
  inventory: { cat: 'work', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) }, items = [['A-100', L('Notebook', 'Quaderno'), 140, 50, 2.4], ['A-101', L('Pen, blue', 'Penna blu'), 35, 100, 0.8], ['A-102', L('Stapler', 'Pinzatrice'), 12, 10, 7.5], ['B-200', L('Paper A4 (500)', 'Carta A4 (500)'), 8, 20, 4.9], ['B-201', L('Envelopes', 'Buste'), 300, 100, 0.12], ['C-300', L('Highlighter', 'Evidenziatore'), 44, 30, 1.1]];
    const rows = [[[L('Inventory', 'Magazzino'), TITLE]], [], [[L('Code', 'Codice'), H], [L('Item', 'Articolo'), H], [L('In stock', 'Giacenza'), { ...H, ha: 'r' }], [L('Minimum', 'Minimo'), { ...H, ha: 'r' }], [L('Unit cost', 'Costo unitario'), { ...H, ha: 'r' }], [L('Value', 'Valore'), { ...H, ha: 'r' }], [L('Reorder', 'Riordino'), { ...H, ha: 'c' }]]];
    items.forEach((x, i) => { const r = 4 + i; rows.push([x[0], x[1], x[2], x[3], [x[4], M], [`=C${r}*E${r}`, M], [`=IF(C${r}<D${r},"${L('Yes', 'Sì')}","")`, { ha: 'c', b: 1 }]]); });
    rows.push([], [[L('Total value', 'Valore totale'), TOT], ['', TOT], ['=SUM(C4:C9)', TOT], ['', TOT], ['', TOT], ['=SUM(F4:F9)', { ...TOT, ...M }], [`=COUNTIF(G4:G9,"${L('Yes', 'Sì')}")`, { ...TOT, ha: 'c' }]]);
    return { sheets: [sheet(L('Stock', 'Giacenze'), rows, { w: [80, 190, 90, 90, 110, 110, 90], freeze: { r: 3, c: 0 }, filter: { r: 'A3:G9', h: {} }, cf: [{ r: 'A4:G9', k: 'formula', a: '$C4<$D4', b: '', s: { bg: '#fdecea' } }, { r: 'G4:G9', k: 'filled', a: '', b: '', s: { c: '#b3261e' } }] })] };
  } },
  grades: { cat: 'school', build: (L) => {
    const st = [['Alice', 8, 7.5, 9], ['Bruno', 6, 6.5, 5.5], ['Carla', 9.5, 9, 10], ['Davide', 5, 6, 6.5], ['Elena', 7, 8, 7.5], ['Fabio', 4.5, 5, 6]];
    const rows = [[[L('Grade book', 'Registro voti'), TITLE]], [[L('Class 3B · Maths', 'Classe 3B · Matematica'), SUB]], [], [[L('Student', 'Studente'), H], [L('Test 1', 'Verifica 1'), { ...H, ha: 'r' }], [L('Test 2', 'Verifica 2'), { ...H, ha: 'r' }], [L('Test 3', 'Verifica 3'), { ...H, ha: 'r' }], [L('Average', 'Media'), { ...H, ha: 'r' }], [L('Result', 'Esito'), { ...H, ha: 'c' }]]];
    st.forEach((x, i) => { const r = 5 + i; rows.push([x[0], x[1], x[2], x[3], [`=AVERAGE(B${r}:D${r})`, { nf: '0.0', b: 1 }], [`=IFS(E${r}>=8,"${L('Excellent', 'Ottimo')}",E${r}>=6,"${L('Pass', 'Sufficiente')}",TRUE,"${L('Not yet', 'Insufficiente')}")`, { ha: 'c' }]]); });
    rows.push([], [[L('Class average', 'Media della classe'), TOT], ['=AVERAGE(B5:B10)', { ...TOT, nf: '0.0' }], ['=AVERAGE(C5:C10)', { ...TOT, nf: '0.0' }], ['=AVERAGE(D5:D10)', { ...TOT, nf: '0.0' }], ['=AVERAGE(E5:E10)', { ...TOT, nf: '0.0' }], ['', TOT]]);
    return { sheets: [sheet(L('Grades', 'Voti'), rows, { w: [140, 90, 90, 90, 90, 120], freeze: { r: 4, c: 1 }, dv: [{ r: 'B5:D100', k: 'number', list: [], a: '0', b: '10', strict: true }], cf: [{ r: 'B5:E10', k: 'lt', a: '6', b: '', s: { c: '#b3261e', b: 1 } }, { r: 'E5:E10', k: 'scale', a: '', b: '', s: {}, c1: '#ffc9c9', c3: '#fff3a3', c2: '#c8e6a0' }], charts: [{ k: 'column', r: 'A4:E10', title: L('Grades', 'Voti'), x: 660, y: 70, w: 420, h: 280 }] })] };
  } },
  attendance: { cat: 'school', build: (L, lang) => {
    const names = ['Alice', 'Bruno', 'Carla', 'Davide', 'Elena', 'Fabio'], days = 10;
    const head = [[L('Student', 'Studente'), H], ...Array.from({ length: days }, (_, i) => [toSerial(2026, 9, 14) + i + Math.floor(i / 5) * 2, { ...H, nf: 'd/m', ha: 'c' }]), [L('Present', 'Presenze'), { ...H, ha: 'r' }], ['%', { ...H, ha: 'r' }]];
    const rows = [[[L('Attendance', 'Presenze'), TITLE]], [], head];
    names.forEach((n, i) => { const r = 4 + i; rows.push([n, ...Array.from({ length: days }, (_, j) => (i * 7 + j * 3) % 11 !== 0), [`=COUNTIF(B${r}:K${r},TRUE)`, { b: 1 }], [`=L${r}/${days}`, { nf: '0%' }]]); });
    return { sheets: [sheet(L('Register', 'Registro'), rows, { w: [140, ...Array(days).fill(56), 80, 70], freeze: { r: 3, c: 1 }, dv: [{ r: 'B4:K100', k: 'check', list: [], a: '', b: '', strict: false }], cf: [{ r: 'M4:M100', k: 'lt', a: '0.8', b: '', s: { c: '#b3261e', b: 1 } }] })] };
  } },
  weekly: { cat: 'plan', build: (L, lang) => {
    const days = lang === 'it' ? ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const rows = [[[L('Weekly schedule', 'Programma settimanale'), TITLE]], [], [['', H], ...days.map((d) => [d, { ...H, ha: 'c' }])]];
    for (let hh = 8; hh <= 20; hh++) rows.push([[hh / 24, { nf: 'hh:mm', c: '#66725c', va: 't' }], ...days.map(() => '')]);
    rows[4][1] = [L('Gym', 'Palestra'), { bg: '#cdeaf7' }]; rows[5][2] = [L('Team meeting', 'Riunione'), { bg: '#fff3a3' }]; rows[9][3] = [L('Lunch with Sara', 'Pranzo con Sara'), { bg: '#f9d5ec' }]; rows[13][5] = [L('Football', 'Calcetto'), { bg: '#d3f3d8' }]; rows[6][6] = [L('Market', 'Mercato'), { bg: '#ffd9b8' }];
    return { sheets: [sheet(L('Week', 'Settimana'), rows, { w: [70, ...Array(7).fill(130)], freeze: { r: 3, c: 1 }, h: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [4 + i, 36])) })] };
  } },
  todo: { cat: 'plan', build: (L, lang) => {
    const D = { nf: dateFormat(lang) }, pr = [L('High', 'Alta'), L('Medium', 'Media'), L('Low', 'Bassa')];
    const items = [[true, L('Book the dentist', 'Prenotare il dentista'), pr[1], toSerial(2026, 2, 3)], [false, L('Send the report', 'Mandare il rapporto'), pr[0], toSerial(2026, 2, 6)], [false, L('Renew passport', 'Rinnovare il passaporto'), pr[0], toSerial(2026, 2, 20)], [false, L('Buy a present for Marta', 'Comprare un regalo per Marta'), pr[2], toSerial(2026, 3, 1)], [false, L('Plan the holidays', 'Organizzare le vacanze'), pr[2], toSerial(2026, 3, 15)]];
    const rows = [[[L('To-do list', 'Cose da fare'), TITLE]], [[L('Done', 'Fatte'), SUB], ['=COUNTIF(A5:A100,TRUE)&" / "&COUNTA(B5:B100)', { b: 1, c: G }]], [], [[L('Done', 'Fatto'), { ...H, ha: 'c' }], [L('Task', 'Cosa'), H], [L('Priority', 'Priorità'), H], [L('Due', 'Entro'), H], [L('Days left', 'Giorni'), { ...H, ha: 'r' }]]];
    items.forEach((x, i) => rows.push([x[0], x[1], x[2], [x[3], D], [`=IF(A${5 + i},"",D${5 + i}-TODAY())`, null]]));
    return { sheets: [sheet(L('To do', 'Da fare'), rows, { w: [70, 260, 100, 110, 90], freeze: { r: 4, c: 0 }, dv: [{ r: 'A5:A100', k: 'check', list: [], a: '', b: '', strict: false }, { r: 'C5:C100', k: 'list', list: pr, a: '', b: '', strict: false }],
      cf: [{ r: 'B5:E100', k: 'formula', a: '$A5=TRUE', b: '', s: { c: '#9aa29d', k: 1 } }, { r: 'C5:C100', k: 'eq', a: pr[0], b: '', s: { c: '#b3261e', b: 1 } }, { r: 'E5:E100', k: 'lt', a: '0', b: '', s: { bg: '#ffc9c9' } }] })] };
  } },
  event: { cat: 'plan', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) }, it = [[L('Venue', 'Location'), 1500, 1500], [L('Catering', 'Catering'), 2200, 2480], [L('Music', 'Musica'), 600, 550], [L('Flowers', 'Fiori'), 300, 340], [L('Photographer', 'Fotografo'), 800, 800], [L('Invitations', 'Inviti'), 150, 120]];
    const rows = [[[L('Event budget', 'Budget evento'), TITLE]], [[L('Guests', 'Invitati'), SUB], [80, { b: 1 }]], [], [[L('Item', 'Voce'), H], [L('Planned', 'Previsto'), { ...H, ha: 'r' }], [L('Actual', 'Effettivo'), { ...H, ha: 'r' }], [L('Difference', 'Differenza'), { ...H, ha: 'r' }]]];
    it.forEach((x, i) => rows.push([x[0], [x[1], M], [x[2], M], [`=B${5 + i}-C${5 + i}`, M]]));
    rows.push([[L('Total', 'Totale'), TOT], ['=SUM(B5:B10)', { ...TOT, ...M }], ['=SUM(C5:C10)', { ...TOT, ...M }], ['=B11-C11', { ...TOT, ...M }]], [], [L('Per guest', 'Per invitato'), ['=B11/$B$2', M], ['=C11/$B$2', M]]);
    return { sheets: [sheet(L('Budget', 'Budget'), rows, { w: [170, 120, 120, 120], cf: [{ r: 'D5:D11', k: 'lt', a: '0', b: '', s: { c: '#b3261e', b: 1 } }], charts: [{ k: 'bar', r: 'A4:C10', title: L('Planned and actual', 'Previsto ed effettivo'), x: 600, y: 60, w: 440, h: 300 }] })] };
  } },
  loan: { cat: 'money', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang) };
    const rows = [[[L('Loan calculator', 'Calcolo del mutuo'), TITLE]], [], [[L('Amount', 'Importo'), HL], [150000, { ...M, b: 1 }]], [[L('Yearly rate', 'Tasso annuo'), HL], [0.034, { nf: '0.00%', b: 1 }]], [[L('Years', 'Anni'), HL], [25, { b: 1 }]], [],
      [[L('Monthly payment', 'Rata mensile'), { b: 1, fz: 13 }], ['=-PMT(B4/12,B5*12,B3)', { ...M, b: 1, fz: 13, c: G }]], [L('Total paid', 'Totale pagato'), ['=B7*B5*12', M]], [L('Total interest', 'Interessi totali'), ['=B8-B3', M]], [],
      [[L('Payment', 'Rata'), H], [L('Interest', 'Interessi'), { ...H, ha: 'r' }], [L('Capital', 'Capitale'), { ...H, ha: 'r' }], [L('Left to pay', 'Debito residuo'), { ...H, ha: 'r' }]]];
    for (let i = 1; i <= 24; i++) { const r = 11 + i; rows.push([i, [`=-IPMT($B$4/12,A${r},$B$5*12,$B$3)`, M], [`=-PPMT($B$4/12,A${r},$B$5*12,$B$3)`, M], [i === 1 ? `=B3-C${r}` : `=D${r - 1}-C${r}`, M]]); }
    return { sheets: [sheet(L('Loan', 'Mutuo'), rows, { w: [170, 140, 140, 150], freeze: { r: 11, c: 0 }, charts: [{ k: 'stacked', r: 'A11:C35', title: L('Interest and capital', 'Interessi e capitale'), x: 640, y: 40, w: 460, h: 300 }] })] };
  } },
  savings: { cat: 'money', build: (L, lang, cur) => {
    const M = { nf: currencyFormat(cur, lang, 0) };
    const rows = [[[L('Savings goal', 'Obiettivo di risparmio'), TITLE]], [], [[L('Goal', 'Obiettivo'), HL], [10000, { ...M, b: 1 }]], [[L('Saved so far', 'Già messo da parte'), HL], [1500, { ...M, b: 1 }]], [[L('Each month', 'Ogni mese'), HL], [250, { ...M, b: 1 }]], [[L('Yearly return', 'Rendimento annuo'), HL], [0.02, { nf: '0.0%', b: 1 }]], [],
      [[L('Months to the goal', 'Mesi per arrivarci'), { b: 1 }], ['=ROUNDUP(NPER(B6/12,-B5,-B4,B3),0)', { b: 1, c: G, fz: 13 }]], [L('Reached on', 'Raggiunto il'), ['=EDATE(TODAY(),B8)', { nf: 'mmmm yyyy', b: 1 }]], [],
      [[L('Year', 'Anno'), H], [L('Balance', 'Saldo'), { ...H, ha: 'r' }]]];
    for (let y = 0; y <= 5; y++) rows.push([y, [`=FV($B$6/12,A${12 + y}*12,-$B$5,-$B$4)`, M]]);
    return { sheets: [sheet(L('Savings', 'Risparmi'), rows, { w: [190, 140], cf: [{ r: 'B12:B17', k: 'formula', a: 'B12>=$B$3', b: '', s: { bg: '#d3f3d8', b: 1 } }], charts: [{ k: 'area', r: 'A11:B17', title: L('Balance over time', 'Saldo nel tempo'), x: 400, y: 40, w: 460, h: 280 }] })] };
  } },
};

/** A workbook from a template, in the language of the app. */
export function fromTemplate(id, o = {}) {
  const lang = o.lang || 'en', L = (en, it) => (lang === 'it' ? it : en), cur = o.currency || 'EUR';
  const b = (TEMPLATES[id] || TEMPLATES.blank).build(L, lang, cur);
  return { settings: { lang: o.bookLang || (lang === 'it' ? 'it' : 'en'), currency: cur, font: 'sans', fontSize: 10, ...(b.settings || {}) }, sheets: b.sheets };
}
