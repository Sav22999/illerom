/** Page sizes, typefaces and the settings a document starts with. Lengths in millimetres. */
export const SIZES = { A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] };
export const FONTS = ['Source Sans 3', 'Inter', 'Open Sans', 'Montserrat', 'Poppins', 'Lora', 'Playfair Display', 'Georgia', 'Garamond', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Courier New'];
const FALL = { Lora: 'serif', 'Playfair Display': 'serif', Georgia: 'serif', Garamond: "'EB Garamond', Georgia, serif", 'Times New Roman': 'Times, serif', 'Courier New': 'Courier, monospace' };
export const fontStack = (f) => `'${f}', ${FALL[f] || 'Arial, sans-serif'}`;

export const DEFAULTS = {
  size: 'A4', w: 210, h: 297, landscape: false, mt: 25, mr: 25, mb: 25, ml: 25,
  header: { l: '', c: '', r: '' }, footer: { l: '', c: '', r: '' }, firstPage: true,
  font: 'Source Sans 3', headFont: 'Source Sans 3', fontSize: 11, line: 1.5, gap: 8, color: '#1c1c1c', headColor: '#1c1c1c', numbered: false, justify: false, lang: 'en',
};

/** Ready-made looks: they only change typefaces, sizes and colours. */
export const LOOKS = {
  clean: { font: 'Source Sans 3', headFont: 'Source Sans 3', fontSize: 11, line: 1.5, gap: 8, color: '#1c1c1c', headColor: '#1c1c1c', justify: false },
  modern: { font: 'Inter', headFont: 'Montserrat', fontSize: 10.5, line: 1.55, gap: 8, color: '#22262b', headColor: '#0f6e56', justify: false },
  book: { font: 'Lora', headFont: 'Playfair Display', fontSize: 11, line: 1.6, gap: 4, color: '#211d1a', headColor: '#211d1a', justify: true },
  thesis: { font: 'Times New Roman', headFont: 'Times New Roman', fontSize: 12, line: 1.5, gap: 6, color: '#000000', headColor: '#000000', justify: true },
  office: { font: 'Open Sans', headFont: 'Open Sans', fontSize: 10.5, line: 1.45, gap: 7, color: '#1f2430', headColor: '#1d4e89', justify: false },
  type: { font: 'Courier New', headFont: 'Courier New', fontSize: 12, line: 1.8, gap: 10, color: '#1c1c1c', headColor: '#1c1c1c', justify: false },
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
