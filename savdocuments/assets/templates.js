/** Ready-made documents, in English and Italian. */
import { DEFAULTS, LOOKS } from './settings.js';
import { getLang } from './i18n.js';
import { newId } from './clean.js';

const L = (en, it) => (getLang() === 'it' ? it : en);
const foot = { l: '', c: '{page} / {pages}', r: '' };
const p = (x, c = '') => `<p${c ? ` class="${c}"` : ''}>${x || '<br>'}</p>`;
const right = (x) => `<p style="text-align:right">${x}</p>`;
const row = (tag, ...c) => `<tr>${c.map((x) => `<${tag}>${x || '<br>'}</${tag}>`).join('')}</tr>`;
const table = (head, ...rows) => `<table><tbody>${row('th', ...head)}${rows.map((r) => row('td', ...r)).join('')}</tbody></table>`;

export const TEMPLATES = {
  blank: { look: 'clean', make: () => [p('')] },
  letter: { look: 'book', set: { justify: false, mt: 30 }, make: () => [
    p(L('Your name<br>Street and number<br>Postcode, town', 'Nome e cognome<br>Via e numero<br>CAP, città')), p(''), right(L('To the kind attention of<br>Name of the recipient<br>Address', 'Alla cortese attenzione di<br>Nome del destinatario<br>Indirizzo')), p(''),
    p(L('<strong>Subject:</strong> what this letter is about', '<strong>Oggetto:</strong> di cosa tratta la lettera')), p(L('Dear Sir or Madam,', 'Gentili Signori,')), p(L('In the first paragraph say why you are writing.', 'Nel primo paragrafo scrivi il motivo della lettera.')), p(L('In the second one add the details that matter.', 'Nel secondo aggiungi i dettagli che contano.')), p(L('Yours faithfully,', 'Cordiali saluti,')), p(''), p(L('Your name', 'Nome e cognome'))] },
  report: { look: 'modern', set: { numbered: true, footer: foot, firstPage: false }, make: () => [
    p(L('Title of the report', 'Titolo della relazione'), 'title'), p(L('Who wrote it, and when', 'Chi l’ha scritta, e quando'), 'subtitle'), '<div class="toc"></div>', '<div class="pb"></div>',
    `<h1>${L('Summary', 'Sintesi')}</h1>`, p(L('The whole report in a few lines, for who has no time to read further.', 'Tutta la relazione in poche righe, per chi non ha tempo di leggere oltre.'), 'lead'), `<h1>${L('Context', 'Contesto')}</h1>`, p(L('Where we start from.', 'Da dove si parte.')),
    `<h1>${L('Results', 'Risultati')}</h1>`, `<h2>${L('In numbers', 'In numeri')}</h2>`, table([L('Item', 'Voce'), L('Last year', 'Anno scorso'), L('This year', 'Quest’anno')], [L('First item', 'Prima voce'), '', ''], [L('Second item', 'Seconda voce'), '', '']), `<div class="callout" data-k="info"><p>${L('A note box for what must not be missed.', 'Un riquadro per ciò che non deve sfuggire.')}</p></div>`, `<h1>${L('Next steps', 'Prossimi passi')}</h1>`, `<ol><li>${L('First step', 'Primo passo')}</li><li>${L('Second step', 'Secondo passo')}</li></ol>`] },
  minutes: { look: 'office', set: { footer: foot }, make: () => [
    p(L('Minutes of the meeting', 'Verbale della riunione'), 'title'), p(L('Place, date and time', 'Luogo, data e ora'), 'subtitle'), table([L('Present', 'Presenti'), L('Absent', 'Assenti')], ['', '']),
    `<h2>${L('Agenda', 'Ordine del giorno')}</h2>`, `<ol><li>${L('First item', 'Primo punto')}</li><li>${L('Second item', 'Secondo punto')}</li></ol>`, `<h2>${L('Discussion', 'Discussione')}</h2>`, p(''), `<h2>${L('Decisions', 'Decisioni')}</h2>`, `<ul class="check"><li>${L('Who does what, by when', 'Chi fa cosa, entro quando')}</li></ul>`] },
  essay: { look: 'thesis', set: { footer: foot, firstPage: false, ml: 30, mr: 25, numbered: true }, make: () => [
    p(''), p(''), `<p class="title" style="text-align:center">${L('Title of the essay', 'Titolo della tesina')}</p>`, `<p class="subtitle" style="text-align:center">${L('Name and surname', 'Nome e cognome')}</p>`, '<div class="pb"></div>', '<div class="toc"></div>', '<div class="pb"></div>',
    `<h1>${L('Introduction', 'Introduzione')}</h1>`, p(L('The question, and why it matters. Sources go in the notes.<sup class="fn" data-n="Author, Title, Publisher, Year, p. 1."></sup>', 'La domanda, e perché è importante. Le fonti vanno nelle note.<sup class="fn" data-n="Autore, Titolo, Editore, Anno, p. 1."></sup>')), `<h1>${L('First chapter', 'Primo capitolo')}</h1>`, p(''), `<h1>${L('Conclusions', 'Conclusioni')}</h1>`, p('')] },
  proposal: { look: 'modern', set: { footer: foot }, make: () => [
    p(L('Name of the project', 'Nome del progetto'), 'title'), p(L('Proposal for who will read it', 'Proposta per chi la leggerà'), 'subtitle'), p(L('One sentence that says what you want to do and why it is worth it.', 'Una frase che dice cosa vuoi fare e perché ne vale la pena.'), 'lead'),
    `<h2>${L('The problem', 'Il problema')}</h2>`, p(''), `<h2>${L('The idea', 'L’idea')}</h2>`, p(''), `<h2>${L('Timeline', 'Tempi')}</h2>`, table([L('Phase', 'Fase'), L('From', 'Da'), L('To', 'A')], ['1', '', ''], ['2', '', '']), `<h2>${L('Costs', 'Costi')}</h2>`, p('')] },
  invoice: { look: 'office', make: () => [
    p(L('Quote', 'Preventivo'), 'title'), p(L('No. 1, {date}', 'N. 1, {date}').replace('{date}', new Date().toLocaleDateString(getLang())), 'subtitle'), table([L('From', 'Da'), L('To', 'A')], [L('Name<br>Address', 'Nome<br>Indirizzo'), L('Name<br>Address', 'Nome<br>Indirizzo')]), p(''),
    `<table class="striped"><colgroup><col style="width:50%"><col style="width:15%"><col style="width:15%"><col style="width:20%"></colgroup><tbody>${row('th', L('Description', 'Descrizione'), L('Qty', 'Q.tà'), L('Price', 'Prezzo'), L('Total', 'Totale'))}${row('td', '', '', '', '')}${row('td', '', '', '', '')}<tr><td colspan="3" style="text-align:right"><strong>${L('Total', 'Totale')}</strong></td><td><br></td></tr></tbody></table>`, p(L('Valid for 30 days.', 'Valido 30 giorni.'), 'small')] },
  recipe: { look: 'book', set: { justify: false, size: 'A5', mt: 18, mr: 18, mb: 18, ml: 18 }, make: () => [
    p(L('Name of the dish', 'Nome del piatto'), 'title'), p(L('Serves 4, 30 minutes', 'Per 4 persone, 30 minuti'), 'subtitle'), `<h2>${L('Ingredients', 'Ingredienti')}</h2>`, `<ul class="check"><li>${L('First ingredient', 'Primo ingrediente')}</li><li>${L('Second ingredient', 'Secondo ingrediente')}</li></ul>`, `<h2>${L('Method', 'Preparazione')}</h2>`, `<ol><li>${L('First step.', 'Primo passaggio.')}</li><li>${L('Second step.', 'Secondo passaggio.')}</li></ol>`] },
};

export function fromTemplate(id, defaults = {}) {
  const x = TEMPLATES[id];
  const settings = { ...DEFAULTS, ...defaults, ...(id === 'blank' ? {} : LOOKS[x.look]), ...(x.set || {}), lang: defaults.lang || getLang() };
  return { settings, blocks: x.make().map((h) => ({ id: newId(), h })) };
}
