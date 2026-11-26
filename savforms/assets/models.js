/**
 * The kinds of questions (their icon, their name and how a new one starts) and the models a new form can start from.
 * The server cleans every question again (lib/forms.php, clean_questions()): what is here is only a good start.
 */
import { t, getLang } from './i18n.js';

/** [type, icon, group]: the groups are the sections of the menu "Add". */
export const KINDS = [
  ['short', 'text-cursor-input', 'text'], ['long', 'align-left', 'text'], ['email', 'at-sign', 'text'], ['number', 'hash', 'text'],
  ['single', 'circle-dot', 'choice'], ['multi', 'square-check-big', 'choice'], ['dropdown', 'chevron-down', 'choice'], ['ranking', 'list-ordered', 'choice'],
  ['scale', 'gauge', 'scale'], ['rating', 'star', 'scale'], ['grid', 'grid-3x3', 'scale'], ['checkgrid', 'table', 'scale'],
  ['date', 'calendar', 'time'], ['time', 'clock', 'time'],
  ['text', 'heading', 'layout'], ['image', 'image', 'layout'], ['section', 'rows-3', 'layout'],
];
export const STATIC = ['text', 'image', 'section'];
export const CHOICE = ['single', 'multi', 'dropdown', 'ranking'];
export const kindIcon = (k) => KINDS.find((x) => x[0] === k)?.[1] || 'circle-help';
export const kindName = (k) => t('k_' + k);
export const OTHER = '~o';

export const uid = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
const opts = (...labels) => labels.map((label) => ({ id: uid(), label }));

/** A new question of a kind, already sensible (two choices, a scale from 1 to 5…). */
export function newItem(k, o = {}) {
  const x = { id: uid(), t: k, title: '', descr: '', ...(STATIC.includes(k) ? {} : { req: false }) };
  const n = (i) => t('option_n', { n: i });
  if (CHOICE.includes(k)) x.opts = opts(n(1), n(2));
  if (k === 'single' || k === 'multi') x.other = false;
  if (k === 'scale') Object.assign(x, { min: 1, max: 5, minLabel: '', maxLabel: '' });
  if (k === 'rating') Object.assign(x, { max: 5, icon: 'star' });
  if (k === 'grid' || k === 'checkgrid') Object.assign(x, { rows: opts(t('row_n', { n: 1 }), t('row_n', { n: 2 })), cols: opts(t('col_n', { n: 1 }), t('col_n', { n: 2 }), t('col_n', { n: 3 })) });
  if (k === 'number') Object.assign(x, { min: null, max: null, int: false });
  if (k === 'image') Object.assign(x, { src: '', alt: '' });
  return Object.assign(x, o);
}

/** The models of the page "New form". Each one: [key, icon, colour, () => {title, descr, items, settings}]. */
export function models() {
  const it = getLang() === 'it', L = (en, i) => (it ? i : en);
  const q = (k, title, o = {}) => newItem(k, { title, ...o });
  return [
    ['blank', 'plus', '#86329e', () => ({ title: '', descr: '', items: [q('single', L('Untitled question', 'Domanda senza titolo'))] })],
    ['contact', 'mail', '#1f56d1', () => ({
      title: L('Contact us', 'Contattaci'), descr: L('Write to us: we answer within two working days.', 'Scrivici: rispondiamo entro due giorni lavorativi.'),
      items: [q('short', L('Name', 'Nome'), { req: true }), q('email', 'Email', { req: true }), q('dropdown', L('About', 'Argomento'), { opts: opts(L('A question', 'Una domanda'), L('A problem', 'Un problema'), L('An idea', 'Un’idea'), L('Something else', 'Altro')) }), q('long', L('Message', 'Messaggio'), { req: true })],
      settings: { notify: true },
    })],
    ['event', 'calendar-check', '#0f8a63', () => ({
      title: L('Event registration', 'Iscrizione all’evento'), descr: L('Save your place: we will write to you with the details.', 'Prenota il tuo posto: ti scriveremo con i dettagli.'),
      items: [q('short', L('Name and surname', 'Nome e cognome'), { req: true }), q('single', L('Will you come?', 'Parteciperai?'), { req: true, opts: opts(L('Yes', 'Sì'), L('No', 'No'), L('Maybe', 'Forse')) }),
        q('number', L('How many people, you included?', 'Quante persone, te compreso?'), { min: 1, max: 10, int: true }), q('multi', L('Which days?', 'Quali giorni?'), { opts: opts(L('Friday', 'Venerdì'), L('Saturday', 'Sabato'), L('Sunday', 'Domenica')) }),
        q('single', L('Food', 'Cibo'), { opts: opts(L('Anything', 'Di tutto'), L('Vegetarian', 'Vegetariano'), L('Vegan', 'Vegano')), other: true }), q('long', L('Anything else we should know?', 'Altro che dovremmo sapere?'))],
      settings: { collectEmail: 'ask', allowEdit: true },
    })],
    ['feedback', 'messages-square', '#c27a06', () => ({
      title: L('How did it go?', 'Com’è andata?'), descr: L('Two minutes to help us do better. Answers are anonymous.', 'Due minuti per aiutarci a fare meglio. Le risposte sono anonime.'),
      items: [q('rating', L('Overall, how satisfied are you?', 'Nel complesso, quanto sei soddisfatto?'), { req: true }),
        q('scale', L('How likely are you to recommend us to a friend?', 'Quanto è probabile che ci consigli a un amico?'), { min: 0, max: 10, minLabel: L('Not at all', 'Per niente'), maxLabel: L('Very likely', 'Molto probabile') }),
        q('grid', L('How was…', 'Com’è stato…'), { rows: opts(L('the organisation', 'l’organizzazione'), L('the place', 'il luogo'), L('the content', 'il contenuto')), cols: opts(L('Poor', 'Scarso'), L('Fair', 'Discreto'), L('Good', 'Buono'), L('Excellent', 'Ottimo')) }),
        q('long', L('What should we change?', 'Cosa dovremmo cambiare?'))],
      settings: { showSummary: true },
    })],
    ['poll', 'vote', '#c2307a', () => ({
      title: L('Quick poll', 'Sondaggio veloce'), descr: '',
      items: [q('single', L('Which do you prefer?', 'Quale preferisci?'), { req: true, opts: opts(L('Option A', 'Opzione A'), L('Option B', 'Opzione B'), L('Option C', 'Opzione C')) }), q('ranking', L('Put them in order, the best first', 'Mettile in ordine, la migliore prima'), { opts: opts(L('Price', 'Prezzo'), L('Quality', 'Qualità'), L('Speed', 'Velocità')) })],
      settings: { showSummary: true, onePerPerson: false },
    })],
    ['quiz', 'trophy', '#e0532f', () => {
      const a = opts(L('Rome', 'Roma'), L('Milan', 'Milano'), L('Turin', 'Torino')), b = opts('2', '3', '4'), c = opts(L('Mercury', 'Mercurio'), L('Venus', 'Venere'), L('Earth', 'Terra'), L('Mars', 'Marte'));
      return {
        title: L('Quiz', 'Quiz'), descr: L('Three questions, one point each. Good luck!', 'Tre domande, un punto ciascuna. Buona fortuna!'),
        items: [q('single', L('What is the capital of Italy?', 'Qual è la capitale d’Italia?'), { req: true, opts: a, correct: [a[0].id], points: 1 }),
          q('single', L('How much is 1 + 1?', 'Quanto fa 1 + 1?'), { req: true, opts: b, correct: [b[0].id], points: 1 }),
          q('multi', L('Which planets are closer to the Sun than the Earth?', 'Quali pianeti sono più vicini al Sole della Terra?'), { opts: c, correct: [c[0].id, c[1].id], points: 1 })],
        settings: { quiz: true, showScore: true, showAnswers: true, collectEmail: 'ask' },
      };
    }],
    ['order', 'scroll-text', '#0b7a87', () => ({
      title: L('Order form', 'Modulo d’ordine'), descr: L('Choose, tell us where, and we will confirm by email.', 'Scegli, dicci dove, e ti confermeremo via email.'),
      items: [q('grid', L('What and how many', 'Cosa e quanti'), { rows: opts(L('T-shirt', 'Maglietta'), L('Cup', 'Tazza'), L('Bag', 'Borsa')), cols: opts('0', '1', '2', '3+') }),
        q('single', L('Size of the T-shirt', 'Taglia della maglietta'), { opts: opts('S', 'M', 'L', 'XL') }), q('short', L('Name', 'Nome'), { req: true }), q('long', L('Address', 'Indirizzo'), { req: true }), q('date', L('Delivery from', 'Consegna dal'))],
      settings: { collectEmail: 'ask', notify: true },
    })],
    ['job', 'briefcase', '#4a5875', () => ({
      title: L('Job application', 'Candidatura'), descr: '',
      items: [q('short', L('Name and surname', 'Nome e cognome'), { req: true }), q('email', 'Email', { req: true }), q('short', L('Phone', 'Telefono')),
        q('dropdown', L('Position', 'Posizione'), { req: true, opts: opts(L('Designer', 'Designer'), L('Developer', 'Sviluppatore'), L('Sales', 'Vendite')) }),
        q('section', L('About you', 'Su di te')), q('number', L('Years of experience', 'Anni di esperienza'), { min: 0, max: 60, int: true }), q('long', L('Why us?', 'Perché noi?')), q('date', L('Available from', 'Disponibile dal'))],
      settings: { notify: true },
    })],
  ];
}
