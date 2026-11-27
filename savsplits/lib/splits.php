<?php
/**
 * SavSplits — groups, people, expenses, balances and who pays whom.
 *
 * Money is never a float: every amount is an integer of minor units (cents) of its currency, and every division gives
 * out the units that are left one by one (largest remainder, then the order of the people), so that the parts always add
 * up to the whole and the same expense always gives the same parts.
 *
 * An expense is saved with what each person paid (paid) and owes (alloc) in minor units of the currency of the group:
 * a balance is Σ paid − Σ alloc, positive for who should receive, negative for who should give, 0 in total.
 *   expense   payers paid it, the split says who it was for
 *   transfer  one person gave money to another (a payback): paid by the first, "owed" by the second
 *   income    the group received money (a refund, a deposit back): whoever got it holds it for those of the split
 *
 * Splits (split.mode): equal (among the people chosen), shares (2 for me, 1 for you…), percent, exact (amounts of the
 * expense that must add up to it) and table (by the shares of a table of the group: the thousandths of a condominium…).
 *
 * Access: the account that owns the group, the accounts joined to one of its people (as editor or viewer), and whoever
 * has its link (code), without an account, to look or also to add (link_role).
 *
 * A personal group (kind "personal") is for private expenses: one person, its owner, no link, nobody else can join, so
 * there is never a balance to settle. Its expenses enter "My spending" with the shares of the other groups (lib/budget.php).
 */

declare(strict_types=1);

const GROUP_KINDS = ['generic', 'trip', 'home', 'couple', 'event', 'team', 'condo', 'personal'];
const GROUP_COLORS = ['#1a7f37', '#0b7a87', '#1f56d1', '#6a2cf0', '#c2307a', '#c93a2f', '#e0532f', '#0f8a63', '#4a5875', '#7a5c3e'];
const GROUP_ICONS = ['', 'user', 'wallet', 'plane', 'house', 'heart', 'party-popper', 'users', 'building', 'utensils', 'car', 'tent', 'gift', 'shopping-cart', 'graduation-cap', 'dumbbell', 'music', 'briefcase', 'coffee', 'globe', 'star'];
const CATEGORIES = ['', 'food', 'groceries', 'drinks', 'transport', 'fuel', 'stay', 'rent', 'bills', 'shopping', 'fun', 'tickets', 'health', 'gifts', 'home', 'maintenance', 'cleaning', 'insurance', 'fees', 'other'];
const REPEATS = ['', 'week', 'month', 'quarter', 'year'];
const MAX_REPEAT_COPIES = 60;      // copies made in one go when a group is opened after a long time

/** The currencies, with their minor units (ISO 4217). The ones of the European Central Bank get a rate by themselves. */
const CURRENCIES = [
    'EUR' => 2, 'USD' => 2, 'GBP' => 2, 'CHF' => 2, 'JPY' => 0, 'SEK' => 2, 'NOK' => 2, 'DKK' => 2, 'ISK' => 0, 'PLN' => 2, 'CZK' => 2, 'HUF' => 2,
    'RON' => 2, 'BGN' => 2, 'TRY' => 2, 'AUD' => 2, 'CAD' => 2, 'NZD' => 2, 'CNY' => 2, 'HKD' => 2, 'SGD' => 2, 'KRW' => 0, 'INR' => 2, 'IDR' => 2,
    'MYR' => 2, 'PHP' => 2, 'THB' => 2, 'ILS' => 2, 'ZAR' => 2, 'BRL' => 2, 'MXN' => 2,
    'AED' => 2, 'ALL' => 2, 'ARS' => 2, 'CLP' => 0, 'COP' => 2, 'EGP' => 2, 'GEL' => 2, 'KES' => 2, 'MAD' => 2, 'RSD' => 2, 'SAR' => 2, 'TND' => 3,
    'TWD' => 2, 'UAH' => 2, 'VND' => 0,
];
const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

// ------------------------------------------------------------------ database helpers

function q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function new_code(string $table, string $col, int $len = 10): string
{
    $abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    do {
        $p = '';
        for ($i = 0; $i < $len; $i++) $p .= $abc[random_int(0, strlen($abc) - 1)];
    } while (q('SELECT 1 FROM ' . t($table) . " WHERE $col = ?", [$p])->fetchColumn());
    return $p;
}

function valid_code($v, int $len = 10): string
{
    return is_string($v) && preg_match('/^[a-z0-9]{' . $len . '}$/', $v) ? $v : '';
}

/** A link code: 16 characters, about 80 bits, not to be guessed. */
function new_link_code(): string
{
    $abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $p = '';
        for ($i = 0; $i < 16; $i++) $p .= $abc[random_int(0, strlen($abc) - 1)];
    } while (q('SELECT 1 FROM ' . t('split_groups') . ' WHERE link_code = ?', [$p])->fetchColumn());
    return $p;
}

function valid_link($v): string
{
    return is_string($v) && preg_match('/^[A-Za-z0-9]{16}$/', $v) ? $v : '';
}

function jdec(?string $s): array
{
    $x = json_decode((string)$s, true);
    return is_array($x) ? $x : [];
}

function valid_day($v): ?string
{
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return null;
    return (int)$m[1] >= 1970 && (int)$m[1] <= 2200 ? $v : null;
}

function valid_currency($v): string
{
    $v = strtoupper(is_string($v) ? $v : '');
    return isset(CURRENCIES[$v]) ? $v : '';
}

/** $src[$key] when it is one of $list (strict), otherwise $default. */
function pick(array $src, string $key, array $list, string $default = ''): string
{
    $v = $src[$key] ?? null;
    return is_string($v) && in_array($v, $list, true) ? $v : $default;
}

function valid_color($v, string $fallback = GROUP_COLORS[0]): string
{
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : $fallback;
}

// ------------------------------------------------------------------ the profile of an account

function profile(array $u): array
{
    $p = q('SELECT * FROM ' . t('split_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('split_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], json_out((object)[]), now_utc()]);
        $p = q('SELECT * FROM ' . t('split_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    return jdec($p['prefs'] ?? '');
}

// ------------------------------------------------------------------ money

/** Splits $total (an integer, also negative) by $weights [key => number ≥ 0]: the parts add up to $total exactly. */
function apportion(int $total, array $weights): array
{
    $keys = array_keys(array_filter($weights, fn($w) => $w > 0));
    if (!$keys) return [];
    $sum = 0.0;
    foreach ($keys as $k) $sum += (float)$weights[$k];
    $sign = $total < 0 ? -1 : 1;
    $abs = abs($total);
    $out = [];
    $rem = [];
    $given = 0;
    foreach ($keys as $i => $k) {
        $exact = $abs * (float)$weights[$k] / $sum;
        $out[$k] = (int)floor($exact + 1e-9);
        $rem[] = [$exact - $out[$k], $i, $k];
        $given += $out[$k];
    }
    usort($rem, fn($a, $b) => $b[0] <=> $a[0] ?: $a[1] <=> $b[1]);
    for ($i = 0, $left = $abs - $given; $left > 0; $i++, $left--) $out[$rem[$i % count($rem)][2]]++;
    foreach ($out as $k => $v) $out[$k] = $v * $sign;
    return $out;
}

/** An amount of $from (minor units) in minor units of $to, at $rate (1 unit of $from = $rate units of $to). */
function convert(int $amount, string $from, string $to, float $rate): int
{
    if ($from === $to) return $amount;
    return (int)round($amount / (10 ** CURRENCIES[$from]) * $rate * (10 ** CURRENCIES[$to]));
}

/**
 * The rates of the European Central Bank (1 euro = n of each currency), kept in split_rates and asked again after 6
 * hours. When the bank cannot be reached, the last ones known (or none: the person writes the rate).
 */
function ecb_rates(): array
{
    $rows = q('SELECT currency, rate, day, asked_at FROM ' . t('split_rates'))->fetchAll();
    $kept = ['rates' => [], 'day' => ''];
    $asked = 0;
    foreach ($rows as $x) {
        $kept['rates'][$x['currency']] = (float)$x['rate'];
        $kept['day'] = max($kept['day'], (string)$x['day']);
        $asked = max($asked, strtotime($x['asked_at'] . ' UTC'));
    }
    if ($rows && time() - $asked < 6 * 3600) return $kept;
    $xml = false;
    if (function_exists('curl_init')) {
        $c = curl_init(ECB_URL);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_USERAGENT => 'SavSplits']);
        $xml = curl_exec($c);
        if (curl_getinfo($c, CURLINFO_HTTP_CODE) !== 200) $xml = false;
    } else {
        $xml = @file_get_contents(ECB_URL, false, stream_context_create(['http' => ['timeout' => 6, 'user_agent' => 'SavSplits']]));
    }
    $rates = [];
    $day = null;
    if (is_string($xml) && preg_match_all("/currency='([A-Z]{3})' rate='([0-9.]+)'/", $xml, $m, PREG_SET_ORDER)) {
        foreach ($m as $x) if (isset(CURRENCIES[$x[1]]) && (float)$x[2] > 0) $rates[$x[1]] = (float)$x[2];
        if (preg_match("/time='(\d{4}-\d{2}-\d{2})'/", $xml, $d)) $day = $d[1];
    }
    if (!$rates) {
        // the bank did not answer: the old ones, asked again in an hour at the soonest
        if ($rows) q('UPDATE ' . t('split_rates') . ' SET asked_at = ?', [gmdate('Y-m-d H:i:s', time() - 5 * 3600)]);
        return $kept;
    }
    $rates['EUR'] = 1.0;
    foreach ($rates as $cur => $rate) q('INSERT INTO ' . t('split_rates') . ' (currency, rate, day, asked_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE rate = VALUES(rate), day = VALUES(day), asked_at = VALUES(asked_at)', [$cur, $rate, $day, now_utc()]);
    return ['rates' => $rates, 'day' => (string)$day];
}

/** 1 $from = ? $to, from the rates of the ECB; null when one of them has no rate there. */
function ecb_rate(string $from, string $to): ?array
{
    if ($from === $to) return ['rate' => 1.0, 'day' => gmdate('Y-m-d')];
    $r = ecb_rates();
    $x = $r['rates'] ?? [];
    if (empty($x[$from]) || empty($x[$to])) return null;
    return ['rate' => round($x[$to] / $x[$from], 10), 'day' => $r['day'] ?? ''];
}

// ------------------------------------------------------------------ groups and access

function group_by_gid($gid): ?array
{
    $gid = valid_code($gid);
    return $gid ? (q('SELECT * FROM ' . t('split_groups') . ' WHERE gid = ?', [$gid])->fetch() ?: null) : null;
}

function group_by_link($code): ?array
{
    $code = valid_link($code);
    return $code ? (q('SELECT * FROM ' . t('split_groups') . ' WHERE link_code = ?', [$code])->fetch() ?: null) : null;
}

function members_of(int $gid): array
{
    return q('SELECT * FROM ' . t('split_members') . ' WHERE group_id = ? ORDER BY position, id', [$gid])->fetchAll();
}

/**
 * Who is asking, and what they may do in the group: ['group', 'role' => owner|editor|viewer, 'member' => their person or
 * null, 'user' => the account or null, 'via' => account|link]. $src: the request (id = gid, or code = the link).
 * An account opening the link of a group it already belongs to keeps its own role.
 */
function access(array $src, bool $write = false): array
{
    $u = current_user();
    if ($u && ($u['status'] !== 'active' || empty($u['email_verified_at']))) $u = null;
    $g = null;
    $via = 'account';
    if (!empty($src['code'])) {
        if (too_many_attempts('split_code', 40, 10)) fail('rate_limited', 429);
        $g = group_by_link($src['code']);
        if (!$g) {
            record_attempt('split_code');
            fail('link_invalid', 404);
        }
        $via = 'link';
    } else {
        if (!$u) fail('unauthenticated', 401);
        $g = group_by_gid($src['id'] ?? '');
        if (!$g) fail('not_found', 404);
    }
    $role = null;
    $member = null;
    if ($u) {
        if ((int)$g['owner_id'] === $u['id']) $role = 'owner';
        $member = q('SELECT * FROM ' . t('split_members') . ' WHERE group_id = ? AND user_id = ? LIMIT 1', [$g['id'], $u['id']])->fetch() ?: null;
        if (!$role && $member) $role = $member['role'];
    }
    if (!$role && $via === 'link') $role = $g['link_role'] === 'edit' ? 'editor' : 'viewer';
    if (!$role) fail('not_found', 404);
    if ($write && $role === 'viewer') fail('forbidden', 403);
    return ['group' => $g, 'role' => $role, 'member' => $member, 'user' => $u, 'via' => $u && ($role === 'owner' || $member) ? 'account' : $via];
}

/** The name that goes in the history: the account, or the person a guest said they are. */
function who(array $a, array $src): string
{
    if ($a['member']) return (string)$a['member']['name'];
    if ($a['user']) return (string)$a['user']['name'];
    $mid = valid_code($src['as'] ?? '');
    if ($mid) {
        $n = q('SELECT name FROM ' . t('split_members') . ' WHERE group_id = ? AND mid = ?', [$a['group']['id'], $mid])->fetchColumn();
        if ($n) return (string)$n;
    }
    return '';
}

function log_event(array $a, array $src, string $action, ?string $ref, array $info = []): void
{
    $gid = (int)$a['group']['id'];
    q('INSERT INTO ' . t('split_log') . ' (group_id, who, user_id, action, ref, info, created_at) VALUES (?,?,?,?,?,?,?)',
        [$gid, mb_substr(who($a, $src), 0, 80), $a['user']['id'] ?? null, $action, $ref, $info ? json_out($info) : null, now_utc()]);
    q('UPDATE ' . t('split_groups') . ' SET rev = rev + 1, updated_at = ? WHERE id = ?', [now_utc(), $gid]);
    // only the last 3000 of a group
    if (random_int(1, 50) === 1) {
        $cut = q('SELECT id FROM ' . t('split_log') . ' WHERE group_id = ? ORDER BY id DESC LIMIT 1 OFFSET 3000', [$gid])->fetchColumn();
        if ($cut) q('DELETE FROM ' . t('split_log') . ' WHERE group_id = ? AND id <= ?', [$gid, $cut]);
    }
}

function clean_tables($v): array
{
    $out = [];
    $seen = [];
    foreach (is_array($v) ? array_slice($v, 0, MAX_TABLES) : [] as $x) {
        if (!is_array($x)) continue;
        $name = s($x, 'name', 60);
        if ($name === '') continue;
        $id = is_string($x['id'] ?? null) && preg_match('/^[a-z0-9]{1,8}$/', $x['id']) ? $x['id'] : substr(bin2hex(random_bytes(4)), 0, 6);
        if (isset($seen[$id])) continue;
        $seen[$id] = 1;
        $out[] = ['id' => $id, 'name' => $name];
    }
    return $out;
}

function clean_quotas($v, array $tables): array
{
    $ids = array_column($tables, 'id');
    $out = [];
    foreach (is_array($v) ? $v : [] as $k => $n) {
        if (!in_array((string)$k, $ids, true) || !is_numeric($n)) continue;
        $n = round((float)$n, 4);
        if ($n > 0 && $n <= 1e7) $out[(string)$k] = $n;
    }
    return $out;
}

// ------------------------------------------------------------------ expenses

/**
 * Checks an expense sent by the app and works out what each one paid and owes. $b: {kind, title, category, day, amount,
 * currency, rate, payers {mid: amount}, split {mode, parts {mid: value}, table}, notes, repeat}. Amounts in minor units.
 * Returns the columns to save, or fails with a code the app shows.
 */
function clean_expense(array $b, array $g, array $members): array
{
    $kind = pick($b, 'kind', ['expense', 'transfer', 'income'], 'expense');
    $byMid = [];
    foreach ($members as $m) $byMid[$m['mid']] = $m;
    $cur = valid_currency($b['currency'] ?? '') ?: $g['currency'];
    $amount = is_numeric($b['amount'] ?? null) ? (int)round((float)$b['amount']) : 0;
    if ($amount <= 0) fail('amount_required', 422);
    if ($amount > MAX_AMOUNT) fail('amount_big', 422);
    $rate = 1.0;
    if ($cur !== $g['currency']) {
        $rate = is_numeric($b['rate'] ?? null) ? (float)$b['rate'] : 0;
        if (!($rate > 0) || $rate > 1e9) fail('rate_required', 422);
        $rate = round($rate, 10);
    }
    $base = convert($amount, $cur, $g['currency'], $rate);
    if ($base <= 0) fail('amount_required', 422);
    $day = valid_day($b['day'] ?? '') ?: gmdate('Y-m-d');
    $title = s($b, 'title', 120);
    if ($title === '' && $kind === 'expense') fail('title_required', 422);

    // who paid: amounts of the expense that add up to it
    $payers = [];
    foreach (is_array($b['payers'] ?? null) ? $b['payers'] : [] as $mid => $v) {
        if (!isset($byMid[$mid]) || !is_numeric($v)) continue;
        $v = (int)round((float)$v);
        if ($v > 0) $payers[$mid] = $v;
    }
    if (!$payers) fail('payer_required', 422);
    if (array_sum($payers) !== $amount) fail('payers_sum', 422);
    if ($kind === 'transfer' && count($payers) !== 1) fail('payer_required', 422);

    // for whom
    $sp = is_array($b['split'] ?? null) ? $b['split'] : [];
    $mode = pick($sp, 'mode', ['equal', 'shares', 'percent', 'exact', 'table'], 'equal');
    $parts = [];
    foreach (is_array($sp['parts'] ?? null) ? $sp['parts'] : [] as $mid => $v) {
        if (!isset($byMid[$mid]) || !is_numeric($v)) continue;
        $v = (float)$v;
        if ($v > 0 && $v <= 1e12) $parts[$mid] = $v;
    }
    $table = '';
    if ($kind === 'transfer') {
        // to one person, who is not the one who paid
        $mode = 'exact';
        $to = array_keys($parts);
        if (count($to) !== 1 || isset($payers[$to[0]])) fail('receiver_required', 422);
        $parts = [$to[0] => $amount];
    }
    if ($mode === 'table') {
        $tables = jdec($g['tables']);
        $table = is_string($sp['table'] ?? null) ? $sp['table'] : '';
        if (!in_array($table, array_column($tables, 'id'), true)) fail('table_required', 422);
        // the shares of the table, of the people chosen (all those with a share when nobody is chosen)
        $w = [];
        foreach ($members as $m) {
            $qv = (float)(jdec($m['quotas'])[$table] ?? 0);
            if ($qv > 0 && (!$parts || isset($parts[$m['mid']]))) $w[$m['mid']] = $qv;
        }
        if (!$w) fail('table_empty', 422);
        $parts = array_map(fn($x) => 1, $w);
        $weights = $w;
    } elseif ($mode === 'equal') {
        if (!$parts) fail('split_required', 422);
        $parts = array_map(fn($x) => 1, $parts);
        $weights = $parts;
    } elseif ($mode === 'shares') {
        if (!$parts) fail('split_required', 422);
        $parts = array_map(fn($x) => round($x, 4), $parts);
        $weights = $parts;
    } elseif ($mode === 'percent') {
        $parts = array_map(fn($x) => round($x, 4), $parts);
        if (abs(array_sum($parts) - 100) > 0.011) fail('percent_sum', 422);
        $weights = $parts;
    } else { // exact: amounts of the expense
        $parts = array_map(fn($x) => (int)round($x), $parts);
        $parts = array_filter($parts, fn($x) => $x > 0);
        if (array_sum($parts) !== $amount) fail('exact_sum', 422);
        $weights = $parts;
    }

    // in the currency of the group: what each one paid and owes (an income is money held for the others)
    $sign = $kind === 'income' ? -1 : 1;
    $paid = apportion($base * $sign, $payers);
    $alloc = apportion($base * $sign, $weights);
    $repeat = pick($b, 'repeat', REPEATS);
    return [
        'kind' => $kind, 'title' => $title, 'category' => pick($b, 'category', CATEGORIES),
        'day' => $day, 'amount' => $amount, 'currency' => $cur, 'rate' => $rate, 'base' => $base,
        'payers' => json_out((object)$payers), 'split' => json_out(['mode' => $mode, 'parts' => (object)$parts, 'table' => $table]),
        'paid' => json_out((object)$paid), 'alloc' => json_out((object)$alloc), 'notes' => multiline($b, 'notes', 2000),
        'repeat_rule' => $kind === 'transfer' ? '' : $repeat,
    ];
}

/** The day after $day by one step of a repetition (the 31st of a month goes to the last day of a shorter one). */
function next_day(string $day, string $rule, int $steps = 1): string
{
    $d = new DateTimeImmutable($day . ' 00:00:00', new DateTimeZone('UTC'));
    if ($rule === 'week') return $d->modify('+' . (7 * $steps) . ' days')->format('Y-m-d');
    $months = ['month' => 1, 'quarter' => 3, 'year' => 12][$rule] * $steps;
    $y = (int)$d->format('Y');
    $m = (int)$d->format('n') + $months;
    $y += intdiv($m - 1, 12);
    $m = ($m - 1) % 12 + 1;
    $last = (int)(new DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m)))->format('t');
    return sprintf('%04d-%02d-%02d', $y, $m, min((int)$d->format('j'), $last));
}

/**
 * The copies of the repeated expenses whose day has come (up to $today, the day of the person who opens the group):
 * made once, inside a transaction that locks the expense, so two people opening the group together make them once.
 */
function make_repeats(array $g, string $today): void
{
    $due = q('SELECT id FROM ' . t('split_expenses') . " WHERE group_id = ? AND repeat_rule <> '' AND deleted_at IS NULL AND repeat_next IS NOT NULL AND repeat_next <= ?", [$g['id'], $today])->fetchAll(PDO::FETCH_COLUMN);
    if (!$due) return;
    $count = (int)q('SELECT COUNT(*) FROM ' . t('split_expenses') . ' WHERE group_id = ?', [$g['id']])->fetchColumn();
    foreach ($due as $id) {
        db()->beginTransaction();
        $e = q('SELECT * FROM ' . t('split_expenses') . ' WHERE id = ? FOR UPDATE', [$id])->fetch();
        $made = 0;
        while ($e && $e['repeat_rule'] !== '' && $e['repeat_next'] && $e['repeat_next'] <= $today && $made < MAX_REPEAT_COPIES && $count < MAX_EXPENSES) {
            q('INSERT INTO ' . t('split_expenses') . ' (eid, group_id, kind, title, category, day, amount, currency, rate, base, payers, split, paid, alloc, notes, repeat_rule, repeat_next, repeat_of, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [new_code('split_expenses', 'eid'), $g['id'], $e['kind'], $e['title'], $e['category'], $e['repeat_next'], $e['amount'], $e['currency'], $e['rate'], $e['base'], $e['payers'], $e['split'], $e['paid'], $e['alloc'], $e['notes'], '', null, $e['eid'], $e['created_by'], now_utc(), now_utc()]);
            $e['repeat_next'] = next_day($e['repeat_next'], $e['repeat_rule']);
            $made++;
            $count++;
        }
        if ($made) {
            q('UPDATE ' . t('split_expenses') . ' SET repeat_next = ? WHERE id = ?', [$e['repeat_next'], $id]);
            q('UPDATE ' . t('split_groups') . ' SET rev = rev + 1, updated_at = ? WHERE id = ?', [now_utc(), $g['id']]);
        }
        db()->commit();
    }
}

// ------------------------------------------------------------------ balances and who pays whom

/** Σ paid − Σ alloc of each person (minor units of the group), and what each one spent (their part of the expenses). */
function balances(array $members, array $expenses): array
{
    $bal = [];
    $spent = [];
    $paidOut = [];
    foreach ($members as $m) {
        $bal[$m['mid']] = 0;
        $spent[$m['mid']] = 0;
        $paidOut[$m['mid']] = 0;
    }
    foreach ($expenses as $e) {
        foreach (jdec($e['paid']) as $mid => $v) {
            if (!isset($bal[$mid])) continue;
            $bal[$mid] += (int)$v;
            if ($e['kind'] === 'expense') $paidOut[$mid] += (int)$v;
        }
        foreach (jdec($e['alloc']) as $mid => $v) {
            if (!isset($bal[$mid])) continue;
            $bal[$mid] -= (int)$v;
            if ($e['kind'] !== 'transfer') $spent[$mid] += (int)$v;
        }
    }
    return ['balance' => $bal, 'spent' => $spent, 'paid' => $paidOut];
}

/**
 * The fewest payments that set everyone even, the way people do it: the one who owes most pays the one who should
 * receive most, again and again. [{from, to, amount}], in minor units of the group.
 */
function settle(array $balance): array
{
    $give = [];
    $get = [];
    foreach ($balance as $mid => $v) {
        if ($v < 0) $give[$mid] = -$v;
        elseif ($v > 0) $get[$mid] = $v;
    }
    $out = [];
    for ($guard = 0; $give && $get && $guard < 500; $guard++) {
        arsort($give);
        arsort($get);
        $from = array_key_first($give);
        $to = array_key_first($get);
        $x = min($give[$from], $get[$to]);
        $out[] = ['from' => (string)$from, 'to' => (string)$to, 'amount' => $x];
        $give[$from] -= $x;
        $get[$to] -= $x;
        if (!$give[$from]) unset($give[$from]);
        if (!$get[$to]) unset($get[$to]);
    }
    return $out;
}

// ------------------------------------------------------------------ what the app receives

function out_member(array $m): array
{
    return ['id' => $m['mid'], 'name' => $m['name'], 'linked' => $m['user_id'] !== null, 'role' => $m['role'], 'weight' => (float)$m['weight'],
        'quotas' => (object)jdec($m['quotas']), 'pay' => $m['pay'], 'active' => (bool)$m['active']];
}

/** An expense for the app; $photos: eid => its photos (photos_of()). */
function out_expense(array $e, array $photos = []): array
{
    $sp = jdec($e['split']);
    return ['id' => $e['eid'], 'kind' => $e['kind'], 'title' => $e['title'], 'category' => $e['category'], 'day' => $e['day'], 'amount' => (int)$e['amount'],
        'currency' => $e['currency'], 'rate' => (float)$e['rate'], 'base' => (int)$e['base'], 'payers' => (object)jdec($e['payers']),
        'split' => ['mode' => $sp['mode'] ?? 'equal', 'parts' => (object)($sp['parts'] ?? []), 'table' => $sp['table'] ?? ''],
        'paid' => (object)jdec($e['paid']), 'alloc' => (object)jdec($e['alloc']), 'notes' => (string)$e['notes'], 'repeat' => $e['repeat_rule'],
        'repeatNext' => $e['repeat_next'], 'repeatOf' => $e['repeat_of'], 'by' => $e['created_by'], 'created' => iso($e['created_at']), 'updated' => iso($e['updated_at']),
        'photos' => $photos[$e['eid']] ?? []];
}

/** Everything about a group for the app: the group, its people, its expenses, the balances and who pays whom. */
function group_payload(array $a): array
{
    $g = q('SELECT * FROM ' . t('split_groups') . ' WHERE id = ?', [$a['group']['id']])->fetch();
    $members = members_of((int)$g['id']);
    $expenses = q('SELECT * FROM ' . t('split_expenses') . ' WHERE group_id = ? AND deleted_at IS NULL ORDER BY day DESC, id DESC', [$g['id']])->fetchAll();
    $b = balances($members, $expenses);
    $photos = photos_of((int)$g['id']);
    $owner = $a['role'] === 'owner';
    $total = 0;
    foreach ($expenses as $e) if ($e['kind'] === 'expense') $total += (int)$e['base'];
    return [
        'group' => [
            'id' => $g['gid'], 'name' => $g['name'], 'kind' => $g['kind'], 'icon' => $g['icon'], 'color' => $g['color'], 'currency' => $g['currency'],
            'notes' => (string)$g['notes'], 'tables' => jdec($g['tables']), 'rev' => (int)$g['rev'], 'created' => iso($g['created_at']), 'updated' => iso($g['updated_at']),
            // the link: only who may share it sees it (the owner and the editors with an account)
            'link' => ($owner || ($a['role'] === 'editor' && $a['via'] === 'account')) && $g['link_code'] ? $g['link_code'] : null, 'linkRole' => $g['link_role'],
            'owner' => (int)$g['owner_id'] === (int)($a['user']['id'] ?? 0), 'total' => $total,
        ],
        'role' => $a['role'], 'via' => $a['via'], 'me' => $a['member']['mid'] ?? null, 'archived' => (bool)($a['member']['archived'] ?? false),
        'members' => array_map('out_member', $members),
        'expenses' => array_map(fn($e) => out_expense($e, $photos), $expenses),
        'balance' => (object)$b['balance'], 'spent' => (object)$b['spent'], 'paid' => (object)$b['paid'],
        'settle' => settle($b['balance']),
    ];
}

/** The groups of an account, for the home: each with its balance for that account and a few numbers. */
function groups_of(array $u): array
{
    $rows = q('SELECT DISTINCT g.* FROM ' . t('split_groups') . ' g LEFT JOIN ' . t('split_members') . ' m ON m.group_id = g.id AND m.user_id = ?
        WHERE g.owner_id = ? OR m.id IS NOT NULL ORDER BY g.updated_at DESC', [$u['id'], $u['id']])->fetchAll();
    $out = [];
    foreach ($rows as $g) {
        $members = members_of((int)$g['id']);
        $me = null;
        foreach ($members as $m) if ((int)$m['user_id'] === $u['id']) $me = $m;
        $expenses = q('SELECT kind, day, base, paid, alloc FROM ' . t('split_expenses') . ' WHERE group_id = ? AND deleted_at IS NULL', [$g['id']])->fetchAll();
        $b = balances($members, $expenses);
        $total = 0;
        $month = 0; // the share of the account in the expenses of this month (UTC)
        $now = gmdate('Y-m');
        foreach ($expenses as $e) {
            if ($e['kind'] !== 'expense') continue;
            $total += (int)$e['base'];
            if ($me && substr((string)$e['day'], 0, 7) === $now) $month += (int)(jdec($e['alloc'])[$me['mid']] ?? 0);
        }
        $out[] = ['id' => $g['gid'], 'name' => $g['name'], 'kind' => $g['kind'], 'icon' => $g['icon'], 'color' => $g['color'], 'currency' => $g['currency'],
            'people' => count(array_filter($members, fn($m) => $m['active'])), 'names' => array_slice(array_map(fn($m) => $m['name'], array_filter($members, fn($m) => $m['active'])), 0, 6),
            'expenses' => count($expenses), 'total' => $total, 'month' => $month, 'me' => $me['mid'] ?? null, 'balance' => $me ? $b['balance'][$me['mid']] : null,
            'owner' => (int)$g['owner_id'] === $u['id'], 'archived' => (bool)($me['archived'] ?? false), 'updated' => iso($g['updated_at'])];
    }
    return $out;
}

/**
 * A group with its people (and its expenses, from a .savspl file: $import): the account becomes its owner. A new group
 * has the account among its people; an imported one has the people of the file (the account may join one of them).
 */
function create_group(array $u, array $b, array $expenses = [], bool $import = false): array
{
    if ((int)q('SELECT COUNT(*) FROM ' . t('split_groups') . ' WHERE owner_id = ?', [$u['id']])->fetchColumn() >= MAX_GROUPS) fail('too_many_groups', 409);
    $name = s($b, 'name', 80);
    if ($name === '') fail('name_required', 422);
    $cur = valid_currency($b['currency'] ?? '') ?: 'EUR';
    $tables = clean_tables($b['tables'] ?? []);
    $people = [];
    foreach (is_array($b['members'] ?? null) ? array_slice($b['members'], 0, MAX_MEMBERS) : [] as $m) {
        $m = is_array($m) ? $m : ['name' => $m];
        $n = s($m, 'name', 80);
        if ($n !== '' && !in_array(mb_strtolower($n), array_map(fn($x) => mb_strtolower($x['name']), $people), true)) $people[] = ['name' => $n, 'me' => !empty($m['me']), 'weight' => is_numeric($m['weight'] ?? null) ? max(0, min(1e6, (float)$m['weight'])) : 1,
            'quotas' => clean_quotas($m['quotas'] ?? [], $tables), 'pay' => s($m, 'pay', 300), 'key' => is_string($m['id'] ?? null) ? $m['id'] : null];
    }
    if (!$import && !array_filter($people, fn($p) => $p['me'])) array_unshift($people, ['name' => mb_substr((string)$u['name'], 0, 80) ?: 'Me', 'me' => true, 'weight' => 1, 'quotas' => [], 'pay' => '', 'key' => null]);
    // a personal group: only the account, no link (a file of one comes back as a group of the account alone too)
    $personal = pick($b, 'kind', GROUP_KINDS, 'generic') === 'personal';
    if ($personal) {
        $first = array_values(array_filter($people, fn($p) => $p['me']))[0] ?? $people[0] ?? null;
        $people = [['name' => $first['name'] ?? (mb_substr((string)$u['name'], 0, 80) ?: 'Me'), 'me' => true, 'weight' => 1, 'quotas' => [], 'pay' => '', 'key' => $first['key'] ?? null]];
        $tables = [];
    }
    db()->beginTransaction();
    $gid = new_code('split_groups', 'gid');
    q('INSERT INTO ' . t('split_groups') . ' (gid, owner_id, name, kind, icon, color, currency, notes, tables, link_code, link_role, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [$gid, $u['id'], $name, pick($b, 'kind', GROUP_KINDS, 'generic'), pick($b, 'icon', GROUP_ICONS),
            valid_color($b['color'] ?? ''), $cur, multiline($b, 'notes', 2000), json_out($tables), $personal ? null : new_link_code(), ($b['linkRole'] ?? '') === 'view' ? 'view' : 'edit', now_utc(), now_utc()]);
    $id = (int)db()->lastInsertId();
    $map = [];
    $meDone = false;
    foreach ($people as $i => $p) {
        $mid = new_code('split_members', 'mid');
        if ($p['key']) $map[$p['key']] = $mid;
        $mine = $p['me'] && !$meDone;
        if ($mine) $meDone = true;
        q('INSERT INTO ' . t('split_members') . ' (mid, group_id, name, user_id, role, weight, quotas, pay, position, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$mid, $id, $p['name'], $mine ? $u['id'] : null, 'editor', $p['weight'], json_out((object)$p['quotas']), $p['pay'], $i, now_utc()]);
    }
    // the expenses of a file: the people renamed to the new codes, then checked as if they were written now
    if ($expenses) {
        $g = q('SELECT * FROM ' . t('split_groups') . ' WHERE id = ?', [$id])->fetch();
        $members = members_of($id);
        $remap = function ($o) use ($map) {
            $x = [];
            foreach (is_array($o) ? $o : [] as $k => $v) if (isset($map[$k])) $x[$map[$k]] = $v;
            return $x;
        };
        foreach (array_slice($expenses, 0, MAX_EXPENSES) as $e) {
            if (!is_array($e)) continue;
            $e['payers'] = $remap($e['payers'] ?? []);
            $e['split'] = ['mode' => $e['split']['mode'] ?? 'equal', 'parts' => $remap($e['split']['parts'] ?? []), 'table' => $e['split']['table'] ?? ''];
            $c = clean_expense($e, $g, $members);
            q('INSERT INTO ' . t('split_expenses') . ' (eid, group_id, kind, title, category, day, amount, currency, rate, base, payers, split, paid, alloc, notes, repeat_rule, repeat_next, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [new_code('split_expenses', 'eid'), $id, $c['kind'], $c['title'], $c['category'], $c['day'], $c['amount'], $c['currency'], $c['rate'], $c['base'], $c['payers'], $c['split'], $c['paid'], $c['alloc'], $c['notes'], $c['repeat_rule'],
                    $c['repeat_rule'] && valid_day($e['repeatNext'] ?? '') ? $e['repeatNext'] : ($c['repeat_rule'] ? next_day($c['day'], $c['repeat_rule']) : null), s($e, 'by', 80), now_utc(), now_utc()]);
        }
    }
    q('INSERT INTO ' . t('split_log') . ' (group_id, who, user_id, action, ref, info, created_at) VALUES (?,?,?,?,?,?,?)', [$id, mb_substr((string)$u['name'], 0, 80), $u['id'], $import ? 'group.import' : 'group.create', null, json_out(['name' => $name]), now_utc()]);
    db()->commit();
    return q('SELECT * FROM ' . t('split_groups') . ' WHERE id = ?', [$id])->fetch();
}

/** How much one account keeps in SavSplits (the groups it owns, their photos too), for the space of SavOffice. */
function split_bytes(int $uid): int
{
    $st = q('SELECT COALESCE(SUM(LENGTH(e.payers) + LENGTH(e.split) + LENGTH(e.paid) + LENGTH(e.alloc) + COALESCE(LENGTH(e.notes), 0) + LENGTH(e.title) + 160), 0) FROM ' . t('split_expenses') . ' e JOIN ' . t('split_groups') . ' g ON g.id = e.group_id WHERE g.owner_id = ?', [$uid]);
    $n = (int)$st->fetchColumn();
    $n += (int)q('SELECT COALESCE(SUM(LENGTH(name) + COALESCE(LENGTH(notes), 0) + COALESCE(LENGTH(tables), 0) + 300), 0) FROM ' . t('split_groups') . ' WHERE owner_id = ?', [$uid])->fetchColumn();
    $n += (int)q('SELECT COALESCE(SUM(p.bytes), 0) FROM ' . t('split_photos') . ' p JOIN ' . t('split_groups') . ' g ON g.id = p.group_id WHERE g.owner_id = ?', [$uid])->fetchColumn();
    $n += (int)q('SELECT COALESCE(SUM(COALESCE(LENGTH(caps), 0) + COALESCE(LENGTH(rules), 0) + COALESCE(LENGTH(csv), 0)), 0) FROM ' . t('split_budget') . ' WHERE user_id = ?', [$uid])->fetchColumn();
    return $n;
}
