<?php
/**
 * SavSplits — a light personal budget, on top of the groups. Not an accounting app: no bank accounts, no assets, no
 * investments, no advice. Only what the account spent, to look at it.
 *
 * "My spending" adds up the share of the account in the expenses of every group where it is one of the people (its
 * alloc: not what it paid, which is already settled by the balances), by month and by category. A personal group (kind
 * "personal") has one person, the account itself: its expenses are private ones, with no balances to settle, and they
 * enter the same view. Incomes and paybacks never count: only expenses.
 *
 * Monthly caps for some categories (in the currency of the view) show how much of each is used this month; a bank
 * statement (CSV) can be read in the browser and its rows saved as expenses of a group: the file is never sent, only the
 * rows chosen (day, description, amount, category). The keywords that gave a category to a row are kept for the next one.
 */

declare(strict_types=1);

const MAX_RULES = 500;          // keywords → category of one account
const MAX_IMPORT_ROWS = 1000;   // rows of a bank statement saved in one go

/** The budget of an account, as it is kept (defaults when it never saved one). */
function budget_row(int $uid): array
{
    $b = q('SELECT * FROM ' . t('split_budget') . ' WHERE user_id = ?', [$uid])->fetch();
    return $b ?: ['user_id' => $uid, 'currency' => '', 'caps' => null, 'rules' => null, 'csv' => null];
}

function out_budget(array $b): array
{
    return ['currency' => $b['currency'] ?: '', 'caps' => (object)jdec($b['caps']), 'rules' => array_values(jdec($b['rules'])), 'csv' => (object)jdec($b['csv'])];
}

/** {category: minor units a month}: only the categories of SavSplits, only amounts above 0. */
function clean_caps($v): array
{
    $out = [];
    foreach (is_array($v) ? $v : [] as $c => $n) {
        $c = (string)$c;
        if ($c === '' || !in_array($c, CATEGORIES, true) || !is_numeric($n)) continue;
        $n = (int)round((float)$n);
        if ($n > 0 && $n <= MAX_AMOUNT) $out[$c] = $n;
    }
    return $out;
}

/** [{k: words of a description, lower case, c: category}]: one per keyword, the last one written wins. */
function clean_rules($v): array
{
    $out = [];
    foreach (is_array($v) ? $v : [] as $r) {
        if (!is_array($r)) continue;
        $k = mb_strtolower(trim(preg_replace('/\s+/u', ' ', (string)($r['k'] ?? ''))));
        $k = mb_substr($k, 0, 60);
        $c = is_string($r['c'] ?? null) ? $r['c'] : '';
        if (mb_strlen($k) < 2 || $c === '' || !in_array($c, CATEGORIES, true)) continue;
        $out[$k] = ['k' => $k, 'c' => $c];
    }
    return array_slice(array_values($out), -MAX_RULES);
}

/** How a CSV of the bank is read: separator, decimal mark, order of the date, the columns, the sign of an expense. */
function clean_csv_map($v): array
{
    if (!is_array($v)) return [];
    $int = fn($x, $max) => is_numeric($x) && (int)$x >= -1 && (int)$x <= $max ? (int)$x : -1;
    $cols = is_array($v['cols'] ?? null) ? $v['cols'] : [];
    return [
        'sig' => mb_substr(is_string($v['sig'] ?? null) ? $v['sig'] : '', 0, 300),
        'sep' => in_array($v['sep'] ?? '', [',', ';', "\t", '|'], true) ? $v['sep'] : ';',
        'dec' => in_array($v['dec'] ?? '', [',', '.'], true) ? $v['dec'] : ',',
        'date' => in_array($v['date'] ?? '', ['dmy', 'mdy', 'ymd'], true) ? $v['date'] : 'dmy',
        'head' => !empty($v['head']),
        'skip' => max(0, min(50, (int)($v['skip'] ?? 0))),
        'amount' => in_array($v['amount'] ?? '', ['one', 'two'], true) ? $v['amount'] : 'one',
        'sign' => in_array($v['sign'] ?? '', ['neg', 'pos'], true) ? $v['sign'] : 'neg',
        'cols' => ['date' => $int($cols['date'] ?? -1, 80), 'desc' => $int($cols['desc'] ?? -1, 80), 'amount' => $int($cols['amount'] ?? -1, 80),
            'debit' => $int($cols['debit'] ?? -1, 80), 'credit' => $int($cols['credit'] ?? -1, 80)],
    ];
}

/** Saves the parts of the budget that are given (the others stay as they are). */
function save_budget(int $uid, array $b): array
{
    $old = budget_row($uid);
    $cur = array_key_exists('currency', $b) ? (valid_currency($b['currency']) ?: ($old['currency'] ?: 'EUR')) : ($old['currency'] ?: 'EUR');
    $caps = array_key_exists('caps', $b) ? json_out((object)clean_caps($b['caps'])) : $old['caps'];
    $rules = array_key_exists('rules', $b) ? json_out(clean_rules($b['rules'])) : $old['rules'];
    $csv = array_key_exists('csv', $b) ? json_out((object)clean_csv_map($b['csv'])) : $old['csv'];
    q('INSERT INTO ' . t('split_budget') . ' (user_id, currency, caps, rules, csv, updated_at) VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE currency = VALUES(currency), caps = VALUES(caps), rules = VALUES(rules), csv = VALUES(csv), updated_at = VALUES(updated_at)',
        [$uid, $cur, $caps, $rules, $csv, now_utc()]);
    return budget_row($uid);
}

/**
 * The share of the account in the expenses of its groups: the groups (with their currency) and one row per expense
 * [group index, day, category, title, share in minor units of the group, eid]. Only the groups where the account is
 * one of the people (in a group it owns without being one of them, nothing is its own).
 */
function my_spending(array $u, string $from = ''): array
{
    $groups = q('SELECT g.id, g.gid, g.name, g.kind, g.icon, g.color, g.currency, m.mid, m.archived FROM ' . t('split_groups') . ' g JOIN ' . t('split_members') . ' m ON m.group_id = g.id AND m.user_id = ?
        ORDER BY g.kind = \'personal\' DESC, g.updated_at DESC', [$u['id']])->fetchAll();
    $out = [];
    $rows = [];
    foreach ($groups as $i => $g) {
        $out[] = ['id' => $g['gid'], 'name' => $g['name'], 'kind' => $g['kind'], 'icon' => $g['icon'], 'color' => $g['color'], 'currency' => $g['currency'], 'archived' => (bool)$g['archived']];
        $args = [$g['id']];
        $since = '';
        if ($from !== '') {
            $since = ' AND day >= ?';
            $args[] = $from;
        }
        $st = q('SELECT eid, day, category, title, alloc FROM ' . t('split_expenses') . " WHERE group_id = ? AND kind = 'expense' AND deleted_at IS NULL$since ORDER BY day DESC, id DESC", $args);
        while ($e = $st->fetch()) {
            $share = (int)(jdec($e['alloc'])[$g['mid']] ?? 0);
            if ($share > 0) $rows[] = [$i, $e['day'], $e['category'], $e['title'], $share, $e['eid']];
        }
    }
    usort($rows, fn($a, $b) => strcmp($b[1], $a[1]));
    return ['groups' => $out, 'rows' => $rows];
}

/** The categories with a monthly cap (the app checks them after an expense is saved). */
function cap_categories(int $uid): array
{
    return array_keys(jdec(budget_row($uid)['caps']));
}

/** The categories over their cap in the month $month (YYYY-MM), for the badge of the home. Rates of the ECB if needed. */
function caps_over(array $u, string $month): int
{
    $b = budget_row((int)$u['id']);
    $caps = jdec($b['caps']);
    if (!$caps) return 0;
    $cur = $b['currency'] ?: 'EUR';
    $m = my_spending($u, $month . '-01');
    $rates = null;
    $sum = [];
    foreach ($m['rows'] as $r) {
        if (substr($r[1], 0, 7) !== $month || !isset($caps[$r[2]])) continue;
        $gc = $m['groups'][$r[0]]['currency'];
        $v = $r[4];
        if ($gc !== $cur) {
            $rates = $rates ?? (ecb_rates()['rates'] ?? []);
            if (empty($rates[$gc]) || empty($rates[$cur])) continue;
            $v = convert($v, $gc, $cur, $rates[$cur] / $rates[$gc]);
        }
        $sum[$r[2]] = ($sum[$r[2]] ?? 0) + $v;
    }
    $n = 0;
    foreach ($caps as $c => $cap) if (($sum[$c] ?? 0) > (int)$cap) $n++;
    return $n;
}

/**
 * Rows of a bank statement (read in the browser) saved as expenses of the group, paid by the account: for the account
 * alone ($for = 'me', always in a personal group) or equally among the people of the group ($for = 'all').
 * Each row: {day, title, amount (minor units of the group, > 0), category, notes}. Returns how many were saved.
 */
function import_rows(array $a, array $rows, string $for, string $who): int
{
    $g = $a['group'];
    $me = $a['member'];
    if (!$me) fail('no_member', 409);
    $members = members_of((int)$g['id']);
    $active = array_values(array_filter($members, fn($m) => (int)$m['active'] === 1));
    $parts = $for === 'all' && $g['kind'] !== 'personal' ? array_fill_keys(array_column($active, 'mid'), 1) : [$me['mid'] => 1];
    $parts[$me['mid']] = 1;
    $count = (int)q('SELECT COUNT(*) FROM ' . t('split_expenses') . ' WHERE group_id = ?', [$g['id']])->fetchColumn();
    $rows = array_slice($rows, 0, MAX_IMPORT_ROWS);
    if ($count + count($rows) > MAX_EXPENSES) fail('too_many_expenses', 409);
    $clean = [];
    foreach ($rows as $r) {
        if (!is_array($r)) continue;
        $title = s($r, 'title', 300);
        $notes = mb_strlen($title) > 120 ? $title : '';
        $c = clean_expense(['kind' => 'expense', 'title' => mb_substr($title, 0, 120) ?: '—', 'category' => $r['category'] ?? '', 'day' => $r['day'] ?? '', 'amount' => $r['amount'] ?? 0,
            'currency' => $g['currency'], 'payers' => [$me['mid'] => $r['amount'] ?? 0], 'split' => ['mode' => 'equal', 'parts' => $parts], 'notes' => $notes], $g, $members);
        if (!valid_day($r['day'] ?? '')) fail('import_day', 422);
        $clean[] = $c;
    }
    if (!$clean) fail('import_empty', 422);
    db()->beginTransaction();
    foreach ($clean as $c) {
        q('INSERT INTO ' . t('split_expenses') . ' (eid, group_id, kind, title, category, day, amount, currency, rate, base, payers, split, paid, alloc, notes, repeat_rule, repeat_next, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [new_code('split_expenses', 'eid'), $g['id'], $c['kind'], $c['title'], $c['category'], $c['day'], $c['amount'], $c['currency'], $c['rate'], $c['base'], $c['payers'], $c['split'], $c['paid'], $c['alloc'], $c['notes'], '', null, $who, now_utc(), now_utc()]);
    }
    db()->commit();
    return count($clean);
}
