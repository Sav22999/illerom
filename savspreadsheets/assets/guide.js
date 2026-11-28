/**
 * The guided formula: a function chosen from the list, then filled in one argument at a time, each explained, with an
 * example and the result shown while writing. What it makes is an ordinary formula, written in the cell (or where the
 * caret is, when a formula is being written).
 */
import { btn, h, iconBtn, put } from './ui.js';
import { getLang, t } from './i18n.js';
import { rangeStr } from './model.js';
import { CATS, FN, desc } from './sigs.js';
import { FUNCTIONS, isErr, show } from './formula.js';

const L = (en, it) => [en, it];
/** What goes in each argument (by its name without the number), in English and Italian. */
const ARG = {
  number: L('A number, a cell (A1) or a range of cells (A1:A9).', 'Un numero, una cella (A1) o un intervallo di celle (A1:A9).'),
  value: L('A value: a number, a text in quotes, a cell or a range.', 'Un valore: un numero, un testo tra virgolette, una cella o un intervallo.'),
  text: L('A text (written in quotes, "like this") or the cell that holds it.', 'Un testo (tra virgolette, "così") o la cella che lo contiene.'),
  range: L('The cells to look at, e.g. A2:A20.', 'Le celle da guardare, es. A2:A20.'),
  array: L('A range of cells (A2:C20) or a list of values in braces, e.g. {1,2,3}.', 'Un intervallo di celle (A2:C20) o un elenco di valori tra graffe, es. {1,2,3}.'),
  criterion: L('The condition the cells must meet: ">10", "Rome", "<>0", or a cell.', 'La condizione che le celle devono rispettare: ">10", "Roma", "<>0", o una cella.'),
  logical: L('Something true or false, e.g. B2>0 or C3="yes".', 'Qualcosa di vero o falso, es. B2>0 oppure C3="sì".'),
  condition: L('A test that is true or false, e.g. B2>=18.', 'Una verifica vera o falsa, es. B2>=18.'),
  value_if_true: L('What to show when the condition is true.', 'Cosa mostrare se la condizione è vera.'),
  value_if_false: L('What to show when it is false (empty: FALSE).', 'Cosa mostrare se è falsa (vuoto: FALSO).'),
  value_if_error: L('What to show instead of an error.', 'Cosa mostrare al posto di un errore.'),
  value_if_na: L('What to show instead of #N/A (not found).', 'Cosa mostrare al posto di #N/A (non trovato).'),
  expression: L('The value to compare with each case.', 'Il valore da confrontare con ogni caso.'),
  case: L('A value to compare with the expression.', 'Un valore da confrontare con l’espressione.'),
  default: L('What to show when no case matches.', 'Cosa mostrare se nessun caso corrisponde.'),
  index: L('The position to take: 1 for the first value, 2 for the second…', 'La posizione da prendere: 1 per il primo valore, 2 per il secondo…'),
  sum_range: L('The cells to add up (when different from the range checked).', 'Le celle da sommare (se diverse da quelle verificate).'),
  average_range: L('The cells to average (when different from the range checked).', 'Le celle di cui fare la media (se diverse da quelle verificate).'),
  max_range: L('The cells among which to find the largest.', 'Le celle tra cui trovare il più grande.'),
  min_range: L('The cells among which to find the smallest.', 'Le celle tra cui trovare il più piccolo.'),
  digits: L('How many decimals to keep (0: a whole number; negative: tens, hundreds…).', 'Quanti decimali tenere (0: numero intero; negativo: decine, centinaia…).'),
  multiple: L('The multiple to round to, e.g. 5 or 0.05.', 'Il multiplo a cui arrotondare, es. 5 o 0,05 (scritto 0.05).'),
  significance: L('The step to round to (empty: 1).', 'Il passo a cui arrotondare (vuoto: 1).'),
  dividend: L('The number to divide.', 'Il numero da dividere.'),
  divisor: L('The number to divide by.', 'Il numero per cui dividere.'),
  power: L('The exponent.', 'L’esponente.'),
  low: L('The smallest number possible.', 'Il numero più piccolo possibile.'),
  high: L('The largest number possible.', 'Il numero più grande possibile.'),
  rows: L('How many rows.', 'Quante righe.'),
  columns: L('How many columns.', 'Quante colonne.'),
  start: L('Where to start: the first number, or the position of the first character.', 'Da dove partire: il primo numero, o la posizione del primo carattere.'),
  step: L('How much each number grows (empty: 1).', 'Di quanto cresce ogni numero (vuoto: 1).'),
  function_num: L('Which calculation: 9 sum, 1 average, 2 count, 4 max, 5 min (add 100 to skip hidden rows).', 'Quale calcolo: 9 somma, 1 media, 2 conteggio, 4 massimo, 5 minimo (100 in più per saltare le righe nascoste).'),
  ref: L('A range of cells.', 'Un intervallo di celle.'),
  base: L('The base of the logarithm (empty: 10).', 'La base del logaritmo (vuoto: 10).'),
  k: L('Which one: 1 for the first, 2 for the second… (for percentiles: from 0 to 1).', 'Quale: 1 per il primo, 2 per il secondo… (per i percentili: da 0 a 1).'),
  order: L('0 or empty: the largest is 1st; 1: the smallest is 1st.', '0 o vuoto: il più grande è il 1°; 1: il più piccolo è il 1°.'),
  quart: L('Which quartile: 0 min, 1, 2 (median), 3, 4 max.', 'Quale quartile: 0 minimo, 1, 2 (mediana), 3, 4 massimo.'),
  x: L('The value for which to forecast.', 'Il valore per cui fare la previsione.'),
  known_ys: L('The values known (what you want to forecast).', 'I valori noti (quelli da prevedere).'),
  known_xs: L('The values they depend on (e.g. the months).', 'I valori da cui dipendono (es. i mesi).'),
  column: L('Which column of the range to take: 1 is the first.', 'Quale colonna dell’intervallo prendere: 1 è la prima.'),
  row: L('Which row of the range to take: 1 is the first.', 'Quale riga dell’intervallo prendere: 1 è la prima.'),
  approximate: L('FALSE: the exact value (usually what you want); TRUE: the closest smaller one, in a sorted list.', 'FALSE: il valore esatto (di solito quello voluto); TRUE: il più vicino più piccolo, in un elenco ordinato.'),
  lookup_array: L('The cells where to look for the value.', 'Le celle dove cercare il valore.'),
  return_array: L('The cells from which to take the result (as many as the ones looked in).', 'Le celle da cui prendere il risultato (tante quante quelle in cui si cerca).'),
  if_not_found: L('What to show when nothing is found.', 'Cosa mostrare se non trova niente.'),
  match_mode: L('0 or empty: exact; -1: exact or the next smaller; 1: exact or the next larger; 2: with * and ?.', '0 o vuoto: esatto; -1: esatto o il più piccolo successivo; 1: esatto o il più grande successivo; 2: con * e ?.'),
  search_mode: L('1 or empty: from the first; -1: from the last.', '1 o vuoto: dal primo; -1: dall’ultimo.'),
  lookup_vector: L('One row or one column where to look.', 'Una riga o una colonna dove cercare.'),
  result_vector: L('One row or one column from which to take the result.', 'Una riga o una colonna da cui prendere il risultato.'),
  match_type: L('0: exact (usually what you want); 1 or -1: the closest, in a sorted list.', '0: esatto (di solito quello voluto); 1 o -1: il più vicino, in un elenco ordinato.'),
  reference: L('The cell or range to start from.', 'La cella o l’intervallo da cui partire.'),
  height: L('How many rows the result has (empty: as many as the reference).', 'Quante righe ha il risultato (vuoto: come il riferimento).'),
  width: L('How many columns the result has (empty: as many as the reference).', 'Quante colonne ha il risultato (vuoto: come il riferimento).'),
  ref_text: L('The address written as text, e.g. "B"&C1.', 'L’indirizzo scritto come testo, es. "B"&C1.'),
  include: L('Which rows to keep: a test on the cells, e.g. B2:B20>100.', 'Quali righe tenere: una verifica sulle celle, es. B2:B20>100.'),
  if_empty: L('What to show when nothing is kept.', 'Cosa mostrare se non resta niente.'),
  sort_index: L('Which column to sort by: 1 is the first.', 'Per quale colonna ordinare: 1 è la prima.'),
  sort_order: L('1 or empty: ascending; -1: descending.', '1 o vuoto: crescente; -1: decrescente.'),
  by_col: L('FALSE or empty: by rows; TRUE: by columns.', 'FALSE o vuoto: per righe; TRUE: per colonne.'),
  exactly_once: L('TRUE: only the values that appear once.', 'TRUE: solo i valori che compaiono una volta sola.'),
  delimiter: L('The text that separates the pieces, e.g. ", ".', 'Il testo che separa i pezzi, es. ", ".'),
  ignore_empty: L('TRUE: the empty cells are skipped.', 'TRUE: le celle vuote vengono saltate.'),
  count: L('How many characters (empty: 1).', 'Quanti caratteri (vuoto: 1).'),
  old_text: L('The text to replace.', 'Il testo da sostituire.'),
  new_text: L('The text to put in its place.', 'Il testo da mettere al suo posto.'),
  instance: L('Which occurrence (empty: all, or the first).', 'Quale occorrenza (vuoto: tutte, o la prima).'),
  find_text: L('The text to look for.', 'Il testo da cercare.'),
  within_text: L('The text in which to look.', 'Il testo in cui cercare.'),
  format: L('How to show the value, e.g. "0.00", "0%", "dd/mm/yyyy".', 'Come mostrare il valore, es. "0.00", "0%", "dd/mm/yyyy".'),
  times: L('How many times to repeat it.', 'Quante volte ripeterlo.'),
  col_delimiter: L('The text that separates the columns.', 'Il testo che separa le colonne.'),
  row_delimiter: L('The text that separates the rows.', 'Il testo che separa le righe.'),
  year: L('The year, e.g. 2026.', 'L’anno, es. 2026.'),
  month: L('The month, from 1 to 12.', 'Il mese, da 1 a 12.'),
  day: L('The day of the month.', 'Il giorno del mese.'),
  hour: L('The hour, from 0 to 23.', 'L’ora, da 0 a 23.'),
  minute: L('The minutes.', 'I minuti.'),
  second: L('The seconds.', 'I secondi.'),
  date: L('A date: a cell with a date, or DATE(2026,5,20).', 'Una data: una cella con una data, o DATE(2026,5,20).'),
  time: L('A time: a cell with a time, or TIME(14,30,0).', 'Un orario: una cella con un orario, o TIME(14,30,0).'),
  type: L('How to count (empty: the usual way). For loans: 0 at the end of each period, 1 at the beginning.', 'Come contare (vuoto: il modo solito). Per i prestiti: 0 a fine periodo, 1 a inizio periodo.'),
  start_date: L('The date to start from.', 'La data da cui partire.'),
  end_date: L('The date to arrive at.', 'La data a cui arrivare.'),
  months: L('How many months later (negative: earlier).', 'Quanti mesi dopo (negativo: prima).'),
  unit: L('What to count: "y" years, "m" months, "d" days.', 'Cosa contare: "y" anni, "m" mesi, "d" giorni.'),
  days: L('How many working days later.', 'Quanti giorni lavorativi dopo.'),
  holidays: L('The cells with the holidays to skip (optional).', 'Le celle con le festività da saltare (facoltativo).'),
  rate: L('The interest rate of each period, e.g. 3%/12 for 3% a year paid monthly.', 'Il tasso di ogni periodo, es. 3%/12 per il 3% annuo pagato ogni mese.'),
  periods: L('How many payments in all, e.g. 20*12 for 20 years monthly.', 'Quanti pagamenti in tutto, es. 20*12 per 20 anni mensili.'),
  period: L('Which payment: from 1 to the number of periods.', 'Quale pagamento: da 1 al numero di periodi.'),
  present_value: L('The amount today (the loan, the capital).', 'L’importo oggi (il prestito, il capitale).'),
  future_value: L('The amount wanted at the end (empty: 0).', 'L’importo voluto alla fine (vuoto: 0).'),
  payment: L('The payment of each period (money paid: negative).', 'Il pagamento di ogni periodo (soldi pagati: negativo).'),
  guess: L('A first guess of the rate (empty: 10%).', 'Una prima stima del tasso (vuoto: 10%).'),
  values: L('The cash flows: money paid negative, received positive.', 'I flussi di cassa: soldi pagati negativi, ricevuti positivi.'),
  url: L('The address of the link, in quotes.', 'L’indirizzo del collegamento, tra virgolette.'),
  label: L('The text shown in the cell (empty: the address).', 'Il testo mostrato nella cella (vuoto: l’indirizzo).'),
};
/** An example of each function, with literal values so it works anywhere. A third item: the result described (functions
 *  that fill several cells), shown instead of computing it. */
const EX = {
  SUM: ['=SUM(10, 20, 5)'], AVERAGE: ['=AVERAGE(4, 8, 6)'], COUNT: ['=COUNT(1, "a", 3)'], COUNTA: ['=COUNTA(1, "a", 3)'], COUNTBLANK: ['=COUNTBLANK(A1:A10)'],
  MAX: ['=MAX(3, 9, 4)'], MIN: ['=MIN(3, 9, 4)'], IF: ['=IF(20>=18, "adult", "minor")'], IFS: ['=IFS(75>=90, "A", 75>=70, "B", TRUE, "C")'],
  IFERROR: ['=IFERROR(10/0, "—")'], IFNA: ['=IFNA(MATCH("z", {"a","b"}, 0), "not found")'], AND: ['=AND(5>1, 2<3)'], OR: ['=OR(5<1, 2<3)'], XOR: ['=XOR(TRUE, FALSE)'], NOT: ['=NOT(5>1)'],
  SWITCH: ['=SWITCH(2, 1, "one", 2, "two", "other")'], CHOOSE: ['=CHOOSE(2, "red", "green", "blue")'],
  SUMIF: ['=SUMIF({5,12,30}, ">10")'], SUMIFS: ['=SUMIFS({5,12,30}, {5,12,30}, ">10", {1,2,3}, "<3")'], COUNTIF: ['=COUNTIF({5,12,30}, ">10")'], COUNTIFS: ['=COUNTIFS({5,12,30}, ">10", {1,2,3}, ">2")'],
  AVERAGEIF: ['=AVERAGEIF({5,12,30}, ">10")'], AVERAGEIFS: ['=AVERAGEIFS({5,12,30}, {5,12,30}, ">1", {1,2,3}, ">1")'], MAXIFS: ['=MAXIFS({5,12,30}, {1,2,1}, 1)'], MINIFS: ['=MINIFS({5,12,30}, {1,2,1}, 1)'],
  SUMPRODUCT: ['=SUMPRODUCT({2,3}, {10,20})'], ROUND: ['=ROUND(3.14159, 2)'], ROUNDUP: ['=ROUNDUP(3.141, 1)'], ROUNDDOWN: ['=ROUNDDOWN(3.19, 1)'], MROUND: ['=MROUND(17, 5)'],
  CEILING: ['=CEILING(4.2, 1)'], FLOOR: ['=FLOOR(4.8, 1)'], INT: ['=INT(7.9)'], TRUNC: ['=TRUNC(-7.9)'], ABS: ['=ABS(-12)'], MOD: ['=MOD(17, 5)'], POWER: ['=POWER(2, 10)'], SQRT: ['=SQRT(81)'],
  PRODUCT: ['=PRODUCT(2, 3, 4)'], RAND: ['=RAND()', L('A random number between 0 and 1, new at every change.', 'Un numero casuale tra 0 e 1, nuovo a ogni modifica.')],
  RANDBETWEEN: ['=RANDBETWEEN(1, 6)', L('A whole number from 1 to 6, like a die.', 'Un numero intero da 1 a 6, come un dado.')], SEQUENCE: ['=SEQUENCE(5)', L('1, 2, 3, 4, 5 in the cells below.', '1, 2, 3, 4, 5 nelle celle sotto.')],
  SUBTOTAL: ['=SUBTOTAL(9, {1,2,3})'], LOG: ['=LOG(1000)'], LN: ['=LN(EXP(2))'], EXP: ['=EXP(1)'], PI: ['=PI()'], MEDIAN: ['=MEDIAN(1, 3, 9)'], MODE: ['=MODE(1, 2, 2, 3)'],
  STDEV: ['=STDEV(2, 4, 4, 4, 5, 5, 7, 9)'], VAR: ['=VAR(2, 4, 6)'], LARGE: ['=LARGE({5,12,30,8}, 2)'], SMALL: ['=SMALL({5,12,30,8}, 2)'], RANK: ['=RANK(12, {5,12,30,8})'],
  PERCENTILE: ['=PERCENTILE({1,2,3,4,5}, 0.5)'], QUARTILE: ['=QUARTILE({1,2,3,4,5}, 1)'], CORREL: ['=CORREL({1,2,3}, {2,4,7})'], FORECAST: ['=FORECAST(4, {10,20,30}, {1,2,3})'],
  SLOPE: ['=SLOPE({10,20,30}, {1,2,3})'], INTERCEPT: ['=INTERCEPT({10,20,30}, {1,2,3})'],
  VLOOKUP: ['=VLOOKUP("pear", {"apple",1.2;"pear",2.5}, 2, FALSE)'], HLOOKUP: ['=HLOOKUP("Feb", {"Jan","Feb";100,120}, 2, FALSE)'],
  XLOOKUP: ['=XLOOKUP("pear", {"apple";"pear"}, {1.2;2.5}, "none")'], LOOKUP: ['=LOOKUP(2, {1,2,3}, {"a","b","c"})'], MATCH: ['=MATCH("pear", {"apple","pear","fig"}, 0)'],
  XMATCH: ['=XMATCH("fig", {"apple","pear","fig"})'], INDEX: ['=INDEX({"a","b";"c","d"}, 2, 1)'], OFFSET: ['=OFFSET(A1, 2, 1)', L('The value of B3: 2 rows down and 1 column right of A1.', 'Il valore di B3: 2 righe sotto e 1 colonna a destra di A1.')],
  INDIRECT: ['=INDIRECT("B"&2)', L('The value of B2.', 'Il valore di B2.')], ROW: ['=ROW(C7)'], COLUMN: ['=COLUMN(C7)'], ROWS: ['=ROWS(A1:A10)'], COLUMNS: ['=COLUMNS(A1:D1)'],
  TRANSPOSE: ['=TRANSPOSE(A1:C1)', L('The three cells of the row, written down a column.', 'Le tre celle della riga, scritte in colonna.')],
  FILTER: ['=FILTER(A2:B20, B2:B20>100)', L('Only the rows where column B is over 100, in the cells below.', 'Solo le righe in cui la colonna B supera 100, nelle celle sotto.')],
  SORT: ['=SORT(A2:B20, 2, -1)', L('The rows sorted by the second column, largest first.', 'Le righe ordinate per la seconda colonna, dalla più grande.')],
  UNIQUE: ['=UNIQUE(A2:A20)', L('Each value of the column once.', 'Ogni valore della colonna una volta sola.')],
  CONCAT: ['=CONCAT("Sav", "Office")'], CONCATENATE: ['=CONCATENATE("Hello", " ", "world")'], TEXTJOIN: ['=TEXTJOIN(", ", TRUE, "red", "", "blue")'],
  LEFT: ['=LEFT("Spreadsheet", 6)'], RIGHT: ['=RIGHT("Spreadsheet", 5)'], MID: ['=MID("Spreadsheet", 7, 5)'], LEN: ['=LEN("hello")'], LOWER: ['=LOWER("HELLO")'], UPPER: ['=UPPER("hello")'],
  PROPER: ['=PROPER("mario rossi")'], TRIM: ['=TRIM("  too   many  spaces ")'], SUBSTITUTE: ['=SUBSTITUTE("2026-05-20", "-", "/")'], REPLACE: ['=REPLACE("abcdef", 2, 3, "XY")'],
  FIND: ['=FIND("o", "Hello world")'], SEARCH: ['=SEARCH("WORLD", "Hello world")'], TEXT: ['=TEXT(0.256, "0.0%")'], VALUE: ['=VALUE("42")'], REPT: ['=REPT("★", 4)'], EXACT: ['=EXACT("Rome", "rome")'],
  TEXTBEFORE: ['=TEXTBEFORE("name@mail.com", "@")'], TEXTAFTER: ['=TEXTAFTER("name@mail.com", "@")'], TEXTSPLIT: ['=TEXTSPLIT("a,b,c", ",")', L('a, b and c in three cells side by side.', 'a, b e c in tre celle affiancate.')],
  TODAY: ['=TODAY()'], NOW: ['=NOW()'], DATE: ['=DATE(2026, 5, 20)'], TIME: ['=TIME(14, 30, 0)'], YEAR: ['=YEAR(DATE(2026, 5, 20))'], MONTH: ['=MONTH(DATE(2026, 5, 20))'], DAY: ['=DAY(DATE(2026, 5, 20))'],
  HOUR: ['=HOUR(TIME(14, 30, 0))'], MINUTE: ['=MINUTE(TIME(14, 30, 0))'], WEEKDAY: ['=WEEKDAY(DATE(2026, 5, 20), 2)'], WEEKNUM: ['=WEEKNUM(DATE(2026, 5, 20))'],
  EDATE: ['=EDATE(DATE(2026, 1, 31), 1)'], EOMONTH: ['=EOMONTH(DATE(2026, 2, 10), 0)'], DATEDIF: ['=DATEDIF(DATE(2000, 3, 15), DATE(2026, 5, 20), "y")'], DAYS: ['=DAYS(DATE(2026, 12, 25), DATE(2026, 5, 20))'],
  NETWORKDAYS: ['=NETWORKDAYS(DATE(2026, 5, 1), DATE(2026, 5, 31))'], WORKDAY: ['=WORKDAY(DATE(2026, 5, 20), 10)'],
  ISBLANK: ['=ISBLANK(Z999)'], ISNUMBER: ['=ISNUMBER(42)'], ISTEXT: ['=ISTEXT("abc")'], ISERROR: ['=ISERROR(1/0)'], ISNA: ['=ISNA(MATCH("z", {"a"}, 0))'],
  PMT: ['=PMT(3%/12, 20*12, 150000)'], FV: ['=FV(2%/12, 10*12, -100)'], PV: ['=PV(3%/12, 5*12, -500)'], NPER: ['=NPER(3%/12, -500, 20000)'], RATE: ['=RATE(5*12, -500, 27000)'],
  NPV: ['=NPV(5%, -1000, 300, 400, 500)'], IRR: ['=IRR({-1000,300,400,500})'], IPMT: ['=IPMT(3%/12, 1, 20*12, 150000)'], PPMT: ['=PPMT(3%/12, 1, 20*12, 150000)'],
  HYPERLINK: ['=HYPERLINK("https://savoffice.eu", "SavOffice")'],
};
const say = (pair) => (pair ? pair[getLang() === 'it' ? 1 : 0] : '');

/** The arguments of a signature, with the group that can be repeated ("…"). */
function parseSig(args) {
  const toks = [];
  let opt = false;
  for (const raw of args) {
    if (raw === '…') { toks.push({ more: true }); continue; }
    const open = raw.startsWith('['), close = raw.endsWith(']');
    if (open) opt = true;
    const name = raw.replace(/[[\]]/g, '');
    toks.push({ name, optional: opt });
    if (close) opt = false;
  }
  const at = toks.findIndex((x) => x.more);
  if (at < 0) return { fixed: toks, group: null, tail: [] };
  // the group repeated: the arguments just before "…" with the same number (number2 / condition2, value2 / range1, criterion1)
  const before = toks.slice(0, at), num = (x) => +(/(\d+)$/.exec(x.name)?.[1] || 0), last = num(before.at(-1));
  let g = before.length;
  while (g > 0 && num(before[g - 1]) === last && last > 0) g--;
  return { fixed: before, group: { tpl: before.slice(g).map((x) => ({ base: x.name.replace(/\d+$/, '') })), next: last + 1 }, tail: toks.slice(at + 1) };
}
const baseOf = (name) => name.replace(/\d+$/, '');
const human = (name) => { const b = baseOf(name).replace(/_/g, ' '), n = /(\d+)$/.exec(name)?.[1]; return n ? `${b} ${n}` : b; };

/** What is written in a field, as it goes in the formula: a text that is not a reference, a number or an expression is quoted. */
export function argText(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^".*"$/s.test(s) || /^-?\d+([.,]\d+)?%?$/.test(s) || /^(TRUE|FALSE)$/i.test(s) || /^\{.*\}$/s.test(s)) return s.replace(/^(-?\d+),(\d+)/, '$1.$2');
  if (/^(('[^']+'|[A-Za-z_][\w.]*)!)?\$?[A-Za-z]{1,3}\$?\d+(:\$?[A-Za-z]{1,3}\$?\d+)?$/.test(s) || /^\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}$/.test(s) || /^\d+:\d+$/.test(s)) return s.toUpperCase();
  if (/^=/.test(s)) return s.slice(1);
  // a formula piece (an operation, a function, a comparison): as it is
  if (/[()&*/^+]|[<>=]/.test(s) && !/^[<>=]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}
/** The arguments of an example formula, split at the commas that are not inside quotes, braces or parentheses. */
function splitArgs(f) {
  const m = /^=?[A-Z0-9.]+\((.*)\)$/s.exec(f.trim());
  if (!m) return [];
  const out = [];
  let depth = 0, q = false, cur = '';
  for (const ch of m[1]) {
    if (ch === '"') q = !q;
    if (!q && (ch === '(' || ch === '{')) depth++;
    if (!q && (ch === ')' || ch === '}')) depth--;
    if (!q && depth === 0 && ch === ',') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

/**
 * The panel "Formula" (on the right of the grid). x: the context of the sheet (sh, W.eng, cur, grid, ui…), read again at
 * every use, so the result follows the cell in use. o.insert(text, full): writes the formula (full "=…", text the call
 * alone, for a formula being written); o.name: start on a function.
 */
export function guidePanel(x, box, o = {}) {
  const X = () => (typeof x === 'function' ? x() : x);
  const run = (f) => { const c = X(); try { return c.W.eng.once(c.sh, c.grid.sel.r, c.grid.sel.c, f); } catch { return null; } };
  const result = (v) => { const lang = X().lang; return v === null || v === undefined ? '' : Array.isArray(v) ? show(Array.isArray(v[0]) ? v[0][0] : v[0], lang) + ' …' : show(v, lang); };
  const selRef = () => { const g = X().cur(); return g.r2 < 100000 && g.c2 < 702 ? rangeStr(g) : null; };

  // ---- step 1: which function
  function pickStep() {
    const q = h('sav-input', { label: t('search'), clearable: true, placeholder: 'SUM, IF, VLOOKUP…', size: 'sm' });
    q.addEventListener('keydown', (e) => e.stopPropagation());
    let cat = 'all';
    const cats = h('sav-chip-group', { value: 'all', required: true, class: 'gcats' }, h('sav-chip', { value: 'all', selected: true }, t('all')), CATS.map((c) => h('sav-chip', { value: c }, t('fc_' + c))));
    const list = h('div.fnlist.gl');
    const draw = () => {
      const s = (q.value || '').trim().toUpperCase(), ui = X().ui;
      const names = FUNCTIONS.filter((n) => FN[n] && (!s || n.includes(s) || desc(n, ui).toUpperCase().includes(s)) && (cat === 'all' || FN[n].cat === cat));
      put(list, names.length ? names.map((n) => h('button.fni', { onclick: () => fillStep(n) }, h('b', n), h('small', desc(n, ui)))) : h('p.muted', t('g_none')));
    };
    cats.addEventListener('change', (e) => { cat = e.detail?.value || cats.value || 'all'; draw(); });
    q.addEventListener('input', draw);
    draw();
    put(box, h('div.form.guide', h('p.muted.small', t('g_pick_t')), q, cats, list));
    setTimeout(() => q.focus?.(), 80);
  }

  // ---- step 2: its arguments, one by one
  function fillStep(name) {
    const sig = parseSig(FN[name].args), fields = [], ui = X().ui;
    const out = h('div.gres'), syn = h('code.gsyn'), groupBox = h('div.stack');
    let ins = null;
    const field = (argName, optional) => {
      const base = baseOf(argName);
      const inp = h('sav-input', { label: human(argName) + (optional ? ` (${t('optional')})` : ''), size: 'sm', help: say(ARG[base]) || '' });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const list = order(), i = list.findIndex((f) => f.inp === inp); if (list[i + 1]) list[i + 1].inp.focus?.(); else ins?.click(); } });
      inp.addEventListener('input', paint);
      inp.addEventListener('focusin', paint);
      // the cells selected on the grid now (the panel stays open while choosing them)
      const use = iconBtn('square-dashed-mouse-pointer', t('g_use_sel'), () => { const r = selRef(); if (r) { inp.value = r; paint(); } });
      const row = h('div.garg', inp, use);
      fields.push({ name: argName, optional, inp, row });
      return row;
    };
    const fixedRows = sig.fixed.map((a) => field(a.name, a.optional));
    let n = sig.group?.next || 0;
    const addGroup = () => { for (const g of sig.group.tpl) groupBox.append(field(g.base + n, true)); n++; paint(); };
    const tailRows = sig.tail.map((a) => field(a.name, a.optional));
    const order = () => [...fields].sort((a, b) => (a.row.compareDocumentPosition(b.row) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const formula = () => {
      const vals = order().map((f) => ({ f, v: argText(f.inp.value) }));
      while (vals.length && !vals.at(-1).v && vals.at(-1).f.optional) vals.pop();
      return { text: `${name}(${vals.map((y) => y.v).join(', ')})`, missing: vals.filter((y) => !y.v && !y.f.optional).map((y) => human(y.f.name)) };
    };
    function paint() {
      const { text, missing } = formula(), focus = order().find((f) => f.inp.matches(':focus-within'));
      put(syn, name + '(', ...order().flatMap((f, i) => [i ? ', ' : '', h('span' + (f === focus ? '.on' : '') + (f.optional ? '.opt' : ''), human(f.name))]), ')');
      const v = missing.length ? null : run('=' + text);
      put(out, h('div.gline', h('span.muted', t('g_formula')), h('code', '=' + text)),
        h('div.gline', h('span.muted', t('g_result')), missing.length ? h('span.muted', t('g_missing', { a: missing.join(', ') })) : h('b' + (isErr(v) ? '.err' : ''), result(v) || '—')));
      if (ins) ins.disabled = !!missing.length;
    }
    // the example: shown with its result, and it can fill the fields
    const ex = EX[name], exBox = ex ? h('div.gex', h('span.flabel', t('g_example')), h('div.gline', h('code', ex[0])), h('div.gline', h('span.muted', '→'), h('b', ex[1] ? say(ex[1]) : result(run(ex[0])) || '—')),
      btn(t('g_try'), { size: 'sm', appearance: 'ghost', icon: 'wand-sparkles', onclick: () => {
        const vals = splitArgs(ex[0]);
        while (sig.group && order().length < vals.length) addGroup();
        order().forEach((f, i) => { f.inp.value = vals[i] ?? ''; });
        paint();
      } })) : null;
    ins = btn(t('insert'), { variant: 'primary', size: 'sm', icon: 'check', onclick: () => { const { text, missing } = formula(); if (!missing.length) o.insert?.(text, '=' + text); } });
    put(box, h('div.form.guide',
      h('div.gtop', btn(t('g_all'), { size: 'sm', appearance: 'ghost', icon: 'arrow-left', onclick: pickStep })),
      h('div.ghead', h('b', name), h('span', desc(name, ui))), syn,
      fields.length ? h('div.stack', ...fixedRows, groupBox, ...tailRows) : h('p.muted', t('g_no_args')),
      sig.group ? btn(t('g_more', { a: sig.group.tpl.map((g) => g.base.replace(/_/g, ' ')).join(', ') }), { size: 'sm', appearance: 'ghost', icon: 'plus', onclick: addGroup }) : null,
      out, h('div.gact', ins), exBox, h('p.muted.small', t('g_quotes'))));
    paint();
    setTimeout(() => fields[0]?.inp.focus?.(), 80);
  }
  if (o.name && FN[o.name]) fillStep(o.name); else pickStep();
}
