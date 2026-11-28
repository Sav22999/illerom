/** Ready-made books, in English and Italian: chapters already in place, a look, the details of the cover. Texts are examples. */
import { DEFAULTS, LOOKS } from './settings.js';
import { BOOK, BOOK_PAGE } from './book.js';
import { getLang } from './i18n.js';
import { newId } from './clean.js';
import { cleanObject } from './objects.js';

const L = (en, it) => (getLang() === 'it' ? it : en);
const foot = { l: '', c: '{page} / {pages}', r: '' };
const p = (x, c = '', st = '') => `<p${c ? ` class="${c}"` : ''}${st ? ` style="${st}"` : ''}>${x || '<br>'}</p>`;
const T = (x) => p(x, 'title'), S = (x) => p(x, 'subtitle'), lead = (x) => p(x, 'lead'), small = (x) => p(x, 'small');
const h1 = (x) => `<h1>${x}</h1>`, h2 = (x) => `<h2>${x}</h2>`, h3 = (x) => `<h3>${x}</h3>`;
const mid = (x, c = '') => p(x, c, 'text-align:center'), right = (x) => p(x, '', 'text-align:right');
const ul = (...x) => `<ul>${x.map((i) => `<li>${i || '<br>'}</li>`).join('')}</ul>`, ol = (...x) => `<ol>${x.map((i) => `<li>${i || '<br>'}</li>`).join('')}</ol>`, check = (...x) => `<ul class="check">${x.map((i) => `<li>${i || '<br>'}</li>`).join('')}</ul>`;
const row = (tag, c) => `<tr>${c.map((x) => `<${tag}>${x || '<br>'}</${tag}>`).join('')}</tr>`;
const table = (head, rows, { cls = '', cols = null } = {}) => `<table${cls ? ` class="${cls}"` : ''}>${cols ? `<colgroup>${cols.map((c) => `<col style="width:${c}%">`).join('')}</colgroup>` : ''}<tbody>${head ? row('th', head) : ''}${rows.map((r) => row('td', r)).join('')}</tbody></table>`;
const blank = (n, m) => Array.from({ length: n }, () => Array(m).fill(''));
const columns = (...c) => table(null, [c], { cls: 'bare' });
const box = (x, k = 'info') => `<div class="callout" data-k="${k}"><p>${x}</p></div>`;
const toc = '<div class="toc"></div>', pb = '<div class="pb"></div>', hr = (k = '') => `<hr${k ? ` class="${k}"` : ''}>`, quote = (x) => `<blockquote>${x}</blockquote>`;
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const obj = (o, w = 100, cap = '', a = 'c') => `<figure data-a="${a}" data-w="${w}" data-o="${attr(JSON.stringify(cleanObject(o)))}"><figcaption>${cap || '<br>'}</figcaption></figure>`;
const chart = (t, l, s, o = {}) => obj({ k: 'chart', t, l, s: s.map(([n, v]) => ({ n, v })), r: o.r || 0.45, x: o.x || '', v: o.v || 0, g: o.g }, o.w || 100, o.cap || '');
const flow = (t, i, r, w = 100) => obj({ k: 'flow', t, i, r }, w);
const line = (w = 60, o = {}) => obj({ k: 'shape', s: 'line', w: 2, r: 0.06, ...o }, w);
const icon = (n, w = 12, c = '') => obj({ k: 'icon', n, c }, w);
const sign = (x, w = 38, a = 'r') => obj({ k: 'sign', x }, w, '', a);
const eq = (m) => `<p class="eq"><span class="math" data-m="${attr(m)}"></span></p>`;
const fn = (x) => `<sup class="fn" data-n="${attr(x)}"></sup>`;
const today = () => new Date().toLocaleDateString(getLang(), { day: 'numeric', month: 'long', year: 'numeric' });
const months = () => L('Jan,Feb,Mar,Apr,May,Jun', 'Gen,Feb,Mar,Apr,Mag,Giu').split(',');
const weekdays = () => L('Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 'Lunedì,Martedì,Mercoledì,Giovedì,Venerdì,Sabato,Domenica').split(',');

export const TPL_CATS = ['fiction', 'nonfiction', 'personal'];
export const CAT_NAMES = { fiction: ['Stories and poems', 'Narrativa e poesia'], nonfiction: ['Guides and essays', 'Guide e saggi'], personal: ['Personal and family', 'Personali e di famiglia'] };
const ch = (title, ...x) => [pb, h1(title), ...x];
const lorem = () => L('Write here. A chapter can be as long as it needs: the e-reader turns the pages by itself.', 'Scrivi qui. Un capitolo può essere lungo quanto serve: le pagine le gira l’e-reader da solo.');

export const TEMPLATES = {
  blank: { cat: 'fiction', n: ['Blank book', 'Libro vuoto'], look: 'book', book: { chap: '' }, make: () => [h1(L('Chapter 1', 'Capitolo 1')), p('')] },
  novel: { cat: 'fiction', n: ['Novel', 'Romanzo'], look: 'book', book: { chap: 'w', indent: true, cv: 'classic', cc: '#7a2236' }, make: () => [
    h1(L('The letter', 'La lettera')), p(L('It was raining the morning the letter arrived, the kind of rain that does not fall so much as hang in the air.', 'Pioveva la mattina in cui arrivò la lettera, quella pioggia che più che cadere resta sospesa nell’aria.'), 'drop'), p(L('Nobody in the house had written to anyone in years.', 'In casa nessuno scriveva a nessuno da anni.')), p(lorem()), p(L('* * *', '* * *'), '', 'text-align:center'), p(''),
    ...ch(L('The journey', 'Il viaggio'), p(L('The train left at dawn.', 'Il treno partì all’alba.')), p('')),
    ...ch(L('The house by the sea', 'La casa sul mare'), p(''))] },
  stories: { cat: 'fiction', n: ['Short stories', 'Racconti'], look: 'book', book: { cv: 'modern', cc: '#1d3557', indent: true }, make: () => [
    h1(L('First story', 'Primo racconto')), p(L('A short story says one thing, and says it well.', 'Un racconto dice una cosa sola, e la dice bene.'), 'drop'), p(''),
    ...ch(L('Second story', 'Secondo racconto'), p('')), ...ch(L('Third story', 'Terzo racconto'), p(''))] },
  poetry: { cat: 'fiction', n: ['Poems', 'Poesie'], look: 'cream', set: { justify: false }, book: { cv: 'minimal', cc: '#5b3a21' }, make: () => [
    h1(L('Morning', 'Mattina')), mid(L('<em>The light comes in<br>before the words do,<br>and stays.</em>', '<em>La luce entra<br>prima delle parole,<br>e resta.</em>')), p(''),
    ...ch(L('Evening', 'Sera'), mid(L('<em>A line,<br>a breath,<br>another line.</em>', '<em>Un verso,<br>un respiro,<br>un altro verso.</em>')), p('')),
    ...ch(L('Night', 'Notte'), mid(''))] },
  kids: { cat: 'fiction', n: ['Children’s book', 'Libro per bambini'], look: 'sunset', set: { fontSize: 15, line: 1.6, justify: false }, book: { cv: 'bold', cc: '#ea7317' }, make: () => [
    h1(L('The little fox', 'La piccola volpe')), icon('sun', 34, '#ea7317'), mid(L('Once upon a time there was a little fox who wanted to see the sea.', 'C’era una volta una piccola volpe che voleva vedere il mare.'), 'lead'),
    ...ch(L('The big hill', 'La grande collina'), icon('mountain', 34, '#2f5d34'), mid(L('First, she had to climb the big hill.', 'Prima doveva salire sulla grande collina.'), 'lead')),
    ...ch(L('The sea!', 'Il mare!'), icon('waves', 34, '#0891b2'), mid(L('And there it was, blue and endless.', 'Ed eccolo, blu e senza fine.'), 'lead'))] },
  guide: { cat: 'nonfiction', n: ['Practical guide', 'Guida pratica'], look: 'ocean', book: { chap: 'n', cv: 'band', cc: '#0b5394' }, make: () => [
    h1(L('Before you start', 'Prima di iniziare')), lead(L('What this guide is for, and who it is for.', 'A cosa serve questa guida, e a chi.')), box(L('In each chapter, the boxes like this one sum up what matters.', 'In ogni capitolo, i riquadri come questo riassumono quello che conta.'), 'tip'), check(L('What you need', 'Cosa serve'), ''),
    ...ch(L('The first steps', 'I primi passi'), ol(L('First step', 'Primo passo'), L('Second step', 'Secondo passo'), L('Third step', 'Terzo passo')), box(L('A common mistake, and how to avoid it.', 'Un errore comune, e come evitarlo.'), 'warn')),
    ...ch(L('Going further', 'Andare oltre'), h2(L('Tips', 'Consigli')), ul('', ''))] },
  cookbook: { cat: 'nonfiction', n: ['Cookbook', 'Ricettario'], look: 'cream', set: { justify: false }, book: { cv: 'photo', cc: '#a9744f' }, make: () => [
    h1(L('Starters', 'Antipasti')), h2(L('Name of the dish', 'Nome del piatto')), small(L('Serves 4 · 30 minutes', 'Per 4 persone · 30 minuti')), h3(L('Ingredients', 'Ingredienti')), ul(L('First ingredient', 'Primo ingrediente'), L('Second ingredient', 'Secondo ingrediente')), h3(L('Method', 'Preparazione')), ol(L('First do this.', 'Prima fai questo.'), L('Then this.', 'Poi questo.')),
    ...ch(L('Main courses', 'Piatti principali'), h2(L('Name of the dish', 'Nome del piatto')), p('')), ...ch(L('Desserts', 'Dolci'), h2(L('Name of the dish', 'Nome del piatto')), p(''))] },
  course: { cat: 'nonfiction', n: ['Course book', 'Libro di corso'], look: 'office', set: { justify: false }, book: { chap: 'n', cv: 'modern', cc: '#1d4e89' }, make: () => [
    h1(L('Introduction', 'Introduzione')), lead(L('What you will learn in this course.', 'Cosa imparerai in questo corso.')), ul(L('First goal', 'Primo obiettivo'), L('Second goal', 'Secondo obiettivo')),
    ...ch(L('The basics', 'Le basi'), p(lorem()), eq('E = mc^2'), h2(L('Exercises', 'Esercizi')), ol('', '')),
    ...ch(L('Summary', 'Riepilogo'), table([L('Idea', 'Concetto'), L('In short', 'In breve')], blank(3, 2), { cols: [35, 65] }))] },
  essay: { cat: 'nonfiction', n: ['Essay', 'Saggio'], look: 'thesis', book: { chap: 'r', cv: 'minimal', cc: '#1d4e89' }, make: () => [
    h1(L('Introduction', 'Introduzione')), p(L('The question this essay asks, and why it matters', 'La domanda che pone questo saggio, e perché conta') + fn(L('A note with the source.', 'Una nota con la fonte.')) + '.'), p(''),
    ...ch(L('The argument', 'L’argomento'), p(''), quote(L('A quotation that supports the argument.', 'Una citazione che sostiene l’argomento.'))), ...ch(L('Conclusions', 'Conclusioni'), p(''))] },
  manual: { cat: 'nonfiction', n: ['Technical manual', 'Manuale tecnico'], look: 'clean', set: { justify: false }, book: { chap: 'n', cv: 'band', cc: '#2b2d42' }, make: () => [
    h1(L('Getting started', 'Per iniziare')), p(L('Install it with one command:', 'Si installa con un comando:')), '<pre>npm install example</pre>', box(L('Requirements: version 2 or newer.', 'Requisiti: versione 2 o successiva.')),
    ...ch(L('Configuration', 'Configurazione'), table([L('Option', 'Opzione'), L('What it does', 'Cosa fa'), L('Default', 'Predefinito')], blank(3, 3), { cls: 'striped', cols: [25, 55, 20] })),
    ...ch(L('Questions and answers', 'Domande e risposte'), h3(L('A frequent question?', 'Una domanda frequente?')), p(''))] },
  memoir: { cat: 'personal', n: ['Memoir', 'Memorie'], look: 'book', book: { cv: 'photo', cc: '#7b5434', indent: true, dedication: L('To my family.', 'Alla mia famiglia.') }, make: () => [
    h1(L('Where I was born', 'Dove sono nato')), p(L('Some memories are places before they are stories.', 'Certi ricordi sono luoghi prima di essere storie.'), 'drop'), p(''),
    ...ch(L('The years at school', 'Gli anni della scuola'), p('')), ...ch(L('What I learned', 'Quello che ho imparato'), p(''))] },
  travel: { cat: 'personal', n: ['Travel journal', 'Diario di viaggio'], look: 'forest', set: { justify: false }, book: { cv: 'band', cc: '#3a5a40' }, make: () => [
    h1(L('Departure', 'Partenza')), small(today()), p(L('The bags are ready, the plan is not.', 'Le valigie sono pronte, il programma no.')),
    ...ch(L('First stop', 'Prima tappa'), table([L('Where', 'Dove'), L('What we saw', 'Cosa abbiamo visto')], blank(2, 2), { cols: [30, 70] }), p('')),
    ...ch(L('Back home', 'Ritorno'), h3(L('Three things to remember', 'Tre cose da ricordare')), ol('', '', ''))] },
  family: { cat: 'personal', n: ['Family recipes', 'Ricette di famiglia'], look: 'cream', set: { justify: false }, book: { cv: 'classic', cc: '#8a4b2f', dedication: L('For who will cook them next.', 'Per chi le cucinerà dopo di noi.') }, make: () => [
    h1(L('Grandma’s recipes', 'Le ricette della nonna')), quote(L('“A pinch of salt, and patience.”', '«Un pizzico di sale, e pazienza.»')), h2(L('Name of the recipe', 'Nome della ricetta')), ul('', ''), ol('', ''),
    ...ch(L('Holidays', 'Le feste'), h2(L('Name of the recipe', 'Nome della ricetta')), p(''))] },
  play: { cat: 'fiction', n: ['Play', 'Testo teatrale'], look: 'type', set: { justify: false }, book: { cv: 'minimal', cc: '#3b2f2f' }, make: () => [
    h1(L('Characters', 'Personaggi')), table(null, [[L('<strong>ANNA</strong>', '<strong>ANNA</strong>'), L('a teacher, forty years old', 'un’insegnante, quarant’anni')], [L('<strong>MARCO</strong>', '<strong>MARCO</strong>'), L('her brother', 'suo fratello')]], { cls: 'bare', cols: [30, 70] }),
    ...ch(L('Act one', 'Atto primo'), h2(L('Scene 1', 'Scena 1')), p(L('<em>A kitchen, at night. The light of the fridge is the only one on.</em>', '<em>Una cucina, di notte. L’unica luce accesa è quella del frigorifero.</em>')),
      p(L('<strong>ANNA</strong> — You could have called.', '<strong>ANNA</strong> — Potevi chiamare.')), p(L('<strong>MARCO</strong> — <em>(sitting down)</em> I did. Twice.', '<strong>MARCO</strong> — <em>(sedendosi)</em> L’ho fatto. Due volte.')), p('')),
    ...ch(L('Act two', 'Atto secondo'), h2(L('Scene 1', 'Scena 1')), p(''))] },
  workbook: { cat: 'nonfiction', n: ['Workbook', 'Quaderno di esercizi'], look: 'office', set: { justify: false }, book: { chap: 'n', cv: 'bold', cc: '#0f6e56' }, make: () => [
    h1(L('How to use this workbook', 'Come usare questo quaderno')), lead(L('A short explanation, then exercises to do with a pencil.', 'Una breve spiegazione, poi esercizi da fare con la matita.')), check(L('Read the explanation', 'Leggi la spiegazione'), L('Do the exercises', 'Fai gli esercizi'), L('Check the answers at the end', 'Controlla le soluzioni alla fine')),
    ...ch(L('Unit 1', 'Unità 1'), box(L('The rule of this unit, in one sentence.', 'La regola di questa unità, in una frase.')), h2(L('Exercises', 'Esercizi')), ol(L('Complete the sentence: ______', 'Completa la frase: ______'), L('True or false? ______', 'Vero o falso? ______'), ''), table([L('Question', 'Domanda'), L('Your answer', 'La tua risposta')], blank(3, 2), { cols: [50, 50] })),
    ...ch(L('Answers', 'Soluzioni'), h3(L('Unit 1', 'Unità 1')), ol('', '', ''))] },
  biography: { cat: 'nonfiction', n: ['Biography', 'Biografia'], look: 'book', book: { chap: 'w', cv: 'photo', cc: '#2f3e46', indent: true }, make: () => [
    h1(L('A beginning', 'Un inizio')), p(L('Every life has a date, a place and a family; the story starts a little before them.', 'Ogni vita ha una data, un luogo e una famiglia; la storia comincia un po’ prima.'), 'drop'), p(''),
    ...ch(L('The years that changed everything', 'Gli anni che cambiarono tutto'), p(''), quote(L('“A sentence they said, and that people still remember.”', '«Una frase che disse, e che ancora si ricorda.»'))),
    ...ch(L('Timeline', 'Cronologia'), table([L('Year', 'Anno'), L('What happened', 'Cosa accadde')], [['1950', ''], ['1968', ''], ['1990', '']], { cls: 'striped', cols: [20, 80] }))] },
  gratitude: { cat: 'personal', n: ['Gratitude journal', 'Diario della gratitudine'], look: 'sunset', set: { justify: false }, book: { cv: 'minimal', cc: '#c2410c' }, make: () => [
    h1(L('Why this journal', 'Perché questo diario')), mid(L('<em>Three small good things a day,<br>written before they are forgotten.</em>', '<em>Tre piccole cose belle al giorno,<br>scritte prima di dimenticarle.</em>')),
    ...ch(L('Week 1', 'Settimana 1'), ...weekdays().slice(0, 3).flatMap((d) => [h3(d), ol('', '', '')])),
    ...ch(L('Week 2', 'Settimana 2'), h3(weekdays()[0]), ol('', '', ''))] },
  baby: { cat: 'personal', n: ['Baby’s first year', 'Il primo anno'], look: 'ocean', set: { justify: false }, book: { cv: 'bold', cc: '#0891b2', dedication: L('For you, when you are older.', 'Per te, quando sarai grande.') }, make: () => [
    h1(L('Welcome', 'Benvenuto')), icon('baby', 30, '#0891b2'), table(null, [[L('Name', 'Nome'), ''], [L('Born on', 'Nato il'), ''], [L('Weight and length', 'Peso e lunghezza'), ''], [L('Where', 'Dove'), '']], { cls: 'bare', cols: [40, 60] }),
    ...ch(L('The first months', 'I primi mesi'), table([L('Month', 'Mese'), L('What happened', 'Cosa è successo')], months().map((m) => [m, '']), { cols: [25, 75] })),
    ...ch(L('Firsts', 'Le prime volte'), check(L('First smile', 'Primo sorriso'), L('First word', 'Prima parola'), L('First steps', 'Primi passi'), L('First tooth', 'Primo dentino')))] },
};
export const tplName = (id) => TEMPLATES[id].n[getLang() === 'it' ? 1 : 0];
export const catName = (c) => CAT_NAMES[c][getLang() === 'it' ? 1 : 0];

export function fromTemplate(id, defaults = {}, over = {}) {
  const x = TEMPLATES[id], set = typeof x.set === 'function' ? x.set() : x.set || {};
  // a page of a printed book, the look of the template, then what the person chose
  const settings = { ...DEFAULTS, ...BOOK_PAGE, ...defaults, ...(id === 'blank' && defaults.font ? {} : LOOKS[x.look]), ...set, lang: defaults.lang || getLang(), ...over };
  settings.book = { ...BOOK, ...(x.book || {}), cc: x.book?.cc || BOOK.cc };
  return { settings, blocks: x.make().map((h) => ({ id: newId(), h })) };
}
