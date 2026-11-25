/**
 * Themes: colours, typefaces, text styles and decorations. Decorations are ordinary elements (shapes), so they are
 * drawn and exported like everything else. Elements use colour tokens (@accent…) and roles (title, body…): changing the
 * theme restyles every slide without touching its content.
 */
export const FONTS = {
    inter: ['Inter', 'sans-serif', 4],
    poppins: ['Poppins', 'sans-serif', 4],
    montserrat: ['Montserrat', 'sans-serif', 4],
    opensans: ['Open Sans', 'sans-serif', 4],
    sourcesans: ['Source Sans 3', 'sans-serif', 4],
    fredoka: ['Fredoka', 'sans-serif', 1],
    lora: ['Lora', 'serif', 4],
    merriweather: ['Merriweather', 'serif', 4],
    playfair: ['Playfair Display', 'serif', 4],
    baskerville: ['Libre Baskerville', 'serif', 4],
    garamond: ['EB Garamond', 'serif', 4],
    ptserif: ['PT Serif', 'serif', 4],
    mono: ['JetBrains Mono', 'monospace', 1],
    niconne: ['Niconne', 'cursive', 1],
};
export const FORMATS = {
    '16-9': [1280, 720],
    '16-10': [1280, 800],
    '4-3': [1024, 768],
    a4: [1123, 794],
    'a4-p': [794, 1123],
    a3: [1587, 1123],
    'a3-p': [1123, 1587],
    square: [1080, 1080],
    story: [720, 1280],
};

const sh = (shape, x, y, w, h, fill, more) => ({t: 'shape', shape, x, y, w, h, fill, ...more});
const C = (bg, fg, muted, accent, accent2, surface, onaccent = '#ffffff') => ({
    bg,
    fg,
    muted,
    accent,
    accent2,
    surface,
    onaccent
});
const c = (v) => ({t: 'c', c: v});
const g = (a, b, ang = 135) => ({t: 'g', a, b, ang});

/* group: clean | classic | creative. bg/colors by variant (content, cover, section). decor(variant, W, H, s) */
export const THEMES = {
    // ------------------------------------------------------------ clean
    paper: {
        name: 'Paper',
        group: 'clean',
        colors: C('#ffffff', '#16181d', '#6a7080', '#1f6feb', '#e8590c', '#f3f4f6'),
        fonts: {head: 'inter', body: 'inter'},
        tx: {title: {ls: -1.2}, heading: {ls: -.8}}
    },
    ink: {
        name: 'Ink',
        group: 'clean',
        colors: C('#0c0d10', '#f5f5f2', '#8e919b', '#f5f5f2', '#ffb454', '#191b20', '#0c0d10'),
        fonts: {head: 'inter', body: 'inter'},
        tx: {title: {ls: -1.4}, heading: {ls: -.8}}
    },
    swiss: {
        name: 'Swiss',
        group: 'clean',
        colors: C('#ffffff', '#111111', '#777777', '#e30613', '#111111', '#f2f2f0'),
        fonts: {head: 'inter', body: 'inter'},
        tx: {title: {ls: -2.4, size: 1.18, lh: .98, align: 'left', va: 'top'}, heading: {ls: -1, align: 'left'}},
        variants: {
            section: {
                bg: c('@bg'),
                onAccent: 1,
                colors: {bg: '#e30613', fg: '#ffffff', muted: '#ffd9dc', accent: '#ffffff', onaccent: '#e30613'}
            }
        },
        decor: (v, W, H, s) => v === 'content' ? [sh('rect', W * .075, 34 * s, 46 * s, 5 * s, '@accent')] : v === 'cover' ? [sh('rect', W * .075, H - 66 * s, 110 * s, 12 * s, '@accent')] : []
    },
    cotton: {
        name: 'Cotton',
        group: 'clean',
        colors: C('#faf7f1', '#2b2722', '#857c70', '#9a5b34', '#4e6b57', '#f0eae0'),
        fonts: {head: 'garamond', body: 'garamond'},
        tx: {
            title: {bold: 0, size: 1.16, ls: -.6},
            heading: {bold: 0, size: 1.12},
            body: {size: 1.12},
            quote: {size: 1.1}
        }
    },
    mist: {
        name: 'Mist',
        group: 'clean',
        colors: C('#eef1f4', '#22303c', '#71808e', '#2f6f7e', '#c08552', '#ffffff'),
        fonts: {head: 'sourcesans', body: 'sourcesans'},
        tx: {title: {ls: -.8}}
    },
    typewriter: {
        name: 'Typewriter',
        group: 'clean',
        colors: C('#f7f7f4', '#1d1d1b', '#7c7c76', '#1d1d1b', '#c2410c', '#ecece6'),
        fonts: {head: 'mono', body: 'mono'},
        tx: {
            title: {size: .84, bold: 0, ls: -1},
            heading: {size: .86, bold: 0, ls: -.6},
            body: {size: .84, lh: 1.55},
            big: {size: .9},
            quote: {size: .84}
        }
    },

    linen: {
        name: 'Linen',
        group: 'clean',
        colors: C('#fbfaf8', '#2f2a3d', '#857f93', '#7c4dff', '#ff8a65', '#f1eef6'),
        fonts: {head: 'sourcesans', body: 'sourcesans'},
        tx: {title: {ls: -1.6, size: 1.08}, heading: {ls: -.8}}
    },
    mono: {
        name: 'Mono',
        group: 'clean',
        colors: C('#ffffff', '#000000', '#6f6f6f', '#000000', '#6f6f6f', '#f4f4f4'),
        fonts: {head: 'montserrat', body: 'inter'},
        tx: {title: {ls: -2, size: 1.1}},
        variants: {
            section: {
                bg: c('@bg'),
                colors: {
                    bg: '#000000',
                    fg: '#ffffff',
                    muted: '#a8a8a8',
                    accent: '#ffffff',
                    onaccent: '#000000',
                    surface: '#1c1c1c'
                }
            }
        }
    },

    // ------------------------------------------------------------ classic
    gazette: {
        name: 'Gazette',
        group: 'classic',
        colors: C('#f6f2e9', '#1c1a17', '#716a5f', '#8c1c13', '#2f4858', '#ebe4d5'),
        fonts: {head: 'merriweather', body: 'ptserif'},
        tx: {title: {size: .92}, heading: {size: .86}},
        decor: (v, W, H, s) => v === 'cover' ? [sh('rect', W * .075, H * .12, W * .85, 4 * s, '@fg'), sh('rect', W * .075, H * .12 + 8 * s, W * .85, 1.5 * s, '@fg'), sh('rect', W * .075, H * .86, W * .85, 1.5 * s, '@fg')] : [sh('rect', W * .075, H * .075, W * .85, 3 * s, '@fg')]
    },
    blueprint: {
        name: 'Blueprint',
        group: 'classic',
        colors: C('#123a6b', '#ffffff', '#a9c6e8', '#ffffff', '#ffd166', '#1b4a83', '#123a6b'),
        fonts: {head: 'mono', body: 'mono'},
        tx: {title: {size: .8, bold: 0}, heading: {size: .82, bold: 0}, body: {size: .8}, quote: {size: .8}},
        decor: (v, W, H, s) => {
            const out = [], g2 = 80 * s;
            for (let x = g2; x < W; x += g2) out.push(sh('rect', x, 0, 1, H, '#ffffff', {o: .07}));
            for (let y = g2; y < H; y += g2) out.push(sh('rect', 0, y, W, 1, '#ffffff', {o: .07}));
            return out;
        }
    },
    forest: {
        name: 'Forest',
        group: 'classic',
        colors: C('#f4f6f1', '#17301f', '#647a69', '#2d6a4f', '#bc6c25', '#e2eadc'),
        fonts: {head: 'lora', body: 'sourcesans'},
        variants: {
            cover: {
                bg: c('@bg'),
                colors: {
                    bg: '#17301f',
                    fg: '#f4f6f1',
                    muted: '#b7cbb9',
                    accent: '#95d5b2',
                    onaccent: '#17301f',
                    surface: '#234630'
                }
            }
        },
        decor: (v, W, H, s) => v === 'cover' ? [sh('triangle', W * .6, H * .34, H * .62, H * .66, '#2d6a4f'), sh('triangle', W * .78, H * .18, H * .7, H * .82, '#40916c'), sh('triangle', W * .52, H * .58, H * .4, H * .42, '#52b788')] : v === 'content' ? [sh('triangle', W - 120 * s, H - 70 * s, 80 * s, 70 * s, '@accent', {o: .25}), sh('triangle', W - 80 * s, H - 96 * s, 90 * s, 96 * s, '@accent', {o: .4})] : []
    },
    classic: {
        name: 'Classic',
        group: 'classic',
        colors: C('#ffffff', '#1f2a37', '#667085', '#1d4ed8', '#f59e0b', '#eff4ff'),
        fonts: {head: 'opensans', body: 'opensans'},
        variants: {
            cover: {
                bg: c('@bg'),
                onAccent: 1,
                colors: {
                    fg: '#ffffff',
                    muted: '#c9d8ff',
                    bg: '#1d4ed8',
                    surface: '#2c5be0',
                    accent: '#fbbf24',
                    accent2: '#ffffff',
                    onaccent: '#1f2a37'
                }
            },
            section: {
                bg: c('@bg'),
                onAccent: 1,
                colors: {
                    fg: '#ffffff',
                    muted: '#c9d8ff',
                    bg: '#1d4ed8',
                    surface: '#2c5be0',
                    accent: '#fbbf24',
                    accent2: '#ffffff',
                    onaccent: '#1f2a37'
                }
            }
        },
        decor: (v, W, H, s) => v === 'content' ? [sh('rect', 0, 0, W, 10 * s, '@accent')] : [sh('rect', W * .075, H * .5 + 88 * s, 120 * s, 6 * s, '@accent')]
    },
    office: {
        name: 'Boardroom',
        group: 'classic',
        colors: C('#fdfdfc', '#14213d', '#69738a', '#14213d', '#d08c2c', '#eef0f4'),
        fonts: {head: 'sourcesans', body: 'sourcesans'},
        variants: {
            cover: {
                bg: c('#14213d'),
                colors: {fg: '#ffffff', muted: '#aab4c9', bg: '#14213d', accent: '#d08c2c', surface: '#22304f'}
            },
            section: {
                bg: c('#14213d'),
                colors: {fg: '#ffffff', muted: '#aab4c9', bg: '#14213d', accent: '#d08c2c', surface: '#22304f'}
            }
        },
        decor: (v, W, H, s) => v === 'content' ? [sh('rect', 0, H - 14 * s, W, 14 * s, '@fg'), sh('rect', 0, H - 14 * s, W * .18, 14 * s, '@accent2')] : [sh('rect', 0, 0, 22 * s, H, '@accent2')]
    },
    academic: {
        name: 'Academic',
        group: 'classic',
        colors: C('#fffdf8', '#24201c', '#766c62', '#7b1e2b', '#3c5a78', '#f4eee2'),
        fonts: {head: 'baskerville', body: 'ptserif'},
        tx: {title: {size: .92}, heading: {size: .9}},
        decor: (v, W, H, s) => v === 'content' ? [sh('rect', W * .075, H * .185, W * .85, 2 * s, '@accent')] : [sh('frame', 26 * s, 26 * s, W - 52 * s, H - 52 * s, '', {
            stroke: '@accent',
            sw: 2 * s,
            shape: 'rect'
        })]
    },
    chalk: {
        name: 'Chalkboard',
        group: 'classic',
        colors: C('#1f3a33', '#f6f3e6', '#b4c5ba', '#ffd97d', '#f4a28c', '#2a4a41', '#1f3a33'),
        fonts: {head: 'lora', body: 'lora'},
        decor: (v, W, H, s) => [sh('rect', 14 * s, 14 * s, W - 28 * s, H - 28 * s, '', {
            stroke: '#8a6a48',
            sw: 12 * s,
            rad: 10 * s
        })]
    },
    sage: {
        name: 'Sage',
        group: 'classic',
        colors: C('#f6f8f3', '#243027', '#6c7a6f', '#4d7c5a', '#d9a441', '#e6ede2'),
        fonts: {head: 'merriweather', body: 'opensans'},
        tx: {title: {size: .9}, heading: {size: .88}},
        variants: {
            section: {
                bg: c('@bg'),
                onAccent: 1,
                colors: {
                    fg: '#ffffff',
                    muted: '#d5e5d9',
                    bg: '#4d7c5a',
                    accent: '#ffffff',
                    onaccent: '#4d7c5a',
                    surface: '#5d8b69'
                }
            }
        },
        decor: (v, W, H, s) => v === 'cover' ? [sh('rect', W * .68, 0, W * .32, H, '@surface'), sh('arch', W * .74, H * .3, W * .2, H * .7, '@accent'), sh('ellipse', W * .79, H * .12, W * .1, W * .1, '@accent2')] : v === 'content' ? [sh('rect', 0, 0, 12 * s, H, '@accent')] : []
    },

    // ------------------------------------------------------------ creative
    violet: {
        name: 'Violet',
        group: 'creative',
        colors: C('#fbf9ff', '#1b1035', '#6e6389', '#6d3bef', '#ffb703', '#efe8ff'),
        fonts: {head: 'montserrat', body: 'inter'},
        tx: {title: {ls: -1.6}, heading: {ls: -.8}},
        variants: {
            cover: {
                bg: g('#7c4dff', '#33108f', 140),
                colors: {
                    fg: '#ffffff',
                    muted: '#dccfff',
                    bg: '#5a1fd6',
                    accent: '#ffd166',
                    onaccent: '#33108f',
                    surface: '#6f3ae6'
                }
            },
            section: {
                bg: c('@bg'),
                colors: {
                    bg: '#33108f',
                    fg: '#ffffff',
                    muted: '#cbb8ff',
                    accent: '#ffd166',
                    onaccent: '#33108f',
                    surface: '#4a1bb0'
                }
            }
        },
        decor: (v, W, H, s) => v === 'content' ? [sh('rect', W - 150 * s, -34 * s, 190 * s, 92 * s, '@accent', {
            o: .1,
            r: 12,
            rad: 20 * s
        })] : [sh('rect', W * .66, -H * .12, H * .7, H * .4, '#ffffff', {
            o: .1,
            r: 14,
            rad: 44 * s
        }), sh('rect', W * .72, H * .34, H * .7, H * .4, '#ffffff', {
            o: .12,
            r: -8,
            rad: 44 * s
        }), sh('rect', W * .62, H * .78, H * .7, H * .4, '#ffd166', {o: .9, r: 10, rad: 44 * s})]
    },
    candy: {
        name: 'Candy',
        group: 'creative',
        colors: C('#fff7fb', '#3d1136', '#8f6a86', '#e8368f', '#3bb2f6', '#ffe3f1'),
        fonts: {head: 'fredoka', body: 'opensans'},
        tx: {title: {bold: 0}, heading: {bold: 0}, big: {bold: 0}},
        variants: {
            section: {
                bg: g('#ff8cc6', '#8ed1ff', 120),
                colors: {bg: '#ff9ccd', fg: '#3d1136', muted: '#6b3560', surface: '#ffd0e8'}
            }
        },
        decor: (v, W, H, s) => v === 'content' ? [sh('ellipse', -50 * s, H - 70 * s, 140 * s, 140 * s, '@accent2', {o: .35}), sh('ellipse', 60 * s, H - 36 * s, 60 * s, 60 * s, '@accent', {o: .35})] : v === 'cover' ? [sh('ellipse', W * .7, H * .06, H * .5, H * .5, '#ffc2df'), sh('ellipse', W * .8, H * .46, H * .56, H * .56, '#bfe4ff'), sh('ellipse', W * .64, H * .6, H * .26, H * .26, '#fff0a8'), sh('heart', W * .755, H * .2, 90 * s, 84 * s, '@accent')] : []
    },
    retro: {
        name: 'Retro',
        group: 'creative',
        colors: C('#fff4df', '#33261d', '#87715f', '#d1495b', '#00798c', '#ffe3b8'),
        fonts: {head: 'fredoka', body: 'sourcesans'},
        tx: {title: {bold: 0}, heading: {bold: 0}, big: {bold: 0}},
        decor: (v, W, H, s) => v === 'content' ? ['#d1495b', '#edae49', '#00798c'].map((k, i) => sh('rect', 0, H - (14 + i * 14) * s, W, 8 * s, k)) : ['#00798c', '#66a182', '#edae49', '#d1495b'].map((k, i) => sh('ellipse', W * .56 + i * 46 * s, H * .16 + i * 46 * s, H * 1.1 - i * 92 * s, H * 1.1 - i * 92 * s, k))
    },
    noir: {
        name: 'Noir',
        group: 'creative',
        colors: C('#14121a', '#f4efe6', '#9c95a6', '#d4af37', '#8d6bd1', '#211d2b', '#14121a'),
        fonts: {head: 'playfair', body: 'montserrat'},
        tx: {body: {size: .9}, title: {size: 1.06}},
        decor: (v, W, H, s) => v === 'content' ? [sh('rect', W * .075, H - 60 * s, 60 * s, 2 * s, '@accent')] : [sh('rect', 40 * s, 40 * s, W - 80 * s, H - 80 * s, '', {
            stroke: '@accent',
            sw: 1.5 * s
        }), sh('diamond', W / 2 - 9 * s, 31 * s, 18 * s, 18 * s, '@accent')]
    },
    kraft: {
        name: 'Kraft',
        group: 'creative',
        colors: C('#e9dcc3', '#3a2c1f', '#7b6752', '#a4452c', '#3f6b5c', '#dccaa8'),
        fonts: {head: 'niconne', body: 'ptserif'},
        tx: {
            title: {size: 1.3, bold: 0},
            heading: {size: 1.2, bold: 0},
            quote: {size: 1.15, italic: 0},
            big: {bold: 0, ls: 0}
        },
        decor: (v, W, H, s) => [sh('rect', 20 * s, 20 * s, W - 40 * s, H - 40 * s, '', {
            stroke: '@fg',
            sw: 2 * s,
            dash: 'dash',
            rad: 10 * s,
            o: .55
        })]
    },
    aurora: {
        name: 'Aurora',
        group: 'creative',
        colors: C('#fbfaff', '#1c1535', '#6c658a', '#6d3bef', '#11b5c9', '#f0ebff'),
        fonts: {head: 'poppins', body: 'poppins'},
        tx: {title: {ls: -1.2}, body: {size: .94}},
        variants: {
            cover: {
                bg: g('#5b2be0', '#0fb7c9', 130),
                colors: {
                    fg: '#ffffff',
                    muted: '#e2dcff',
                    bg: '#5b2be0',
                    accent: '#ffffff',
                    onaccent: '#5b2be0',
                    surface: '#7a55ea'
                }
            },
            section: {
                bg: g('#0fb7c9', '#5b2be0', 130),
                colors: {
                    fg: '#ffffff',
                    muted: '#e2dcff',
                    bg: '#3b6fd8',
                    accent: '#ffffff',
                    onaccent: '#5b2be0',
                    surface: '#5f8ae0'
                }
            }
        },
        decor: (v, W, H, s) => v === 'content' ? [sh('ellipse', W - 130 * s, -110 * s, 240 * s, 240 * s, 'g|135|@accent|@accent2', {o: .16}), sh('ellipse', W - 60 * s, 70 * s, 70 * s, 70 * s, '@accent2', {o: .14})] : [sh('ellipse', W * .66, -H * .25, H * .9, H * .9, '#ffffff', {o: .1}), sh('ellipse', W * .8, H * .45, H * .7, H * .7, '#ffffff', {o: .1})]
    },
    sunset: {
        name: 'Sunset',
        group: 'creative',
        colors: C('#fff8f3', '#3a1d2b', '#8d6b73', '#e4572e', '#f2a65a', '#ffe9db'),
        fonts: {head: 'playfair', body: 'lora'},
        variants: {
            cover: {
                bg: g('#ffb36b', '#d8436b', 160),
                colors: {
                    fg: '#ffffff',
                    muted: '#fff0e6',
                    bg: '#e0694f',
                    accent: '#ffffff',
                    onaccent: '#d8436b',
                    surface: '#ea8a6c'
                }
            },
            section: {
                bg: g('#d8436b', '#6b2d73', 160),
                colors: {
                    fg: '#ffffff',
                    muted: '#f7d9e4',
                    bg: '#a3386f',
                    accent: '#ffb36b',
                    onaccent: '#6b2d73',
                    surface: '#b4547f'
                }
            }
        },
        decor: (v, W, H, s) => v === 'cover' ? [sh('ellipse', W * .72, H * .5, H * .62, H * .62, '#fff1c9', {o: .55}), sh('wave', -10, H * .78, W + 20, H * .25, '#6b2d73', {o: .35})] : v === 'content' ? [sh('half', W - 210 * s, H - 70 * s, 160 * s, 70 * s, '@accent2', {o: .5})] : []
    },
    bloom: {
        name: 'Bloom',
        group: 'creative',
        colors: C('#fffafb', '#33223a', '#877489', '#c2417c', '#5fa8a0', '#fbe9f1'),
        fonts: {head: 'lora', body: 'montserrat'},
        tx: {body: {size: .9}},
        decor: (v, W, H, s) => v === 'content' ? [sh('blob', W - 120 * s, H - 130 * s, 230 * s, 220 * s, '#f7cfe0', {o: .7})] : [sh('blob', W * .62, -H * .18, H * .85, H * .85, '#f7cfe0'), sh('blob2', W * .78, H * .42, H * .72, H * .7, '#cfe8e3'), sh('blob', -H * .18, H * .7, H * .42, H * .42, '#fde6c4')]
    },
    terra: {
        name: 'Terra',
        group: 'creative',
        colors: C('#f7efe4', '#3b2a20', '#8b7361', '#b5532f', '#e0a458', '#eadbc6'),
        fonts: {head: 'baskerville', body: 'sourcesans'},
        tx: {title: {size: .92}, heading: {size: .88}},
        decor: (v, W, H, s) => v === 'content' ? [sh('quarter', 0, H - 90 * s, 90 * s, 90 * s, '@accent2', {o: .8})] : [sh('arch', W * .64, H * .16, W * .14, H * .84, '@accent'), sh('arch', W * .78, H * .34, W * .14, H * .66, '@accent2'), sh('ellipse', W * .83, H * .08, W * .085, W * .085, '#7c8b5a')]
    },
    ocean: {
        name: 'Ocean',
        group: 'creative',
        colors: C('#f4fafc', '#0d2b3e', '#5d7a8a', '#0b7fab', '#19b5a5', '#dff0f5'),
        fonts: {head: 'montserrat', body: 'opensans'},
        tx: {title: {ls: -.8, size: .94}, heading: {size: .92}},
        variants: {
            cover: {
                bg: g('#0d2b3e', '#0b7fab', 180),
                colors: {
                    fg: '#ffffff',
                    muted: '#b9dcea',
                    bg: '#0d2b3e',
                    accent: '#19d3c0',
                    onaccent: '#0d2b3e',
                    surface: '#174560'
                }
            },
            section: {
                bg: g('#0b7fab', '#19b5a5', 150),
                colors: {
                    fg: '#ffffff',
                    muted: '#d9f5f2',
                    bg: '#0b7fab',
                    accent: '#ffffff',
                    onaccent: '#0b7fab',
                    surface: '#2a94bb'
                }
            }
        },
        decor: (v, W, H, s) => v === 'content' ? [sh('wave', -8, H - 44 * s, W + 16, 60 * s, '@accent', {o: .14})] : [sh('wave', -8, H * .72, W + 16, H * .32, '#19d3c0', {o: .22}), sh('wave', -8, H * .8, W + 16, H * .25, '#ffffff', {
            o: .12,
            flip: 1
        })]
    },
    neon: {
        name: 'Neon',
        group: 'creative',
        colors: C('#0b0b16', '#f2f0ff', '#8e8bb0', '#b14cff', '#19f0c8', '#17172a', '#0b0b16'),
        fonts: {head: 'montserrat', body: 'inter'},
        tx: {title: {ls: -1.2}},
        decor: (v, W, H, s) => v === 'content' ? [sh('rect', 0, 0, W, 5 * s, 'g|90|@accent|@accent2')] : [sh('ring', W * .64, H * .12, H * .78, H * .78, 'g|135|@accent|@accent2', {o: .9}), sh('ellipse', W * .6, H * .62, 60 * s, 60 * s, '@accent2')]
    },
    bauhaus: {
        name: 'Bauhaus',
        group: 'creative',
        colors: C('#f4efe3', '#1a1a1a', '#6d675b', '#d62f27', '#1f55a5', '#e7dfcd'),
        fonts: {head: 'montserrat', body: 'montserrat'},
        tx: {title: {ls: -1.4}, body: {size: .92}},
        decor: (v, W, H, s) => {
            const u = H / 4;
            return v === 'content' ? [sh('quarter', W - 64 * s, 0, 64 * s, 64 * s, '@accent'), sh('rect', W - 128 * s, 0, 64 * s, 64 * s, '@accent2')] : [sh('rect', W - 2 * u, 0, u, u, '@accent2'), sh('ellipse', W - u, 0, u, u, '@accent'), sh('quarter', W - u, u, u, u, '#f0b429'), sh('half', W - 2 * u, u, u, u, '@fg'), sh('rect', W - u, 2 * u, u, u, '@accent2'), sh('triangle', W - 2 * u, 2 * u, u, u, '#f0b429'), sh('quarter', W - 2 * u, 3 * u, u, u, '@accent'), sh('ellipse', W - u, 3 * u, u, u, '@fg')];
        }
    },
    editorial: {
        name: 'Editorial',
        group: 'creative',
        colors: C('#fffef9', '#111111', '#75706a', '#111111', '#c8102e', '#f3efe6'),
        fonts: {head: 'playfair', body: 'sourcesans'},
        tx: {
            title: {size: 1.28, lh: 1.0, ls: -1.5, align: 'left'},
            heading: {size: 1.1, align: 'left'},
            label: {caps: 1, ls: 3}
        },
        decor: (v, W, H, s) => v === 'cover' ? [sh('rect', W * .075, H * .1, W * .85, 1.5 * s, '@fg'), sh('rect', W * .075, H * .9, W * .85, 1.5 * s, '@fg')] : v === 'content' ? [sh('rect', W * .075, H * .075, W * .85, 1.5 * s, '@fg')] : []
    },
    playful: {
        name: 'Playful',
        group: 'creative',
        colors: C('#fffdf5', '#26224a', '#7a769a', '#ff6b4a', '#3fb8af', '#fff0d6'),
        fonts: {head: 'fredoka', body: 'poppins'},
        tx: {title: {bold: 0}, heading: {bold: 0}, big: {bold: 0}, body: {size: .92}},
        variants: {section: {bg: c('#ffcf56'), colors: {bg: '#ffcf56', surface: '#ffe08f', muted: '#6b5a2a'}}},
        decor: (v, W, H, s) => v === 'content' ? [sh('star4', W - 100 * s, 30 * s, 56 * s, 56 * s, '#ffcf56'), sh('ellipse', W - 46 * s, H - 46 * s, 90 * s, 90 * s, '@accent2', {o: .85})] : [sh('blob2', W * .7, -H * .1, H * .6, H * .58, '#ffcf56'), sh('ellipse', W * .86, H * .55, H * .34, H * .34, '@accent2'), sh('star4', W * .64, H * .56, 90 * s, 90 * s, '@accent'), sh('plus', W * .58, H * .14, 50 * s, 50 * s, '@accent2', {r: 18})]
    },
};

/** Text styles of each role at the size of a 16:9 slide; the theme can change them (tx; size is a factor). */
const ROLES = {
    title: {font: '@head', size: 68, bold: 1, lh: 1.08, color: '@fg', va: 'middle', align: 'left'},
    subtitle: {font: '@body', size: 27, bold: 0, lh: 1.35, color: '@muted', va: 'top', align: 'left'},
    heading: {font: '@head', size: 42, bold: 1, lh: 1.14, color: '@fg', va: 'middle', align: 'left'},
    body: {font: '@body', size: 24, bold: 0, lh: 1.42, color: '@fg', va: 'top', align: 'left'},
    caption: {font: '@body', size: 16, bold: 0, lh: 1.4, color: '@muted', va: 'top', align: 'left'},
    label: {font: '@body', size: 18, bold: 1, lh: 1.3, color: '@accent', va: 'middle', align: 'left', ls: .5},
    quote: {font: '@head', size: 46, bold: 0, italic: 1, lh: 1.25, color: '@fg', va: 'middle', align: 'left'},
    big: {font: '@head', size: 150, bold: 1, lh: 1, color: '@accent', va: 'middle', align: 'left', ls: -3},
};
export const ROLE_IDS = Object.keys(ROLES);

const mix = (h) => {
    const x = parseInt(h.slice(1, 7), 16);
    return (0.299 * (x >> 16) + 0.587 * ((x >> 8) & 255) + 0.114 * (x & 255)) / 255;
};
export const isDark = (hex) => mix(hex) < .55;

/** Everything needed to draw the slides of a presentation: size, colours of each variant, typefaces, text styles. */
export function context(meta) {
    const W = meta.format.w, H = meta.format.h;
    const s = Math.min(Math.sqrt(W * H) / 960, W / 860);
    const def = THEMES[meta.theme.id] || THEMES.paper;
    const custom = meta.theme.colors || {};
    const fonts = {...def.fonts, ...(meta.theme.fonts || {})};
    const cache = {};
    const variant = (v) => cache[v] ||= (() => {
        const o = def.variants?.[v];
        // colours changed by hand win over the theme; on coloured covers only the accents they replace change
        const colors = {...def.colors, ...custom, ...(o ? o.colors : {})};
        if (o) for (const k of Object.keys(custom)) if (o.colors[k] === undefined || (k === 'accent' && o.onAccent)) colors[k] = custom[k];
        if (o?.onAccent && custom.accent) {
            colors.bg = custom.accent;
            const d = isDark(custom.accent);
            colors.fg = d ? '#ffffff' : '#16181d';
            colors.muted = d ? '#e6e8ee' : '#3d424e';
        }
        return {colors, bg: o ? o.bg : c('@bg')};
    })();
    const roles = {};
    for (const r of ROLE_IDS) {
        const b = ROLES[r], t = def.tx?.[r] || {};
        roles[r] = {...b, ...t, size: b.size * (t.size || 1) * s, ls: (t.ls ?? b.ls ?? 0) * s};
    }
    return {W, H, s, meta, def, fonts, roles, variant, opts: meta.opts || {}};
}

/** The context of one slide: resolved colours. */
export function slideContext(ctx, d) {
    const v = ctx.variant(d.variant || 'content');
    const color = (x) => (!x ? '' : x[0] === '@' ? v.colors[x.slice(1)] || '#000000' : x);
    const font = (f) => (f === '@head' ? ctx.fonts.head : f === '@body' ? ctx.fonts.body : f) || ctx.fonts.body;
    const family = (f) => {
        const F = FONTS[font(f)] || FONTS.inter;
        return `"SP ${F[0]}", ${F[1]}`;
    };
    return {...ctx, colors: v.colors, color, font, family, bg: d.bg || v.bg, variantId: d.variant || 'content'};
}

/** A gradient "g|angle|a|b" as its parts, or null. */
export function gradient(f) {
    if (!f || f.slice(0, 2) !== 'g|') return null;
    const [, ang, a, b] = f.split('|');
    return {ang: +ang, a, b};
}

/** The style of an element: its own fields over those of its role. */
export function styleOf(el, sc) {
    const r = sc.roles[el.role || (el.t === 'shape' ? 'body' : 'body')] || sc.roles.body;
    const shapeText = el.t === 'shape' ? {
        align: 'center',
        va: 'middle',
        color: el.fill && el.fill !== '@surface' && el.fill !== '@bg' ? '@onaccent' : '@fg',
        size: 20 * sc.s
    } : null;
    const b = {...r, ...(shapeText || {})};
    const get = (k) => el[k] ?? b[k];
    return {
        font: get('font'),
        size: get('size'),
        bold: get('bold') ? 1 : 0,
        italic: get('italic') ? 1 : 0,
        under: el.under ? 1 : 0,
        caps: get('caps') ? 1 : 0,
        color: get('color'),
        align: get('align'),
        va: get('va'),
        lh: get('lh'),
        ls: get('ls') || 0,
        pad: el.pad ?? (el.t === 'shape' ? 12 * sc.s : 0)
    };
}

export function fontFaces() {
    const st = ['regular', 'bold', 'italic', 'bolditalic'];
    return Object.entries(FONTS).map(([id, [name, , n]]) => st.slice(0, n).map((k) => `@font-face{font-family:"SP ${name}";src:url("fonts/${id}-${k}.woff") format("woff");font-weight:${k.startsWith('bold') ? 700 : 400};font-style:${k.endsWith('italic') ? 'italic' : 'normal'};font-display:swap}`).join('')).join('');
}
