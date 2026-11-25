/*
 * Arrival of who comes from the old address of a project (saveriomorelli.com/projects/…): what the project had saved in
 * that browser (games, records, preferences) is copied here, once, and then the project opens.
 * Only from that site, only the keys of that project, never over something already saved here.
 */
(function () {
    var KEYS = {
        chess: 'chess_',
        opennewsletter: 'on_',
        thinkhop: 'thinkhop.',
        foodtrack: 'ft.',
        sudoku: 'sudoku.',
        mycurriculum: 'mc_',
        forkville: 'forkville-',
        'prism-mine': 'pm_',
        fucina: 'fc.',
        'connect-four': 'c4_',
        letterhop: 'letterhop.',
        giftwise: 'gw.',
        'sea-battle': 'sb_',
        faceguess: 'fg_'
    };
    var to = '/', d = {};
    try {
        d = JSON.parse(decodeURIComponent(location.hash.slice(1))) || {};
    } catch (e) {
    }
    var prefix = Object.prototype.hasOwnProperty.call(KEYS, d.app) ? KEYS[d.app] : '';
    if (prefix) {
        to = '/' + d.app + '/';
        try {
            var u = new URL(String(d.to || ''), location.origin);
            if (u.origin === location.origin && u.pathname.indexOf(to) === 0) to = u.pathname + u.search + u.hash;
        } catch (e) {
        }
        try {
            var from = document.referrer ? new URL(document.referrer).origin : '', done = 'illerom-moved.' + d.app;
            if ((from === 'https://www.saveriomorelli.com' || from === 'https://fucina.saveriomorelli.com') && !localStorage.getItem(done)) {
                Object.keys(d.data || {}).forEach(function (k) {
                    if (k.indexOf(prefix) === 0 && typeof d.data[k] === 'string' && localStorage.getItem(k) === null) localStorage.setItem(k, d.data[k]);
                });
                localStorage.setItem(done, '1');
            }
        } catch (e) {
        }
    }
    document.getElementById('go').href = to;
    location.replace(to);
})();
