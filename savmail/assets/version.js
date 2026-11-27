/** The version of SavMail (in the footer) and what changed in each one (the page #/changelog). Newest first. */
export const VERSION = '0.9.1';

export const CHANGES = [
  {
    v: '0.9.1', date: '2026-11-27', items: [
      ['The recipients suggested from SavContacts while you type a name or an address', 'I destinatari suggeriti da SavContacts mentre scrivi un nome o un indirizzo'],
    ],
  },
  {
    v: '0.9.0', date: '2026-11-27', items: [
      ['First version, for testing: your mailboxes of Gmail, Outlook, Yahoo, iCloud, Aruba, Libero or any IMAP provider in one place', 'Prima versione, in prova: le tue caselle di Gmail, Outlook, Yahoo, iCloud, Aruba, Libero o di qualsiasi provider IMAP in un solo posto'],
      ['Up to ten addresses: the folders of all of them together (one inbox for all), or each with its own', 'Fino a dieci indirizzi: le cartelle di tutti insieme (un’unica posta in arrivo), o ciascuno con le sue'],
      ['Read, reply, forward, write with attachments; drafts, archive, spam, trash and folders, the same as in every other mail app', 'Leggi, rispondi, inoltra, scrivi con allegati; bozze, archivio, spam, cestino e cartelle, gli stessi di ogni altra app di posta'],
      ['Encrypted: servers, passwords and signatures are locked with a key that only your devices hold; messages are never kept by SavMail', 'Cifrata: server, password e firme sono chiusi con una chiave che hanno solo i tuoi dispositivi; SavMail non conserva mai i messaggi'],
      ['Pictures from the internet held back until you ask (they tell the sender you read the message); no scripts in messages, ever', 'Le immagini da internet restano bloccate finché non le chiedi (dicono al mittente che hai letto il messaggio); mai script nei messaggi'],
    ],
  },
];
