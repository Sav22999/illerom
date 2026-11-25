/**
 * Formulas. A small part of LaTeX is read into a tree, shown as MathML and written to Word as its own equations.
 *   \frac{a}{b}  x^2  x_i  \sqrt[n]{x}  \sum_{i=1}^n  \int  Greek letters  \left( \right)  \text{…}  \vec{v}  \bar{x}
 *   \begin{matrix} a & b \\ c & d \end{matrix} (also pmatrix, bmatrix, vmatrix, cases)
 */
import { esc } from './clean.js';

const SYM = Object.fromEntries('alpha α beta β gamma γ delta δ epsilon ε zeta ζ eta η theta θ iota ι kappa κ lambda λ mu μ nu ν xi ξ pi π rho ρ sigma σ tau τ upsilon υ phi φ chi χ psi ψ omega ω Gamma Γ Delta Δ Theta Θ Lambda Λ Xi Ξ Pi Π Sigma Σ Phi Φ Psi Ψ Omega Ω infty ∞ partial ∂ nabla ∇ hbar ℏ ell ℓ emptyset ∅ Re ℜ Im ℑ aleph ℵ ldots … cdots ⋯ dots … vdots ⋮ degree ° prime ′'.split(' ').reduce((a, x, i, l) => (i % 2 ? a : [...a, [x, l[i + 1]]]), []));
const OPS = Object.fromEntries('times × cdot · div ÷ pm ± mp ∓ le ≤ leq ≤ ge ≥ geq ≥ ne ≠ neq ≠ approx ≈ equiv ≡ sim ∼ propto ∝ to → rightarrow → leftarrow ← Rightarrow ⇒ Leftarrow ⇐ leftrightarrow ↔ Leftrightarrow ⇔ mapsto ↦ in ∈ notin ∉ subset ⊂ subseteq ⊆ supset ⊃ cup ∪ cap ∩ forall ∀ exists ∃ neg ¬ land ∧ lor ∨ perp ⊥ parallel ∥ angle ∠ circ ∘ ast ∗ star ⋆ oplus ⊕ otimes ⊗ langle ⟨ rangle ⟩ lfloor ⌊ rfloor ⌋ lceil ⌈ rceil ⌉ mid ∣'.split(' ').reduce((a, x, i, l) => (i % 2 ? a : [...a, [x, l[i + 1]]]), []));
const BIG = { sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', bigcup: '⋃', bigcap: '⋂' };
const FUN = new Set('sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp lim max min sup inf det dim ker gcd mod'.split(' '));
const ACC = { vec: '→', bar: '―', hat: '^', tilde: '~', dot: '˙', ddot: '¨', overline: '―' };
const FENCE = { matrix: ['', ''], pmatrix: ['(', ')'], bmatrix: ['[', ']'], vmatrix: ['|', '|'], cases: ['{', ''] };

export function parse(src) {
  const s = String(src || '').slice(0, 800);
  let i = 0, depth = 0;
  const ws = () => { while (/\s/.test(s[i] || '')) i++; };
  const raw = () => { ws(); if (s[i] !== '{') return s[i] ? s[i++] : ''; let d = 1, o = ''; i++; while (i < s.length && d) { if (s[i] === '{') d++; if (s[i] === '}') d--; if (d) o += s[i]; i++; } return o; };
  const arg = () => { ws(); if (s[i] === '{') { i++; const r = row('}'); i++; return r; } return atom() || { t: 'row', c: [] }; };
  function row(end) {
    const c = [];
    if (++depth > 30) { i = s.length; }
    for (;;) {
      ws();
      if (i >= s.length || s[i] === end || (end === 'cell' && (s[i] === '&' || s.startsWith('\\\\', i) || s.startsWith('\\end', i))) || (end === 'right' && s.startsWith('\\right', i))) break;
      let a = atom();
      if (!a) { i++; continue; }
      for (;;) {
        ws();
        if (s[i] === '^') { i++; a = a.t === 'script' && !a.sup ? { ...a, sup: arg() } : { t: 'script', b: a, sup: arg() }; } else if (s[i] === '_') { i++; a = a.t === 'script' && !a.sub ? { ...a, sub: arg() } : { t: 'script', b: a, sub: arg() }; } else if (s[i] === "'") { i++; a = { t: 'script', b: a, sup: { t: 'o', x: '′' } }; } else break;
      }
      c.push(a);
    }
    depth--;
    return c.length === 1 ? c[0] : { t: 'row', c };
  }
  function atom() {
    ws();
    const ch = s[i];
    if (ch === undefined) return null;
    if (ch === '{') { i++; const r = row('}'); i++; return r; }
    if (/[0-9]/.test(ch)) { const m = s.slice(i).match(/^\d+([.,]\d+)?/)[0]; i += m.length; return { t: 'n', x: m }; }
    if (/\p{L}/u.test(ch)) { const m = s.slice(i).match(/^\p{L}/u)[0]; i += m.length; return { t: 'i', x: m }; }
    if (ch !== '\\') { i++; return { t: 'o', x: ch === '-' ? '−' : ch === '*' ? '∗' : ch }; }
    const m = s.slice(i).match(/^\\([a-zA-Z]+|.)/);
    if (!m) { i++; return null; }
    i += m[0].length;
    const n = m[1];
    if (n === 'frac' || n === 'dfrac' || n === 'tfrac') return { t: 'frac', a: arg(), b: arg() };
    if (n === 'binom') return { t: 'fence', l: '(', r: ')', c: { t: 'mat', rows: [[arg()], [arg()]] } };
    if (n === 'sqrt') { ws(); let idx = null; if (s[i] === '[') { i++; idx = row(']'); i++; } return { t: 'sqrt', a: arg(), idx }; }
    if (n === 'text' || n === 'mathrm' || n === 'operatorname') return { t: 'text', x: raw() };
    if (n === 'mathbf' || n === 'mathbb' || n === 'mathcal') return arg();
    if (ACC[n]) return { t: 'acc', a: arg(), x: ACC[n] };
    if (n === 'left') { ws(); let l = s[i] === '\\' ? (i++, s[i]) : s[i]; i++; const c = row('right'); let r = ''; if (s.startsWith('\\right', i)) { i += 6; ws(); r = s[i] === '\\' ? (i++, s[i]) : s[i] || ''; i++; } if (l === '.') l = ''; if (r === '.') r = ''; return { t: 'fence', l, r, c }; }
    if (n === 'begin') {
      const name = raw(), f = FENCE[name] || FENCE.matrix, rows = [[]];
      while (i < s.length && rows.length < 12) {
        rows.at(-1).push(row('cell'));
        if (s[i] === '&') i++; else if (s.startsWith('\\\\', i)) { i += 2; rows.push([]); } else break;
      }
      if (s.startsWith('\\end', i)) { i += 4; raw(); }
      return { t: 'fence', l: f[0], r: f[1], c: { t: 'mat', rows: rows.filter((x) => x.length), left: name === 'cases' } };
    }
    if (BIG[n]) return { t: 'big', x: BIG[n] };
    if (FUN.has(n)) return { t: 'f', x: n };
    if (SYM[n]) return { t: 'i', x: SYM[n] };
    if (OPS[n]) return { t: 'o', x: OPS[n] };
    if (n === ',' || n === ';' || n === ':' || n === ' ' || n === 'quad' || n === 'qquad') return { t: 'sp', w: n === 'quad' ? 1 : n === 'qquad' ? 2 : 0.25 };
    if (/^[{}%$#&_|]$/.test(n)) return { t: 'o', x: n === '|' ? '‖' : n };
    return { t: 'text', x: n };
  }
  return row('\u0000');
}

const lim = (b) => b.t === 'big' && !/[∫∬∮]/.test(b.x) || (b.t === 'f' && /^(lim|max|min|sup|inf)$/.test(b.x));
function ml(n, disp) {
  const R = (x) => ml(x, disp);
  switch (n?.t) {
    case 'row': return `<mrow>${n.c.map(R).join('')}</mrow>`;
    case 'n': return `<mn>${esc(n.x)}</mn>`;
    case 'i': return `<mi>${esc(n.x)}</mi>`;
    case 'f': return `<mi mathvariant="normal">${n.x}</mi><mspace width=".17em"></mspace>`;
    case 'o': return `<mo>${esc(n.x)}</mo>`;
    case 'big': return `<mo largeop="true">${n.x}</mo>`;
    case 'text': return `<mtext>${esc(n.x)}</mtext>`;
    case 'sp': return `<mspace width="${n.w}em"></mspace>`;
    case 'frac': return `<mfrac><mrow>${R(n.a)}</mrow><mrow>${R(n.b)}</mrow></mfrac>`;
    case 'sqrt': return n.idx ? `<mroot><mrow>${R(n.a)}</mrow><mrow>${R(n.idx)}</mrow></mroot>` : `<msqrt>${R(n.a)}</msqrt>`;
    case 'acc': return `<mover accent="true"><mrow>${R(n.a)}</mrow><mo stretchy="${n.x === '―'}">${n.x}</mo></mover>`;
    case 'fence': return `<mrow>${n.l ? `<mo stretchy="true">${esc(n.l)}</mo>` : ''}${R(n.c)}${n.r ? `<mo stretchy="true">${esc(n.r)}</mo>` : ''}</mrow>`;
    case 'mat': return `<mtable${n.left ? ' columnalign="left"' : ''}>${n.rows.map((r) => `<mtr>${r.map((c) => `<mtd>${R(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
    case 'script': {
      const u = lim(n.b) && disp, b = `<mrow>${R(n.b).replace(/<mspace width="\.17em"><\/mspace>$/, '')}</mrow>`, w = (x) => `<mrow>${R(x)}</mrow>`;
      if (n.sub && n.sup) return u ? `<munderover>${b}${w(n.sub)}${w(n.sup)}</munderover>` : `<msubsup>${b}${w(n.sub)}${w(n.sup)}</msubsup>`;
      return n.sub ? (u ? `<munder>${b}${w(n.sub)}</munder>` : `<msub>${b}${w(n.sub)}</msub>`) : u ? `<mover>${b}${w(n.sup)}</mover>` : `<msup>${b}${w(n.sup)}</msup>`;
    }
    default: return '';
  }
}
export const mathml = (src, disp) => `<math${disp ? ' display="block"' : ''}><mstyle displaystyle="${!!disp}">${ml(parse(src), disp)}</mstyle></math>`;

/** Office Math for Word. */
export function omml(src, disp) {
  const r = (x, plain) => `<m:r>${plain ? '<m:rPr><m:nor/></m:rPr>' : ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">${esc(x)}</m:t></m:r>`;
  const e = (n) => `<m:e>${o(n)}</m:e>`;
  function o(n) {
    switch (n?.t) {
      case 'row': { let out = ''; n.c.forEach((x, i) => { const b = x.t === 'script' && x.b.t === 'big' ? x : x.t === 'big' ? { b: x } : null; if (b) { const rest = { t: 'row', c: n.c.slice(i + 1) }; if (!n.done) { out += nary(b, rest); n = { ...n, done: true }; } } else if (!n.done) out += o(x); }); return out; }
      case 'n': case 'i': case 'o': return r(n.x);
      case 'f': return r(n.x + ' ', true);
      case 'big': return nary({ b: n }, { t: 'row', c: [] });
      case 'text': return r(n.x, true);
      case 'sp': return r(' '.repeat(Math.max(1, Math.round(n.w))), true);
      case 'frac': return `<m:f><m:num>${o(n.a)}</m:num><m:den>${o(n.b)}</m:den></m:f>`;
      case 'sqrt': return `<m:rad><m:radPr>${n.idx ? '' : '<m:degHide m:val="1"/>'}</m:radPr><m:deg>${n.idx ? o(n.idx) : ''}</m:deg>${e(n.a)}</m:rad>`;
      case 'acc': return `<m:acc><m:accPr><m:chr m:val="${{ '→': '⃗', '―': '̅', '^': '̂', '~': '̃', '˙': '̇', '¨': '̈' }[n.x]}"/></m:accPr>${e(n.a)}</m:acc>`;
      case 'fence': return `<m:d><m:dPr><m:begChr m:val="${esc(n.l)}"/><m:endChr m:val="${esc(n.r)}"/></m:dPr>${e(n.c)}</m:d>`;
      case 'mat': return `<m:m>${n.rows.map((q) => `<m:mr>${q.map(e).join('')}</m:mr>`).join('')}</m:m>`;
      case 'script': {
        if (n.b.t === 'big') return nary(n, { t: 'row', c: [] });
        if (lim(n.b) && n.sub && !n.sup) return `<m:limLow>${e({ t: 'text', x: n.b.x })}<m:lim>${o(n.sub)}</m:lim></m:limLow>${r(' ', true)}`;
        if (n.sub && n.sup) return `<m:sSubSup>${e(n.b)}<m:sub>${o(n.sub)}</m:sub><m:sup>${o(n.sup)}</m:sup></m:sSubSup>`;
        return n.sub ? `<m:sSub>${e(n.b)}<m:sub>${o(n.sub)}</m:sub></m:sSub>` : `<m:sSup>${e(n.b)}<m:sup>${o(n.sup)}</m:sup></m:sSup>`;
      }
      default: return '';
    }
  }
  const nary = (n, rest) => `<m:nary><m:naryPr><m:chr m:val="${n.b.x}"/><m:limLoc m:val="${lim(n.b) ? 'undOvr' : 'subSup'}"/>${n.sub ? '' : '<m:subHide m:val="1"/>'}${n.sup ? '' : '<m:supHide m:val="1"/>'}</m:naryPr><m:sub>${n.sub ? o(n.sub) : ''}</m:sub><m:sup>${n.sup ? o(n.sup) : ''}</m:sup><m:e>${o(rest)}</m:e></m:nary>`;
  const body = `<m:oMath>${o(parse(src))}</m:oMath>`;
  return disp ? `<m:oMathPara>${body}</m:oMathPara>` : body;
}

/** Back from Word's equations to the LaTeX the editor keeps. */
export function latexOf(node) {
  const back = {};
  for (const [k, v] of Object.entries(SYM)) back[v] ||= `\\${k} `;
  for (const [k, v] of Object.entries(OPS)) back[v] ||= `\\${k} `;
  Object.assign(back, { '−': '-', '∗': '*', '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', $: '\\$', _: '\\_' });
  const bigBack = Object.fromEntries(Object.entries(BIG).map(([k, v]) => [v, `\\${k}`]));
  const accBack = { '⃗': 'vec', '̅': 'bar', '¯': 'bar', '̂': 'hat', '^': 'hat', '̃': 'tilde', '~': 'tilde', '̇': 'dot', '̈': 'ddot' };
  const k = (x, name) => (x ? [...x.children].find((c) => c.localName === name) : null);
  const v = (x) => x?.getAttribute('m:val') ?? x?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/math', 'val');
  const all = (x) => (x ? [...x.children].map(go).join('') : '');
  const g = (x) => `{${all(x).trim()}}`;
  const fence = (c) => (!c ? '.' : /[{}]/.test(c) ? `\\${c}` : c === '⟨' ? '\\langle ' : c === '⟩' ? '\\rangle ' : c === '‖' ? '\\|' : c);
  function go(x) {
    switch (x.localName) {
      case 'r': {
        const t = [...x.children].filter((c) => c.localName === 't').map((c) => c.textContent).join('');
        if (k(k(x, 'rPr'), 'nor')) return FUN.has(t.trim()) ? `\\${t.trim()} ` : t.trim() ? `\\text{${t}}` : '\\ ';
        return [...t].map((c) => back[c] || c).join('');
      }
      case 'f': return `\\frac${g(k(x, 'num'))}${g(k(x, 'den'))}`;
      case 'sSup': return `${g(k(x, 'e'))}^${g(k(x, 'sup'))}`;
      case 'sSub': return `${g(k(x, 'e'))}_${g(k(x, 'sub'))}`;
      case 'sSubSup': return `${g(k(x, 'e'))}_${g(k(x, 'sub'))}^${g(k(x, 'sup'))}`;
      case 'rad': { const d = all(k(x, 'deg')).trim(); return `\\sqrt${d ? `[${d}]` : ''}${g(k(x, 'e'))}`; }
      case 'nary': { const c = v(k(k(x, 'naryPr'), 'chr')) || '∫', s = all(k(x, 'sub')).trim(), p = all(k(x, 'sup')).trim(); return `${bigBack[c] || c}${s ? `_{${s}}` : ''}${p ? `^{${p}}` : ''} ${all(k(x, 'e'))}`; }
      case 'd': { const pr = k(x, 'dPr'), b = k(pr, 'begChr'), e = k(pr, 'endChr'); if (b && e && !v(b) && !v(e)) return [...x.children].filter((c) => c.localName === 'e').map(all).join(', '); return `\\left${fence(b ? v(b) : '(')} ${[...x.children].filter((c) => c.localName === 'e').map(all).join(', ')} \\right${fence(e ? v(e) : ')')}`; }
      case 'm': return `\\begin{matrix} ${[...x.children].filter((c) => c.localName === 'mr').map((r) => [...r.children].filter((c) => c.localName === 'e').map(all).join(' & ')).join(' \\\\ ')} \\end{matrix}`;
      case 'acc': return `\\${accBack[v(k(k(x, 'accPr'), 'chr')) || '̂'] || 'hat'}${g(k(x, 'e'))}`;
      case 'bar': return `\\overline${g(k(x, 'e'))}`;
      case 'limLow': return `${g(k(x, 'e'))}_${g(k(x, 'lim'))}`;
      case 'limUpp': return `${g(k(x, 'e'))}^${g(k(x, 'lim'))}`;
      case 'func': return `${all(k(x, 'fName')).trim()} ${all(k(x, 'e'))}`;
      default: return /Pr$/.test(x.localName) ? '' : all(x);
    }
  }
  return go(node).replace(/\s+/g, ' ').trim().slice(0, 800);
}
