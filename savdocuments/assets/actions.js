/** Small actions shared by the home and the writing screen. */
import {fail, h, toast} from './ui.js';
import {t} from './i18n.js';
import {keep} from './store.js';
import {readFile} from './files.js';

const RANK = ['viewer', 'commenter', 'editor', 'owner'];
export const can = (role, min) => RANK.indexOf(role) >= RANK.indexOf(min);

export const pickFile = (accept, multiple) => new Promise((res) => {
    const i = h('input', {type: 'file', accept, multiple});
    i.addEventListener('change', () => res([...i.files]));
    i.addEventListener('cancel', () => res([]));
    i.click();
});

export async function openFile(file, folder) {
    const note = toast(t('importing'), 'neutral', {duration: 0});
    try {
        location.hash = '#/d/' + (await keep(await readFile(file), {folder}));
    } catch (e) {
        fail(e);
    } finally {
        note.remove();
    }
}

export async function importFile(folder) {
    const [f] = await pickFile('.savdoc,.docx,.html,.htm,.md,.txt');
    if (f) await openFile(f, folder);
}
