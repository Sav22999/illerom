<?php
/**
 * SavAwards — the catalogue: products and their scores, criteria, categories, alternatives; the awards editions, their
 * categories, nominees and winners; certificates. What the API and the public pages send out is shaped here.
 */

declare(strict_types=1);

const PLATFORMS = ['web', 'android', 'ios', 'windows', 'macos', 'linux'];
const PRICING = ['free', 'freemium', 'paid', 'donation'];
/** Where a product is based, as a badge: the European Union, EFTA, the United Kingdom, the rest of Europe, or the world. */
const REGION_EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const REGION_EFTA = ['IS', 'LI', 'NO', 'CH'];
const REGION_UK = ['GB'];
const REGION_EUROPE = ['AL', 'AD', 'BA', 'BY', 'MD', 'MC', 'ME', 'MK', 'RS', 'SM', 'UA', 'VA', 'XK'];
/** "Made in Europe": all of them. */
const EUROPE = [...REGION_EU, ...REGION_EFTA, ...REGION_UK, ...REGION_EUROPE];
/** Badges a product can carry besides open source, self-hosting and the price (green = runs on renewable energy). */
const FEATURES = ['green', 'e2ee', 'no_ads', 'no_tracking', 'by_author']; // by_author: made by the author of SavAwards (disclosed on the page)

/** Common licences, SPDX ids, then the two that are not one. */
const LICENCES = ['AGPL-3.0', 'GPL-3.0', 'GPL-2.0', 'LGPL-3.0', 'LGPL-2.1', 'MPL-2.0', 'EUPL-1.2', 'Apache-2.0', 'MIT', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC',
    'CC0-1.0', 'Unlicense', 'Zlib', 'EPL-2.0', 'CECILL-B', 'BUSL-1.1', 'SSPL-1.0', 'Elastic-2.0', 'Proprietary', 'Mixed'];
/** Licences of open-source software (OSI-approved): choosing one switches "open source" on. */
const OPEN_LICENCES = ['AGPL-3.0', 'GPL-3.0', 'GPL-2.0', 'LGPL-3.0', 'LGPL-2.1', 'MPL-2.0', 'EUPL-1.2', 'Apache-2.0', 'MIT', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC', 'CC0-1.0', 'Unlicense', 'Zlib', 'EPL-2.0', 'CECILL-B'];
/** The well-known services products are alternatives to, offered when choosing (the names already used are added to them). */
const MAINSTREAM = ['Google Search', 'Bing', 'Gmail', 'Outlook', 'Yahoo Mail', 'iCloud Mail', 'Google Docs', 'Microsoft Word', 'Google Sheets', 'Microsoft Excel',
    'Google Slides', 'Microsoft PowerPoint', 'Microsoft OneNote', 'Evernote', 'Notion', 'Google Keep', 'Apple Notes', 'Google Drive', 'OneDrive', 'Dropbox', 'iCloud Drive',
    'Google Photos', 'Google Chrome', 'Microsoft Edge', 'Safari', 'Adobe Photoshop', 'Adobe Illustrator', 'Adobe Lightroom', 'Adobe Premiere Pro', 'Adobe Acrobat',
    'Canva', 'Figma', 'ChatGPT', 'Claude', 'Gemini', 'Microsoft Copilot', 'WhatsApp', 'iMessage', 'Telegram', 'Facebook Messenger', 'Signal', 'Slack', 'Microsoft Teams',
    'Zoom', 'Google Meet', 'Google Calendar', 'Google Maps', 'Apple Maps', 'Google Translate', 'Google Forms', 'Microsoft Forms', 'Typeform', 'SurveyMonkey',
    '1Password', 'LastPass', 'Google Authenticator', 'Google Analytics', 'GitHub', 'Trello', 'Asana', 'Mailchimp', 'X (Twitter)', 'Facebook', 'Instagram', 'YouTube',
    'Windows', 'macOS', 'Android', 'iOS', 'Grammarly', 'NordVPN'];

function region(string $country): string
{
    if ($country === '') return '';
    if (in_array($country, REGION_EU, true)) return 'eu';
    if (in_array($country, REGION_EFTA, true)) return 'efta';
    if (in_array($country, REGION_UK, true)) return 'uk';
    if (in_array($country, REGION_EUROPE, true)) return 'europe';
    return 'world';
}
/** What a member may ask to change on a product page. */
const REQUEST_FIELDS = ['tagline', 'review', 'pros', 'cons', 'website', 'source_url', 'licence', 'pricing', 'country', 'features', 'platforms', 'alternatives_to', 'tested_on', 'score', 'other'];
const CERT_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: no I, L, O, U

function lines(?string $s): array
{
    return array_values(array_filter(array_map('trim', explode("\n", (string)$s)), 'strlen'));
}

function csv_list(?string $s): array
{
    return array_values(array_filter(array_map('trim', explode(',', (string)$s)), 'strlen'));
}

/** "Google Docs" -> "google-docs": the key of an "alternative to" page. */
function alt_key(string $name): string
{
    return slugify($name);
}

function category_out(?array $c): ?array
{
    if (!$c || empty($c['id'])) return null;
    return ['id' => (int)$c['id'], 'slug' => $c['slug'], 'name' => pick($c['name_it'], $c['name_en']), 'name_it' => $c['name_it'], 'name_en' => $c['name_en'], 'icon' => $c['icon'], 'sort' => (int)$c['sort']];
}

function categories(): array
{
    return array_map('category_out', q('SELECT * FROM ' . t('categories') . ' ORDER BY sort, id')->fetchAll());
}

function criteria(bool $all = false): array
{
    return q('SELECT * FROM ' . t('criteria') . ($all ? '' : ' WHERE active = 1') . ' ORDER BY sort, id')->fetchAll();
}

function criterion_out(array $c): array
{
    return ['id' => (int)$c['id'], 'slug' => $c['slug'], 'name' => pick($c['name_it'], $c['name_en']), 'desc' => pick($c['desc_it'], $c['desc_en']), 'icon' => $c['icon'],
        'name_it' => $c['name_it'], 'name_en' => $c['name_en'], 'desc_it' => (string)$c['desc_it'], 'desc_en' => (string)$c['desc_en'], 'sort' => (int)$c['sort'], 'active' => (bool)$c['active']];
}

function logo_url(array $p): ?string
{
    return !empty($p['logo_mime']) ? 'api/?r=pub.logo&id=' . (int)$p['id'] . '&v=' . substr(md5((string)$p['updated_at']), 0, 6) : null;
}

const PRODUCT_LIST_COLS = 'p.id, p.slug, p.name, p.category_id, p.tagline_it, p.tagline_en, p.open_source, p.pricing, p.country, p.self_host, p.platforms, p.alternatives_to, p.features,
    p.licence, p.status, p.score, p.logo_mime, p.updated_at, p.reviewed_at, p.created_at, c.slug AS c_slug, c.name_it AS c_it, c.name_en AS c_en, c.icon AS c_icon';

/** A product as it appears in lists and cards. */
function product_brief(array $p, array $extra = []): array
{
    return [
        'id' => (int)$p['id'], 'slug' => $p['slug'], 'name' => $p['name'],
        'category' => $p['category_id'] ? ['slug' => $p['c_slug'], 'name' => pick($p['c_it'], $p['c_en']), 'icon' => $p['c_icon']] : null,
        'tagline' => pick($p['tagline_it'], $p['tagline_en']),
        'score' => $p['score'] !== null ? round((float)$p['score'], 1) : null,
        'openSource' => (bool)$p['open_source'], 'pricing' => $p['pricing'], 'licence' => $p['licence'],
        'country' => $p['country'], 'region' => region((string)$p['country']), 'europe' => in_array($p['country'], EUROPE, true), 'selfHost' => (bool)$p['self_host'],
        'freePlan' => in_array($p['pricing'], ['free', 'freemium', 'donation'], true), 'features' => array_values(array_intersect(FEATURES, csv_list($p['features'] ?? ''))),
        'platforms' => csv_list($p['platforms']), 'alternativesTo' => csv_list($p['alternatives_to']),
        'logo' => logo_url($p), 'status' => $p['status'], 'reviewed' => iso($p['reviewed_at']),
    ] + $extra;
}

/** The published products (or all, for the staff), filtered: q, cat, europe, os, free, selfhost, green, rated, platform, alt, ids; sort score|name|recent|community. */
function product_list(array $f, bool $staff = false, int $limit = 300): array
{
    $where = [];
    $args = [];
    if (!$staff) $where[] = "p.status = 'published'";
    if (($f['q'] ?? '') !== '') {
        $where[] = '(p.name LIKE ? OR p.tagline_it LIKE ? OR p.tagline_en LIKE ? OR p.alternatives_to LIKE ?)';
        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], (string)$f['q']) . '%';
        array_push($args, $like, $like, $like, $like);
    }
    if (($f['cat'] ?? '') !== '') {
        $where[] = 'c.slug = ?';
        $args[] = (string)$f['cat'];
    }
    if (!empty($f['europe'])) $where[] = 'p.country IN (' . implode(',', array_map(fn($c) => "'$c'", EUROPE)) . ')';
    if (!empty($f['os'])) $where[] = 'p.open_source = 1';
    if (!empty($f['free'])) $where[] = "p.pricing IN ('free','freemium','donation')";
    if (!empty($f['selfhost'])) $where[] = 'p.self_host = 1';
    if (!empty($f['green'])) $where[] = "FIND_IN_SET('green', p.features)";
    if (!empty($f['rated'])) $where[] = "EXISTS (SELECT 1 FROM " . t('reviews') . " r WHERE r.product_id = p.id AND r.status = 'visible')";
    if (in_array($f['platform'] ?? '', PLATFORMS, true)) {
        $where[] = 'FIND_IN_SET(?, p.platforms)';
        $args[] = $f['platform'];
    }
    if (!empty($f['ids'])) {
        $ids = array_slice(array_map('intval', (array)$f['ids']), 0, 300);
        $where[] = 'p.id IN (' . ($ids ? implode(',', $ids) : '0') . ')';
    }
    $sort = ['name' => 'p.name', 'recent' => 'COALESCE(p.reviewed_at, p.created_at) DESC', 'community' => 'cavg IS NULL, cavg DESC, p.name'][$f['sort'] ?? ''] ?? 'p.score IS NULL, p.score DESC, p.name';
    $sql = 'SELECT ' . PRODUCT_LIST_COLS . ', (SELECT AVG(r.rating) FROM ' . t('reviews') . " r WHERE r.product_id = p.id AND r.status = 'visible') AS cavg,
        (SELECT COUNT(*) FROM " . t('reviews') . " r WHERE r.product_id = p.id AND r.status = 'visible') AS cn,
        (SELECT COUNT(*) FROM " . t('nominees') . ' n JOIN ' . t('award_categories') . ' ac ON ac.id = n.category_id JOIN ' . t('editions') . " e ON e.id = ac.edition_id
            WHERE n.product_id = p.id AND n.place = 1 AND e.status = 'published') AS wins"
        . ($staff ? ', (SELECT COUNT(*) FROM ' . t('shots') . ' sh WHERE sh.product_id = p.id) AS nshots' : '') . "
        FROM " . t('products') . ' p LEFT JOIN ' . t('categories') . ' c ON c.id = p.category_id'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY $sort LIMIT " . (int)$limit;
    $rows = q($sql, $args)->fetchAll();
    $alt = alt_key((string)($f['alt'] ?? ''));
    $out = [];
    foreach ($rows as $p) {
        if ($alt !== '' && !in_array($alt, array_map('alt_key', csv_list($p['alternatives_to'])), true)) continue;
        $out[] = product_brief($p, ['community' => $p['cn'] ? ['avg' => round((float)$p['cavg'], 1), 'n' => (int)$p['cn']] : null, 'wins' => (int)$p['wins']]
            + ($staff ? ['shots' => (int)$p['nshots'], 'updated' => iso($p['updated_at'])] : []));
    }
    return $out;
}

function product_row(string $slugOrId, bool $staff = false): ?array
{
    $col = ctype_digit($slugOrId) ? 'p.id' : 'p.slug';
    $p = q('SELECT p.*, c.slug AS c_slug, c.name_it AS c_it, c.name_en AS c_en, c.icon AS c_icon FROM ' . t('products') . ' p LEFT JOIN ' . t('categories') . " c ON c.id = p.category_id WHERE $col = ?", [$slugOrId])->fetch();
    if (!$p || (!$staff && $p['status'] !== 'published')) return null;
    return $p;
}

/** The scores of a product, one per active criterion (null when not given or not applicable). */
function product_scores(int $pid): array
{
    $rows = q('SELECT c.*, s.score, s.note_it, s.note_en FROM ' . t('criteria') . ' c LEFT JOIN ' . t('scores') . ' s ON s.criterion_id = c.id AND s.product_id = ?
        WHERE c.active = 1 ORDER BY c.sort, c.id', [$pid])->fetchAll();
    return array_map(fn($r) => ['criterion' => (int)$r['id'], 'slug' => $r['slug'], 'name' => pick($r['name_it'], $r['name_en']), 'icon' => $r['icon'],
        'score' => $r['score'] !== null ? (float)$r['score'] : null, 'note' => pick($r['note_it'], $r['note_en']), 'note_it' => (string)$r['note_it'], 'note_en' => (string)$r['note_en']], $rows);
}

/** The total: the mean of the scores given, on the active criteria. */
function recompute_score(int $pid): ?float
{
    $avg = q('SELECT AVG(s.score) FROM ' . t('scores') . ' s JOIN ' . t('criteria') . ' c ON c.id = s.criterion_id AND c.active = 1 WHERE s.product_id = ? AND s.score IS NOT NULL', [$pid])->fetchColumn();
    $v = $avg === null || $avg === false ? null : round((float)$avg, 2);
    q('UPDATE ' . t('products') . ' SET score = ? WHERE id = ?', [$v, $pid]);
    return $v;
}

function recompute_all_scores(): void
{
    foreach (q('SELECT id FROM ' . t('products'))->fetchAll(PDO::FETCH_COLUMN) as $id) recompute_score((int)$id);
}

/** The screenshots of a product, in their order (the pictures themselves are served by pub.shot). */
function product_shots(int $pid): array
{
    return array_map(fn($s) => ['id' => (int)$s['id'], 'url' => 'api/?r=pub.shot&id=' . (int)$s['id'], 'w' => (int)$s['width'], 'h' => (int)$s['height'], 'caption' => $s['caption']],
        q('SELECT id, width, height, caption FROM ' . t('shots') . ' WHERE product_id = ? ORDER BY sort, id', [$pid])->fetchAll());
}

/** The awards a product has won or was shortlisted for, in published editions. */
function product_awards(int $pid): array
{
    $rows = q('SELECT e.year, ac.id AS cat, ac.slug, ac.name_it, ac.name_en, ac.kind, n.place, n.motivation_it, n.motivation_en, cert.code, cert.revoked_at
        FROM ' . t('nominees') . ' n JOIN ' . t('award_categories') . ' ac ON ac.id = n.category_id JOIN ' . t('editions') . ' e ON e.id = ac.edition_id
        LEFT JOIN ' . t('certificates') . " cert ON cert.category_id = ac.id AND cert.product_id = n.product_id
        WHERE n.product_id = ? AND e.status = 'published' ORDER BY e.year DESC, n.place IS NULL, n.place, ac.sort", [$pid])->fetchAll();
    return array_map(fn($r) => ['year' => (int)$r['year'], 'category' => (int)$r['cat'], 'award' => pick($r['name_it'], $r['name_en']), 'kind' => $r['kind'],
        'place' => $r['place'] !== null ? (int)$r['place'] : null, 'motivation' => pick($r['motivation_it'], $r['motivation_en']),
        'certificate' => $r['code'] && !$r['revoked_at'] ? cert_display($r['code']) : null], $rows);
}

/** Everything about one product. $staff: also the texts in both languages, for editing. */
function product_full(array $p, ?array $me, bool $staff = false): array
{
    $pid = (int)$p['id'];
    $out = product_brief($p) + [
            'review' => pick($p['review_it'], $p['review_en']),
            'pros' => lines(pick($p['pros_it'], $p['pros_en'])), 'cons' => lines(pick($p['cons_it'], $p['cons_en'])),
            'website' => $p['website'], 'sourceUrl' => $p['source_url'],
            'tested' => ['on' => lines($p['tested_on']), 'version' => $p['tested_version'], 'at' => $p['tested_at']],
            'scores' => product_scores($pid),
            'updated' => iso($p['updated_at']), 'created' => iso($p['created_at']),
            'awards' => product_awards($pid),
            'shots' => product_shots($pid),
            'history' => array_map(fn($h) => ['criterion' => $h['cname'] !== null ? pick($h['cname'], $h['cname_en']) : null, 'old' => $h['old_score'] !== null ? (float)$h['old_score'] : null,
                'new' => $h['new_score'] !== null ? (float)$h['new_score'] : null, 'at' => iso($h['created_at'])],
                q('SELECT h.*, c.name_it AS cname, c.name_en AS cname_en FROM ' . t('score_history') . ' h LEFT JOIN ' . t('criteria') . ' c ON c.id = h.criterion_id
                    WHERE h.product_id = ? ORDER BY h.id DESC LIMIT 40', [$pid])->fetchAll()),
            'favs' => (int)q('SELECT COUNT(*) FROM ' . t('favorites') . ' WHERE product_id = ?', [$pid])->fetchColumn(),
        ];
    $c = q('SELECT AVG(rating) a, COUNT(*) n FROM ' . t('reviews') . " WHERE product_id = ? AND status = 'visible'", [$pid])->fetch();
    $out['community'] = (int)$c['n'] ? ['avg' => round((float)$c['a'], 1), 'n' => (int)$c['n']] : null;
    if ($staff) {
        foreach (['tagline_it', 'tagline_en', 'review_it', 'review_en', 'pros_it', 'pros_en', 'cons_it', 'cons_en', 'tested_on', 'tested_version', 'tested_at', 'website', 'source_url', 'licence'] as $k) $out['raw'][$k] = (string)$p[$k];
        $out['raw']['category_id'] = $p['category_id'] !== null ? (int)$p['category_id'] : null;
        $out['raw']['alternatives_to'] = (string)$p['alternatives_to'];
        $out['raw']['platforms'] = (string)$p['platforms'];
        $out['raw']['features'] = (string)$p['features'];
    }
    if ($me) {
        $out['mine'] = [
            'fav' => (bool)q('SELECT 1 FROM ' . t('favorites') . ' WHERE user_id = ? AND product_id = ?', [$me['id'], $pid])->fetchColumn(),
            'canEdit' => can_edit_product($me, $pid),
        ];
    }
    return $out;
}

/** Reviews of the members (the most useful first), with the name of who wrote them; hidden ones only for the staff. */
function product_reviews(int $pid, ?array $me, bool $staff): array
{
    $rows = q('SELECT r.*, u.name AS uname, (SELECT COUNT(*) FROM ' . t('review_votes') . ' v WHERE v.review_id = r.id) AS helpful'
        . ($me ? ', (SELECT 1 FROM ' . t('review_votes') . ' v WHERE v.review_id = r.id AND v.user_id = ' . (int)$me['id'] . ') AS voted' : ', NULL AS voted')
        . ' FROM ' . t('reviews') . ' r JOIN ' . t('users') . ' u ON u.id = r.user_id WHERE r.product_id = ?' . ($staff ? '' : " AND (r.status = 'visible'" . ($me ? ' OR r.user_id = ' . (int)$me['id'] : '') . ')')
        . ' ORDER BY helpful DESC, r.updated_at DESC LIMIT 200', [$pid])->fetchAll();
    return array_map(fn($r) => ['id' => (int)$r['id'], 'user' => $r['uname'], 'mine' => $me && (int)$r['user_id'] === $me['id'], 'rating' => (int)$r['rating'], 'title' => $r['title'],
        'body' => (string)$r['body'], 'usedOn' => $r['used_on'], 'helpful' => (int)$r['helpful'], 'voted' => (bool)$r['voted'], 'hidden' => $r['status'] !== 'visible',
        'created' => iso($r['created_at']), 'updated' => iso($r['updated_at'])], $rows);
}

function product_comments(int $pid, ?array $me, bool $staff): array
{
    $rows = q('SELECT c.*, u.name AS uname, u.role AS urole FROM ' . t('comments') . ' c JOIN ' . t('users') . ' u ON u.id = c.user_id WHERE c.product_id = ?'
        . ($staff ? '' : " AND c.status = 'visible'") . ' ORDER BY c.id ASC LIMIT 500', [$pid])->fetchAll();
    return array_map(fn($c) => ['id' => (int)$c['id'], 'user' => $c['uname'], 'staff' => (int)$c['urole'] >= ROLE_MOD, 'mine' => $me && (int)$c['user_id'] === $me['id'],
        'body' => $c['body'], 'hidden' => $c['status'] !== 'visible', 'created' => iso($c['created_at'])], $rows);
}

/** Every "alternative to" named by the published products, with how many there are. */
function alternatives_index(): array
{
    $count = [];
    $names = [];
    foreach (q('SELECT alternatives_to FROM ' . t('products') . " WHERE status = 'published' AND alternatives_to <> ''")->fetchAll(PDO::FETCH_COLUMN) as $s) {
        foreach (csv_list($s) as $name) {
            $k = alt_key($name);
            if ($k === '') continue;
            $count[$k] = ($count[$k] ?? 0) + 1;
            $names[$k] = $names[$k] ?? $name;
        }
    }
    arsort($count);
    $out = [];
    foreach ($count as $k => $n) $out[] = ['key' => $k, 'name' => $names[$k], 'n' => $n];
    return $out;
}

// ---------- awards

function edition_out(array $e, bool $staff = false): array
{
    return ['id' => (int)$e['id'], 'year' => (int)$e['year'], 'title' => pick($e['title_it'], $e['title_en']) ?: ('SavAwards ' . $e['year']), 'intro' => pick($e['intro_it'], $e['intro_en']),
            'status' => $e['status'], 'voteUntil' => iso($e['vote_until']), 'published' => iso($e['published_at']),
            'votingOpen' => $e['status'] === 'voting' && (!$e['vote_until'] || strtotime($e['vote_until'] . ' UTC') > time())]
        + ($staff ? ['raw' => ['title_it' => $e['title_it'], 'title_en' => $e['title_en'], 'intro_it' => (string)$e['intro_it'], 'intro_en' => (string)$e['intro_en']]] : []);
}

/** An edition with its categories, nominees, winners and (for People's choice) the votes. */
function edition_full(array $e, ?array $me, bool $staff = false): array
{
    $out = edition_out($e, $staff);
    $cats = q('SELECT * FROM ' . t('award_categories') . ' WHERE edition_id = ? ORDER BY sort, id', [$e['id']])->fetchAll();
    $showWinners = $staff || $e['status'] === 'published';
    $out['categories'] = [];
    foreach ($cats as $c) {
        $noms = q('SELECT n.*, ' . PRODUCT_LIST_COLS . ', (SELECT COUNT(*) FROM ' . t('votes') . ' v WHERE v.category_id = n.category_id AND v.product_id = n.product_id) AS votes,
            cert.code AS cert_code, cert.revoked_at AS cert_revoked
            FROM ' . t('nominees') . ' n JOIN ' . t('products') . ' p ON p.id = n.product_id LEFT JOIN ' . t('categories') . ' c ON c.id = p.category_id
            LEFT JOIN ' . t('certificates') . ' cert ON cert.category_id = n.category_id AND cert.product_id = n.product_id
            WHERE n.category_id = ? ORDER BY n.place IS NULL, n.place, p.name', [$c['id']])->fetchAll();
        $myVote = $me ? q('SELECT product_id FROM ' . t('votes') . ' WHERE category_id = ? AND user_id = ?', [$c['id'], $me['id']])->fetchColumn() : false;
        $out['categories'][] = [
            'id' => (int)$c['id'], 'slug' => $c['slug'], 'name' => pick($c['name_it'], $c['name_en']), 'desc' => pick($c['desc_it'], $c['desc_en']), 'kind' => $c['kind'], 'sort' => (int)$c['sort'],
            'myVote' => $myVote ? (int)$myVote : null,
            'nominees' => array_map(fn($n) => product_brief($n, [
                    'place' => $showWinners && $n['place'] !== null ? (int)$n['place'] : null,
                    'motivation' => $showWinners ? pick($n['motivation_it'], $n['motivation_en']) : '',
                    'votes' => $c['kind'] === 'public' && ($staff || $e['status'] === 'published') ? (int)$n['votes'] : null,
                    'certificate' => $showWinners && $n['cert_code'] && !$n['cert_revoked'] ? cert_display($n['cert_code']) : null,
                ] + ($staff ? ['raw' => ['motivation_it' => (string)$n['motivation_it'], 'motivation_en' => (string)$n['motivation_en']], 'certRevoked' => (bool)$n['cert_revoked'], 'certCode' => $n['cert_code'] ? cert_display($n['cert_code']) : null] : [])), $noms),
        ] + ($staff ? ['raw' => ['name_it' => $c['name_it'], 'name_en' => $c['name_en'], 'desc_it' => (string)$c['desc_it'], 'desc_en' => (string)$c['desc_en']]] : []);
    }
    return $out;
}

// ---------- certificates

/** SA + year + 8 random characters (about 10^12 possibilities a year): SA2026K7M3Q9TX, shown as SA-2026-K7M3-Q9TX. */
function cert_new_code(int $year): string
{
    for ($i = 0; $i < 20; $i++) {
        $r = '';
        for ($j = 0; $j < 8; $j++) $r .= CERT_ALPHABET[random_int(0, 31)];
        $code = 'SA' . $year . $r;
        if (!q('SELECT 1 FROM ' . t('certificates') . ' WHERE code = ?', [$code])->fetchColumn()) return $code;
    }
    throw new RuntimeException('no free certificate code');
}

/** Any way of writing a code (dashes, spaces, small letters, O for 0…) to the stored form. */
function cert_normalise(string $s): string
{
    $s = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $s) ?? '');
    return substr($s, 0, 2) . strtr(substr($s, 2), ['O' => '0', 'I' => '1', 'L' => '1']);
}

function cert_display(string $code): string
{
    return preg_match('/^SA(\d{4})([0-9A-Z]{4})([0-9A-Z]{4})$/', $code, $m) ? "SA-$m[1]-$m[2]-$m[3]" : $code;
}

function cert_find(string $any): ?array
{
    $code = cert_normalise($any);
    if (!preg_match('/^SA\d{4}[0-9A-Z]{8}$/', $code)) return null;
    $c = q('SELECT * FROM ' . t('certificates') . ' WHERE code = ?', [$code])->fetch();
    return $c ?: null;
}

/** The public address of a certificate, with the name of the product in it (the name is only for people: the code is what counts). */
function cert_url(array $c): string
{
    return app_url() . 'c/' . cert_display($c['code']) . '/' . rawurlencode($c['product_slug']);
}

function place_name(int $place, string $l): string
{
    $it = $l === 'it';
    return [1 => $it ? 'Vincitore' : 'Winner', 2 => $it ? 'Secondo posto' : 'Runner-up', 3 => $it ? 'Terzo posto' : 'Third place'][$place] ?? ($it ? 'Finalista' : 'Finalist');
}

/**
 * The starter catalogue (lib/seed/catalogue.json): European alternatives added as drafts, without scores, to be checked
 * one by one before publishing. Products already there (same slug or name) are left as they are. Returns [added, skipped].
 */
function import_starter(?int $uid): array
{
    $seed = json_decode((string)@file_get_contents(__DIR__ . '/seed/catalogue.json'), true);
    if (!is_array($seed['products'] ?? null)) throw new RuntimeException('no starter catalogue');
    // the categories the catalogue needs, created when missing
    $cats = is_array($seed['categories'] ?? null) ? $seed['categories'] : [];
    foreach ($cats as $slug => [$it, $en, $ic]) {
        if (!q('SELECT 1 FROM ' . t('categories') . ' WHERE slug = ?', [$slug])->fetchColumn()) q('INSERT INTO ' . t('categories') . ' (slug, name_it, name_en, icon, sort) VALUES (?,?,?,?,?)', [$slug, $it, $en, $ic, 200]);
    }
    $catId = q('SELECT slug, id FROM ' . t('categories'))->fetchAll(PDO::FETCH_KEY_PAIR);
    $added = 0;
    $skipped = 0;
    db()->beginTransaction();
    foreach ($seed['products'] as $x) {
        $slug = slugify((string)$x['name']);
        if (q('SELECT 1 FROM ' . t('products') . ' WHERE slug = ? OR name = ?', [$slug, (string)$x['name']])->fetchColumn()) {
            $skipped++;
            continue;
        }
        $country = strtoupper((string)($x['country'] ?? ''));
        q('INSERT INTO ' . t('products') . ' (slug, name, category_id, tagline_en, website, source_url, licence, open_source, pricing, country, self_host, platforms, features, alternatives_to, status, created_by, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$slug, mb_substr((string)$x['name'], 0, 90), $catId[$x['category'] ?? ''] ?? null, mb_substr((string)($x['tagline'] ?? ''), 0, 200),
            clean_url((string)($x['website'] ?? '')), clean_url((string)($x['source_url'] ?? '')), in_array($x['licence'] ?? '', LICENCES, true) ? $x['licence'] : '',
            !empty($x['open_source']) ? 1 : 0, in_array($x['pricing'] ?? '', PRICING, true) ? $x['pricing'] : 'free', preg_match('/^[A-Z]{2}$/', $country) ? $country : '', !empty($x['self_host']) ? 1 : 0,
            implode(',', array_values(array_intersect(PLATFORMS, (array)($x['platforms'] ?? [])))), implode(',', array_values(array_intersect(FEATURES, (array)($x['features'] ?? [])))),
            implode(', ', array_slice(array_map('strval', (array)($x['alternatives_to'] ?? [])), 0, 12)), 'draft', $uid, now_utc(), now_utc()]);
        $added++;
    }
    audit($uid, 'catalogue.import', 'products', 0, ['added' => $added, 'skipped' => $skipped]);
    db()->commit();
    return [$added, $skipped];
}
