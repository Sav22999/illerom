/** Page sizes, typefaces and the settings a book starts with. Lengths in millimetres. */
export const SIZES = {
    A3: [297, 420],
    A4: [210, 297],
    A5: [148, 210],
    A6: [105, 148],
    B5: [176, 250],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6],
    Tabloid: [279.4, 431.8],
    // the trims of printed books
    Trade: [152.4, 228.6],
    Digest: [139.7, 215.9],
    Pocket: [108, 175],
    Royal: [156, 234],
};
/** The typefaces included in SavBooks (no download needed), with their kind; system ones last. */
export const BUILTIN = {
    'Source Sans 3': 'sans-serif', Inter: 'sans-serif', 'Open Sans': 'sans-serif', Roboto: 'sans-serif', Lato: 'sans-serif', Montserrat: 'sans-serif', Poppins: 'sans-serif',
    Nunito: 'sans-serif', Raleway: 'sans-serif', 'Work Sans': 'sans-serif', 'DM Sans': 'sans-serif', Manrope: 'sans-serif', 'Fira Sans': 'sans-serif', 'IBM Plex Sans': 'sans-serif',
    'Noto Sans': 'sans-serif', Rubik: 'sans-serif', Oswald: 'sans-serif',
    Lora: 'serif', 'Playfair Display': 'serif', Merriweather: 'serif', 'EB Garamond': 'serif', 'Libre Baskerville': 'serif', 'Crimson Pro': 'serif', 'Source Serif 4': 'serif',
    'IBM Plex Serif': 'serif', 'PT Serif': 'serif', 'Noto Serif': 'serif',
    'JetBrains Mono': 'monospace', 'IBM Plex Mono': 'monospace', 'Bebas Neue': 'display', Caveat: 'handwriting', 'Dancing Script': 'handwriting',
    Georgia: 'serif', Garamond: 'serif', 'Times New Roman': 'serif', Arial: 'sans-serif', Helvetica: 'sans-serif', Verdana: 'sans-serif', 'Courier New': 'monospace',
};
export const FONTS = Object.keys(BUILTIN);
/** The kind of the typefaces that come from Bunny Fonts or from a file (filled by fonts.js), for the fallback. */
export const KINDS = {};
const FALL = {
    serif: 'Georgia, serif', monospace: "'Courier New', monospace", handwriting: 'cursive', display: 'Arial, sans-serif', 'sans-serif': 'Arial, sans-serif',
    Garamond: "'EB Garamond', Georgia, serif", 'Times New Roman': 'Times, serif', 'Courier New': 'Courier, monospace',
};
export const fontStack = (f) => `'${f}', ${FALL[f] || FALL[BUILTIN[f] || KINDS[f]] || FALL['sans-serif']}`;

export const DEFAULTS = {
    size: 'A4',
    w: 210,
    h: 297,
    landscape: false,
    mt: 25,
    mr: 25,
    mb: 25,
    ml: 25,
    header: {l: '', c: '', r: ''},
    footer: {l: '', c: '', r: ''},
    firstPage: true,
    font: 'Source Sans 3',
    headFont: 'Source Sans 3',
    fontSize: 11,
    line: 1.5,
    gap: 8,
    color: '#1c1c1c',
    headColor: '#1c1c1c',
    accent: '#8a2346',
    bg: '#ffffff',
    border: '',
    borderColor: '#8a2346',
    mark: '',
    startPage: 1,
    bandLine: false,
    capNum: false,
    fonts: [], // the typefaces that are not included: {n: name, c: kind, b: Bunny Fonts slug | f: id of a file}
    noComments: false,
    noDownload: false,
    noCopy: false,
    numbered: false,
    justify: false,
    lang: 'en',
    book: null, // the details of the book (see BOOK in book.js)
};

/** Ready-made looks: they only change typefaces, sizes and colours. */
const look = (font, headFont, fontSize, line, gap, color, headColor, accent, justify = false, bg = '#ffffff') => ({font, headFont, fontSize, line, gap, color, headColor, accent, justify, bg});
export const LOOKS = {
    clean: look('Source Sans 3', 'Source Sans 3', 11, 1.5, 8, '#1c1c1c', '#1c1c1c', '#8a2346'),
    modern: look('Inter', 'Montserrat', 10.5, 1.55, 8, '#22262b', '#8a2346', '#8a2346'),
    book: look('Lora', 'Playfair Display', 11, 1.6, 4, '#211d1a', '#211d1a', '#8a4b2f', true),
    thesis: look('Times New Roman', 'Times New Roman', 12, 1.5, 6, '#000000', '#000000', '#1d4e89', true),
    office: look('Open Sans', 'Open Sans', 10.5, 1.45, 7, '#1f2430', '#1d4e89', '#1d4e89'),
    type: look('Courier New', 'Courier New', 12, 1.8, 10, '#1c1c1c', '#1c1c1c', '#5f6660'),
    sunset: look('Poppins', 'Poppins', 10, 1.6, 8, '#2b2330', '#c2410c', '#ea7317'),
    ocean: look('Open Sans', 'Montserrat', 10.5, 1.5, 8, '#1b2a3a', '#0b5394', '#0891b2'),
    forest: look('Lora', 'Montserrat', 10.5, 1.6, 7, '#22301f', '#2f5d34', '#5a8f3c'),
    berry: look('Inter', 'Playfair Display', 10.5, 1.6, 8, '#2a1f2d', '#8b1e5b', '#b83280'),
    cream: look('Lora', 'Lora', 11, 1.65, 6, '#3b332a', '#5b3a21', '#a9744f', false, '#fdf8ef'),
    mono: look('Inter', 'Inter', 10, 1.5, 8, '#111111', '#111111', '#111111'),
};

export const MM = 96 / 25.4;

/** Page width and height in mm, orientation included. */
export function pageMM(s) {
    let [w, h] = s.size === 'custom' ? [s.w, s.h] : SIZES[s.size] || SIZES.A4;
    if (s.landscape && h > w) [w, h] = [h, w];
    else if (!s.landscape && s.size !== 'custom' && w > h) [w, h] = [h, w];
    return [w, h];
}

/** Header or footer text with its fields filled in. */
export const fields = (txt, ctx) => txt.replace(/\{(page|pages|title|date)\}/g, (_, k) => ctx[k]);
