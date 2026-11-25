/** Ready presentations: a theme and a few slides built with the layouts. Texts are [English, Italian]. */
import {makeSlide} from './layouts.js';
import {context, FORMATS} from './themes.js';
import {lang} from './i18n.js';

export const TEMPLATES = [
    {id: 'blank', theme: 'paper', name: ['Blank', 'Vuota'], slides: [['cover', {}]]},
    {
        id: 'talk', theme: 'ink', cat: 'talk', name: ['Clean talk', 'Intervento essenziale'], slides: [
            ['cover', {
                title: ['One idea per slide', 'Un’idea per slide'],
                subtitle: ['Your name, the place, the date', 'Il tuo nome, il luogo, la data']
            }],
            ['statement', {title: ['Say it in one sentence.', 'Dillo in una frase.']}], ['number', {
                big: ['3', '3'],
                body: ['things people will remember tomorrow. Choose them well.', 'cose che le persone ricorderanno domani. Sceglile bene.']
            }],
            ['title-body', {
                title: ['Why it matters', 'Perché conta'],
                body: ['- Few words\n- Big type\n- Room to breathe', '- Poche parole\n- Caratteri grandi\n- Spazio per respirare']
            }], ['closing', {title: ['Questions?', 'Domande?'], subtitle: ['you@example.com', 'tu@example.com']}]]
    },
    {
        id: 'essay', theme: 'cotton', cat: 'talk', name: ['Essay', 'Saggio'], slides: [
            ['cover', {
                title: ['A quiet title', 'Un titolo sottovoce'],
                subtitle: ['Notes for a lecture', 'Appunti per una lezione']
            }], ['section', {label: ['Part one', 'Parte prima'], title: ['Where we start from', 'Da dove partiamo']}],
            ['two-cols', {
                title: ['Two points of view', 'Due punti di vista'],
                left: ['Write the first argument here: short paragraphs read better than long lists.', 'Scrivi qui il primo argomento: i paragrafi brevi si leggono meglio degli elenchi lunghi.'],
                right: ['And the second one here, so that they can be compared at a glance.', 'E qui il secondo, così si confrontano a colpo d’occhio.']
            }],
            ['quote', {
                quote: ['A sentence worth a whole slide.', 'Una frase che vale una slide intera.'],
                author: ['Who said it', 'Chi l’ha detta']
            }], ['image-right', {
                title: ['A picture', 'Un’immagine'],
                body: ['What should people notice in it?', 'Che cosa bisogna notare?']
            }], ['closing', {title: ['Thank you', 'Grazie'], subtitle: [' ', ' ']}]]
    },
    {
        id: 'swiss', theme: 'swiss', cat: 'talk', name: ['Swiss poster', 'Poster svizzero'], slides: [
            ['cover', {
                title: ['Grid, type, red.', 'Griglia, testo, rosso.'],
                subtitle: ['A presentation with no frills', 'Una presentazione senza fronzoli']
            }], ['section', {
                label: ['01', '01'],
                title: ['The problem', 'Il problema']
            }], ['three-cards', {
                title: ['In three points', 'In tre punti'],
                c1t: ['First', 'Primo'],
                c1: ['A short text.', 'Un testo breve.'],
                c2t: ['Second', 'Secondo'],
                c2: ['A short text.', 'Un testo breve.'],
                c3t: ['Third', 'Terzo'],
                c3: ['A short text.', 'Un testo breve.']
            }], ['number', {
                big: ['42%', '42%'],
                body: ['One figure says more than a table.', 'Una cifra dice più di una tabella.']
            }], ['closing', {title: ['End.', 'Fine.'], subtitle: ['you@example.com', 'tu@example.com']}]]
    },
    {
        id: 'business', theme: 'office', cat: 'business', name: ['Business report', 'Report aziendale'], slides: [
            ['cover', {
                title: ['Quarterly report', 'Report trimestrale'],
                subtitle: ['Company · Quarter · Year', 'Azienda · Trimestre · Anno']
            }], ['agenda', {
                title: ['Agenda', 'Agenda'],
                item1: ['Results', 'Risultati'],
                item2: ['Market', 'Mercato'],
                item3: ['Risks', 'Rischi'],
                item4: ['Next steps', 'Prossimi passi']
            }],
            ['numbers', {
                title: ['The quarter in numbers', 'Il trimestre in numeri'],
                n1: ['+00%', '+00%'],
                n1t: ['Revenue, against last year', 'Ricavi, rispetto all’anno scorso'],
                n2: ['000', '000'],
                n2t: ['New customers', 'Nuovi clienti'],
                n3: ['0.0', '0,0'],
                n3t: ['Satisfaction out of 5', 'Soddisfazione su 5']
            }],
            ['compare', {
                title: ['Planned and done', 'Previsto e fatto'],
                at: ['Planned', 'Previsto'],
                a: ['- First goal\n- Second goal\n- Third goal', '- Primo obiettivo\n- Secondo obiettivo\n- Terzo obiettivo'],
                bt: ['Done', 'Fatto'],
                b: ['- What was reached\n- What was late\n- Why', '- Cosa è stato raggiunto\n- Cosa è in ritardo\n- Perché']
            }], ['timeline', {
                title: ['Next steps', 'Prossimi passi'],
                t1t: ['January', 'Gennaio'],
                t1: ['Kick-off', 'Avvio'],
                t2t: ['March', 'Marzo'],
                t2: ['First release', 'Prima versione'],
                t3t: ['June', 'Giugno'],
                t3: ['Review', 'Verifica'],
                t4t: ['September', 'Settembre'],
                t4: ['Launch', 'Lancio']
            }], ['closing', {title: ['Thank you', 'Grazie'], subtitle: ['you@example.com', 'tu@example.com']}]]
    },
    {
        id: 'pitch', theme: 'aurora', cat: 'business', name: ['Pitch', 'Pitch'], slides: [
            ['cover', {
                title: ['Your startup', 'La tua startup'],
                subtitle: ['What you do, in ten words', 'Cosa fai, in dieci parole']
            }], ['statement', {title: ['The problem, as your customers would tell it.', 'Il problema, come lo racconterebbero i tuoi clienti.']}], ['image-right', {
                title: ['The solution', 'La soluzione'],
                body: ['- What it does\n- Why it is different\n- Why now', '- Cosa fa\n- Perché è diversa\n- Perché adesso']
            }], ['numbers', {
                title: ['The market', 'Il mercato'],
                n1: ['00M', '00M'],
                n1t: ['People with this problem', 'Persone con questo problema'],
                n2: ['0B', '0 mld'],
                n2t: ['Market size', 'Valore del mercato'],
                n3: ['00%', '00%'],
                n3t: ['Growth every year', 'Crescita annua']
            }], ['three-cards', {
                title: ['How we earn', 'Come guadagniamo'],
                c1t: ['Free', 'Gratis'],
                c1: ['What is included', 'Cosa è incluso'],
                c2t: ['Plus', 'Plus'],
                c2: ['What is included', 'Cosa è incluso'],
                c3t: ['Team', 'Team'],
                c3: ['What is included', 'Cosa è incluso']
            }], ['closing', {title: ['Let’s talk', 'Parliamone'], subtitle: ['you@example.com', 'tu@example.com']}]]
    },
    {
        id: 'lesson', theme: 'chalk', cat: 'school', name: ['Lesson', 'Lezione'], slides: [
            ['cover', {
                title: ['Today’s lesson', 'La lezione di oggi'],
                subtitle: ['Subject · Class', 'Materia · Classe']
            }], ['agenda', {
                title: ['What we will learn', 'Cosa impareremo'],
                item1: ['What we already know', 'Cosa sappiamo già'],
                item2: ['The new idea', 'L’idea nuova'],
                item3: ['Examples', 'Esempi'],
                item4: ['Exercises', 'Esercizi']
            }], ['image-left', {
                title: ['The key idea', 'L’idea chiave'],
                body: ['Explain it as simply as you can.', 'Spiegala nel modo più semplice possibile.']
            }], ['title-body', {
                title: ['Example', 'Esempio'],
                body: ['One worked example, step by step.', 'Un esempio svolto, passo per passo.']
            }], ['list', {
                title: ['Your turn', 'Tocca a voi'],
                body: ['- First exercise\n- Second exercise\n- Third exercise', '- Primo esercizio\n- Secondo esercizio\n- Terzo esercizio']
            }]]
    },
    {
        id: 'thesis', theme: 'academic', cat: 'school', name: ['Thesis', 'Tesi'], slides: [
            ['cover', {
                title: ['Title of the thesis', 'Titolo della tesi'],
                subtitle: ['Candidate · Supervisor · University', 'Candidato · Relatore · Università']
            }], ['agenda', {
                title: ['Contents', 'Indice'],
                item1: ['Background', 'Contesto'],
                item2: ['Method', 'Metodo'],
                item3: ['Results', 'Risultati'],
                item4: ['Conclusions', 'Conclusioni']
            }], ['title-body', {
                title: ['Research question', 'Domanda di ricerca'],
                body: ['State it in one or two lines, then why it is open.', 'Formulala in una o due righe, poi perché è aperta.']
            }], ['caption', {caption: ['Figure 1. What the figure shows.', 'Figura 1. Che cosa mostra la figura.']}], ['numbers', {
                title: ['Results', 'Risultati'],
                n1: ['0.00', '0,00'],
                n1t: ['First measure', 'Prima misura'],
                n2: ['00%', '00%'],
                n2t: ['Second measure', 'Seconda misura'],
                n3: ['000', '000'],
                n3t: ['Sample size', 'Dimensione del campione']
            }], ['closing', {title: ['Thank you for your attention', 'Grazie per l’attenzione'], subtitle: [' ', ' ']}]]
    },
    {
        id: 'portfolio', theme: 'editorial', cat: 'creative', name: ['Portfolio', 'Portfolio'], slides: [
            ['cover', {
                title: ['Selected works', 'Lavori scelti'],
                subtitle: ['Name Surname', 'Nome Cognome']
            }], ['image-left', {
                title: ['About me', 'Chi sono'],
                body: ['Two lines about what you do and how.', 'Due righe su cosa fai e come.']
            }], ['image-full', {title: ['A project', 'Un progetto']}], ['gallery', {title: ['Details', 'Dettagli']}], ['quote', {
                quote: ['What a client says about you.', 'Cosa dice di te un cliente.'],
                author: ['Client', 'Cliente']
            }], ['closing', {
                title: ['Let’s work together', 'Lavoriamo insieme'],
                subtitle: ['you@example.com', 'tu@example.com']
            }]]
    },
    {
        id: 'event', theme: 'bauhaus', cat: 'creative', name: ['Event', 'Evento'], slides: [
            ['cover', {
                title: ['Name of the event', 'Nome dell’evento'],
                subtitle: ['Place and date', 'Luogo e data']
            }], ['timeline', {
                title: ['Programme', 'Programma'],
                t1t: ['9:00', '9:00'],
                t1: ['Welcome', 'Accoglienza'],
                t2t: ['10:00', '10:00'],
                t2: ['First talk', 'Primo intervento'],
                t3t: ['13:00', '13:00'],
                t3: ['Lunch', 'Pranzo'],
                t4t: ['15:00', '15:00'],
                t4: ['Workshops', 'Laboratori']
            }], ['three-cards', {
                title: ['Speakers', 'Relatori'],
                c1t: ['Name', 'Nome'],
                c1: ['Topic', 'Argomento'],
                c2t: ['Name', 'Nome'],
                c2: ['Topic', 'Argomento'],
                c3t: ['Name', 'Nome'],
                c3: ['Topic', 'Argomento']
            }], ['closing', {title: ['See you there', 'Ci vediamo lì'], subtitle: ['example.com', 'example.com']}]]
    },
    {
        id: 'travel', theme: 'sunset', cat: 'creative', name: ['Travel diary', 'Diario di viaggio'], slides: [
            ['cover', {
                title: ['A journey', 'Un viaggio'],
                subtitle: ['Where and when', 'Dove e quando']
            }], ['image-full', {title: ['Day one', 'Primo giorno']}], ['image-right', {
                title: ['The place', 'Il posto'],
                body: ['What you will not forget.', 'Quello che non dimenticherai.']
            }], ['gallery', {title: ['Moments', 'Momenti']}], ['closing', {
                title: ['See you soon', 'A presto'],
                subtitle: [' ', ' ']
            }]]
    },
    {
        id: 'project', theme: 'sage', cat: 'business', name: ['Project proposal', 'Proposta di progetto'], slides: [
            ['cover', {
                title: ['Project proposal', 'Proposta di progetto'],
                subtitle: ['Organisation · Date', 'Ente · Data']
            }], ['title-body', {
                title: ['Goal', 'Obiettivo'],
                body: ['What changes if the project succeeds?', 'Che cosa cambia se il progetto riesce?']
            }], ['three-cards', {
                title: ['Activities', 'Attività'],
                c1t: ['Prepare', 'Preparare'],
                c1: ['What, who', 'Cosa, chi'],
                c2t: ['Do', 'Fare'],
                c2: ['What, who', 'Cosa, chi'],
                c3t: ['Measure', 'Misurare'],
                c3: ['What, who', 'Cosa, chi']
            }], ['compare', {
                title: ['Costs and resources', 'Costi e risorse'],
                at: ['Needed', 'Servono'],
                a: ['- People\n- Tools\n- Time', '- Persone\n- Strumenti\n- Tempo'],
                bt: ['Available', 'Disponibili'],
                b: ['- People\n- Tools\n- Time', '- Persone\n- Strumenti\n- Tempo']
            }], ['closing', {
                title: ['What we ask you', 'Cosa vi chiediamo'],
                subtitle: ['you@example.com', 'tu@example.com']
            }]]
    },
    {
        id: 'kids', theme: 'playful', cat: 'school', name: ['For kids', 'Per bambini'], slides: [
            ['cover', {
                title: ['Hello everyone!', 'Ciao a tutti!'],
                subtitle: ['Today we discover…', 'Oggi scopriamo…']
            }], ['section', {
                label: ['Ready?', 'Pronti?'],
                title: ['Let’s start', 'Si parte']
            }], ['image-left', {
                title: ['Look here', 'Guardate qui'],
                body: ['What do you see?', 'Che cosa vedete?']
            }], ['three-cards', {
                title: ['Choose one', 'Scegline uno'],
                c1t: ['One', 'Uno'],
                c1: ['…', '…'],
                c2t: ['Two', 'Due'],
                c2: ['…', '…'],
                c3t: ['Three', 'Tre'],
                c3: ['…', '…']
            }], ['closing', {title: ['Well done!', 'Bravi!'], subtitle: [' ', ' ']}]]
    },
    {
        id: 'launch', theme: 'violet', cat: 'business', name: ['Product launch', 'Lancio di prodotto'], slides: [
            ['cover', {
                title: ['Meet the product', 'Ecco il prodotto'],
                subtitle: ['Launch · Season', 'Lancio · Stagione']
            }], ['statement', {title: ['Why people were waiting for it.', 'Perché le persone lo aspettavano.']}], ['icons', {
                title: ['Three things it does', 'Tre cose che fa'],
                i1t: ['Simple', 'Semplice'],
                i1: ['Explain it in one line', 'Spiegalo in una riga'],
                i2t: ['Precise', 'Preciso'],
                i2: ['Explain it in one line', 'Spiegalo in una riga'],
                i3t: ['Fast', 'Veloce'],
                i3: ['Explain it in one line', 'Spiegalo in una riga']
            }], ['big-image', {
                title: ['How it looks', 'Com’è fatto'],
                body: ['A caption that says what to notice.', 'Una didascalia che dice cosa notare.']
            }], ['pricing', {
                title: ['Prices', 'Prezzi'],
                p1t: ['Basic', 'Base'],
                p1n: ['0 €', '0 €'],
                p1: ['- Feature\n- Feature', '- Funzione\n- Funzione'],
                p2t: ['Plus', 'Plus'],
                p2n: ['00 €', '00 €'],
                p2: ['- Feature\n- Feature\n- Feature', '- Funzione\n- Funzione\n- Funzione'],
                p3t: ['Team', 'Team'],
                p3n: ['000 €', '000 €'],
                p3: ['- Feature\n- Feature', '- Funzione\n- Funzione']
            }], ['closing', {title: ['Available now', 'Disponibile ora'], subtitle: ['example.com', 'example.com']}]]
    },
    {
        id: 'marketing', theme: 'ocean', cat: 'business', name: ['Marketing plan', 'Piano marketing'], slides: [
            ['cover', {
                title: ['Marketing plan', 'Piano marketing'],
                subtitle: ['Brand · Year', 'Marchio · Anno']
            }], ['swot', {
                title: ['Where we are', 'Dove siamo'],
                st: ['Strengths', 'Punti di forza'],
                wt: ['Weaknesses', 'Punti deboli'],
                ot: ['Opportunities', 'Opportunità'],
                tt: ['Threats', 'Minacce']
            }], ['three-cards', {
                title: ['Who we talk to', 'A chi parliamo'],
                c1t: ['Audience 1', 'Pubblico 1'],
                c1: ['Who they are, what they need', 'Chi sono, di cosa hanno bisogno'],
                c2t: ['Audience 2', 'Pubblico 2'],
                c2: ['Who they are, what they need', 'Chi sono, di cosa hanno bisogno'],
                c3t: ['Audience 3', 'Pubblico 3'],
                c3: ['Who they are, what they need', 'Chi sono, di cosa hanno bisogno']
            }], ['chart', {
                title: ['Budget', 'Budget'],
                body: ['- Where most of it goes\n- What we expect back', '- Dove va la maggior parte\n- Cosa ci aspettiamo']
            }], ['timeline', {
                title: ['Calendar', 'Calendario'],
                t1t: ['Spring', 'Primavera'],
                t1: ['Campaign', 'Campagna'],
                t2t: ['Summer', 'Estate'],
                t2: ['Events', 'Eventi'],
                t3t: ['Autumn', 'Autunno'],
                t3: ['Launch', 'Lancio'],
                t4t: ['Winter', 'Inverno'],
                t4: ['Review', 'Bilancio']
            }], ['closing', {title: ['Let’s go', 'Si parte'], subtitle: ['you@example.com', 'tu@example.com']}]]
    },
    {
        id: 'meeting', theme: 'linen', cat: 'business', name: ['Team meeting', 'Riunione di team'], slides: [
            ['cover', {
                title: ['Team meeting', 'Riunione di team'],
                subtitle: ['Date', 'Data']
            }], ['agenda', {
                title: ['Today', 'Oggi'],
                item1: ['Round of updates', 'Giro di aggiornamenti'],
                item2: ['Decisions to take', 'Decisioni da prendere'],
                item3: ['Obstacles', 'Ostacoli'],
                item4: ['Next week', 'La prossima settimana']
            }], ['two-cols', {
                title: ['Done and doing', 'Fatto e in corso'],
                left: ['- Done\n- Done', '- Fatto\n- Fatto'],
                right: ['- Doing\n- Doing', '- In corso\n- In corso']
            }], ['statement', {title: ['The decision of today', 'La decisione di oggi']}], ['checklist', {
                title: ['Who does what', 'Chi fa cosa'],
                item1: ['Name: task', 'Nome: attività'],
                item2: ['Name: task', 'Nome: attività'],
                item3: ['Name: task', 'Nome: attività']
            }]]
    },
    {
        id: 'okr', theme: 'mono', cat: 'business', name: ['Goals (OKR)', 'Obiettivi (OKR)'], slides: [
            ['cover', {
                title: ['Our goals', 'I nostri obiettivi'],
                subtitle: ['Quarter · Year', 'Trimestre · Anno']
            }], ['section', {
                label: ['Objective 1', 'Obiettivo 1'],
                title: ['What we want to reach', 'Che cosa vogliamo raggiungere']
            }], ['numbers', {
                title: ['Key results', 'Risultati chiave'],
                n1: ['00%', '00%'],
                n1t: ['First measure', 'Prima misura'],
                n2: ['00', '00'],
                n2t: ['Second measure', 'Seconda misura'],
                n3: ['0.0', '0,0'],
                n3t: ['Third measure', 'Terza misura']
            }], ['table', {
                title: ['Status', 'Stato'],
                table: [[['Result', 'Owner', 'Progress'], ['First', 'Name', '40%'], ['Second', 'Name', '70%'], ['Third', 'Name', '15%']], [['Risultato', 'Chi', 'Avanzamento'], ['Primo', 'Nome', '40%'], ['Secondo', 'Nome', '70%'], ['Terzo', 'Nome', '15%']]]
            }]]
    },
    {
        id: 'case', theme: 'gazette', cat: 'business', name: ['Case study', 'Caso di studio'], slides: [
            ['cover', {
                title: ['A case study', 'Un caso di studio'],
                subtitle: ['Client · Project', 'Cliente · Progetto']
            }], ['image-right', {
                title: ['The situation', 'La situazione'],
                body: ['Who the client is and what was not working.', 'Chi è il cliente e che cosa non funzionava.']
            }], ['steps', {
                title: ['What we did', 'Cosa abbiamo fatto'],
                s1t: ['Listen', 'Ascoltare'],
                s1: ['…', '…'],
                s2t: ['Design', 'Progettare'],
                s2: ['…', '…'],
                s3t: ['Build', 'Costruire'],
                s3: ['…', '…'],
                s4t: ['Measure', 'Misurare'],
                s4: ['…', '…']
            }], ['chart', {
                title: ['The results', 'I risultati'],
                body: ['The figure that changed the most, and why.', 'La cifra cambiata di più, e perché.']
            }], ['quote', {
                quote: ['What the client said at the end.', 'Cosa ha detto il cliente alla fine.'],
                author: ['Client', 'Cliente']
            }]]
    },
    {
        id: 'course', theme: 'forest', cat: 'school', name: ['Course unit', 'Unità didattica'], slides: [
            ['cover', {
                title: ['Unit 1', 'Unità 1'],
                subtitle: ['Title of the course', 'Titolo del corso']
            }], ['checklist', {
                title: ['At the end you will be able to', 'Alla fine saprai'],
                item1: ['First goal', 'Primo obiettivo'],
                item2: ['Second goal', 'Secondo obiettivo'],
                item3: ['Third goal', 'Terzo obiettivo']
            }], ['title-body', {
                title: ['The theory', 'La teoria'],
                body: ['One idea at a time.', 'Un’idea alla volta.']
            }], ['image-left', {
                title: ['An example', 'Un esempio'],
                body: ['…', '…']
            }], ['quiz', {
                title: ['A question', 'Una domanda'],
                a1: ['Answer', 'Risposta'],
                a2: ['Answer', 'Risposta'],
                a3: ['Answer', 'Risposta'],
                a4: ['Answer', 'Risposta']
            }], ['closing', {title: ['Well done', 'Ottimo lavoro'], subtitle: ['Next: unit 2', 'Prossima: unità 2']}]]
    },
    {
        id: 'quiz', theme: 'candy', cat: 'school', name: ['Quiz', 'Quiz'], slides: [
            ['cover', {
                title: ['Quiz time!', 'È l’ora del quiz!'],
                subtitle: ['Are you ready?', 'Siete pronti?']
            }], ['quiz', {title: ['Question 1', 'Domanda 1']}], ['quiz', {title: ['Question 2', 'Domanda 2']}], ['quiz', {title: ['Question 3', 'Domanda 3']}], ['number', {
                big: ['10/10', '10/10'],
                body: ['Who won?', 'Chi ha vinto?']
            }]]
    },
    {
        id: 'book', theme: 'cotton', cat: 'school', name: ['Book report', 'Scheda libro'], slides: [
            ['cover', {
                title: ['Title of the book', 'Titolo del libro'],
                subtitle: ['Author · Your name', 'Autore · Il tuo nome']
            }], ['image-left', {
                title: ['The author', 'L’autore'],
                body: ['Life in a few lines.', 'La vita in poche righe.']
            }], ['title-body', {
                title: ['The plot', 'La trama'],
                body: ['Without telling the end!', 'Senza svelare il finale!']
            }], ['team', {title: ['The characters', 'I personaggi']}], ['quote', {
                quote: ['The sentence I liked best.', 'La frase che mi è piaciuta di più.'],
                author: ['Page 00', 'Pagina 00']
            }], ['number', {big: ['8/10', '8/10'], body: ['My mark, and why.', 'Il mio voto, e perché.']}]]
    },
    {
        id: 'research', theme: 'blueprint', cat: 'school', name: ['Research', 'Ricerca'], slides: [
            ['cover', {
                title: ['Research project', 'Progetto di ricerca'],
                subtitle: ['Group · Subject', 'Gruppo · Materia']
            }], ['statement', {title: ['Our question', 'La nostra domanda']}], ['steps', {
                title: ['Method', 'Metodo'],
                s1t: ['Hypothesis', 'Ipotesi'],
                s1: ['…', '…'],
                s2t: ['Data', 'Dati'],
                s2: ['…', '…'],
                s3t: ['Analysis', 'Analisi'],
                s3: ['…', '…'],
                s4t: ['Check', 'Verifica'],
                s4: ['…', '…']
            }], ['chart', {
                title: ['What we found', 'Cosa abbiamo trovato'],
                body: ['Read the chart aloud in one sentence.', 'Leggi il grafico in una frase.']
            }], ['list', {title: ['Sources', 'Fonti'], body: ['- Source\n- Source', '- Fonte\n- Fonte']}]]
    },
    {
        id: 'poster',
        theme: 'paper',
        format: 'a3-p',
        cat: 'school',
        name: ['Science poster (A3)', 'Poster scientifico (A3)'],
        slides: [['three-cards', {
            title: ['Title of the poster', 'Titolo del poster'],
            c1t: ['Background', 'Contesto'],
            c1: ['Why this study', 'Perché questo studio'],
            c2t: ['Method', 'Metodo'],
            c2: ['How it was done', 'Come è stato fatto'],
            c3t: ['Results', 'Risultati'],
            c3: ['What was found', 'Che cosa si è trovato']
        }]]
    },
    {
        id: 'certificate',
        theme: 'academic',
        format: 'a4',
        cat: 'documents',
        name: ['Certificate (A4)', 'Attestato (A4)'],
        slides: [['certificate', {
            label: ['Certificate of attendance', 'Attestato di partecipazione'],
            title: ['Name Surname', 'Nome Cognome'],
            body: ['took part in the course “Title”, for a total of 00 hours.', 'ha partecipato al corso «Titolo», per un totale di 00 ore.'],
            date: ['Place, date', 'Luogo, data'],
            sign: ['Signature', 'Firma']
        }]]
    },
    {
        id: 'menu',
        theme: 'kraft',
        format: 'a4-p',
        cat: 'documents',
        name: ['Menu (A4)', 'Menù (A4)'],
        slides: [['menu', {
            title: ['Starters', 'Antipasti'],
            m1t: ['Dish', 'Piatto'],
            m1: ['Ingredients', 'Ingredienti'],
            m2t: ['Dish', 'Piatto'],
            m2: ['Ingredients', 'Ingredienti'],
            m3t: ['Dish', 'Piatto'],
            m3: ['Ingredients', 'Ingredienti']
        }], ['menu', {title: ['Main courses', 'Primi e secondi']}], ['menu', {title: ['Desserts', 'Dolci']}]]
    },
    {
        id: 'flyer',
        theme: 'retro',
        format: 'a4-p',
        cat: 'documents',
        name: ['Flyer (A4)', 'Volantino (A4)'],
        slides: [['big-image', {
            title: ['Something is happening', 'Succede qualcosa'],
            body: ['Saturday, 9 pm. Place, address. Free entry.', 'Sabato, ore 21. Luogo, indirizzo. Ingresso libero.']
        }]]
    },
    {
        id: 'story',
        theme: 'sunset',
        format: 'story',
        cat: 'documents',
        name: ['Stories (9:16)', 'Storie (9:16)'],
        slides: [['cover', {
            title: ['Swipe up', 'Scorri'],
            subtitle: ['Your story', 'La tua storia']
        }], ['statement', {title: ['One idea.', 'Un’idea.']}], ['image-full', {title: ['One picture', 'Un’immagine']}], ['closing', {
            title: ['Follow us', 'Seguici'],
            subtitle: ['@name', '@nome']
        }]]
    },
    {
        id: 'cards',
        theme: 'candy',
        format: 'square',
        cat: 'documents',
        name: ['Carousel (square)', 'Carosello (quadrato)'],
        slides: [['cover', {
            title: ['5 tips', '5 consigli'],
            subtitle: ['Save this post', 'Salva questo post']
        }], ['number', {big: ['1', '1'], body: ['The first tip', 'Il primo consiglio']}], ['number', {
            big: ['2', '2'],
            body: ['The second tip', 'Il secondo consiglio']
        }], ['number', {
            big: ['3', '3'],
            body: ['The third tip', 'Il terzo consiglio']
        }], ['closing', {title: ['Did you like it?', 'Ti è piaciuto?'], subtitle: ['Tell us', 'Diccelo']}]]
    },
    {
        id: 'wedding', theme: 'noir', cat: 'creative', name: ['Celebration', 'Festa'], slides: [
            ['cover', {
                title: ['Anna & Luca', 'Anna e Luca'],
                subtitle: ['Place · Date', 'Luogo · Data']
            }], ['image-left', {
                title: ['Our story', 'La nostra storia'],
                body: ['How it started.', 'Com’è iniziata.']
            }], ['gallery', {title: ['Moments', 'Momenti']}], ['timeline', {
                title: ['The day', 'La giornata'],
                t1t: ['15:30', '15:30'],
                t1: ['Ceremony', 'Cerimonia'],
                t2t: ['17:00', '17:00'],
                t2: ['Toast', 'Brindisi'],
                t3t: ['20:00', '20:00'],
                t3: ['Dinner', 'Cena'],
                t4t: ['22:30', '22:30'],
                t4: ['Dancing', 'Balli']
            }], ['closing', {title: ['Thank you', 'Grazie'], subtitle: ['With love', 'Con affetto']}]]
    },
    {
        id: 'nature',
        theme: 'forest',
        cat: 'creative',
        name: ['Nature', 'Natura'],
        slides: [['cover', {
            title: ['Into the woods', 'Nel bosco'],
            subtitle: ['A walk', 'Una passeggiata']
        }], ['image-full', {title: ['What you hear', 'Quello che si sente']}], ['three-cards', {
            title: ['Who lives here', 'Chi ci vive'],
            c1t: ['Trees', 'Alberi'],
            c1: ['…', '…'],
            c2t: ['Animals', 'Animali'],
            c2: ['…', '…'],
            c3t: ['People', 'Persone'],
            c3: ['…', '…']
        }], ['closing', {title: ['Leave only footprints', 'Lascia solo impronte'], subtitle: [' ', ' ']}]]
    },
    {
        id: 'cv',
        theme: 'linen',
        format: 'a4-p',
        cat: 'documents',
        name: ['One-page CV (A4)', 'CV di una pagina (A4)'],
        slides: [['image-left', {
            title: ['Name Surname', 'Nome Cognome'],
            body: ['- Experience\n- Education\n- Languages\n- Contacts', '- Esperienze\n- Formazione\n- Lingue\n- Contatti']
        }]]
    },
];

/** Groups of templates, in this order. */
export const TPL_CATS = ['talk', 'business', 'school', 'creative', 'documents'];

export const tplName = (x) => x.name[lang() === 'it' ? 1 : 0];

/** {title, meta, slides} of a new presentation. */
export function fromTemplate(tpl, {format = tpl.format || '16-9', theme, opts = {}, fonts = {}} = {}) {
    const L = lang() === 'it' ? 1 : 0, [w, h] = FORMATS[format] || FORMATS['16-9'];
    const meta = {
        format: {id: format, w, h},
        theme: {id: theme || tpl.theme, colors: {}, fonts},
        opts: {
            numbers: false,
            footer: '',
            tr: 'fade',
            download: true,
            copy: true,
            comments: true,
            loop: false,
            auto: 0, ...opts
        }
    };
    const ctx = context(meta);
    return {
        meta,
        slides: tpl.slides.map(([lay, fill], i) => ({
            ...makeSlide(lay, ctx, Object.fromEntries(Object.entries(fill).map(([k, v]) => [k, typeof v[L] === 'string' ? v[L].trim() : v[L]]))),
            pos: i + 1
        }))
    };
}
