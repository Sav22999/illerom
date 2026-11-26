<?php
/**
 * SavForms — forms, their questions, the answers and what is drawn from them.
 *
 * A form belongs to one account. Its questions are kept as one JSON list (content) whose items are cleaned by
 * clean_questions(): every item has an id that never changes (the answers are kept by it, so a question can be renamed or
 * moved without losing them), a type and what that type needs:
 *
 *   short, long, email      a line, some lines, an address            (max: characters; quiz: correct texts)
 *   number                  a number                                  (min, max, int)
 *   date, time              a day, a time of the day
 *   single, dropdown        one choice                                (opts [{id, label}], other, shuffle; quiz: correct, points)
 *   multi                   some choices                              (the same, and min, max how many)
 *   scale                   a linear scale                            (min 0 or 1, max 2…10, minLabel, maxLabel)
 *   rating                  stars, hearts…                            (max 3…10, icon)
 *   grid, checkgrid         one or some columns for each row          (rows, cols)
 *   ranking                 the choices in order                      (opts)
 *   text, image, section    no answer: a title with text, a picture (a data: URL), the start of a new page
 *
 * The answers of a person are one JSON object by question id. Choices are kept by the id of the option; "other" is "~o"
 * with its text in "<id>~o". A grid is {row: col} ({row: [cols]} for checkgrid); a ranking is the ids in order.
 *
 * A form takes answers while it is "accepting", after opens_at, before closes_at (its deadline: it shows in SavCalendar
 * when in_calendar) and until the limit of answers.
 */

declare(strict_types=1);

const TYPES = ['short', 'long', 'email', 'number', 'date', 'time', 'single', 'multi', 'dropdown', 'scale', 'rating', 'grid', 'checkgrid', 'ranking', 'text', 'image', 'section'];
const STATIC_TYPES = ['text', 'image', 'section'];
const CHOICE_TYPES = ['single', 'multi', 'dropdown', 'ranking'];
const RATING_ICONS = ['star', 'heart', 'thumbs-up', 'smile'];
const FORM_COLORS = ['#86329e', '#1f56d1', '#0b7a87', '#0f8a63', '#c27a06', '#e0532f', '#c93a2f', '#c2307a', '#6a2cf0', '#4a5875'];
const FONTS = ['sans', 'serif', 'rounded', 'mono'];
const BACKS = ['tint', 'plain', 'dots', 'waves'];
const OTHER = '~o';

function q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function new_code(string $table, string $col): string
{
    $abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    do {
        $p = '';
        for ($i = 0; $i < 10; $i++) $p .= $abc[random_int(0, strlen($abc) - 1)];
    } while (q('SELECT 1 FROM ' . t($table) . " WHERE $col = ?", [$p])->fetchColumn());
    return $p;
}

function valid_code($v): string
{
    return is_string($v) && preg_match('/^[a-z0-9]{10}$/', $v) ? $v : '';
}

function valid_color($v, string $default = ''): string
{
    return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtolower($v) : $default;
}

function valid_tz($v, string $default = 'UTC'): string
{
    return is_string($v) && in_array($v, timezone_identifiers_list(), true) ? $v : $default;
}

/** A moment sent by the app (ISO 8601 with a zone) as a UTC datetime of the database, or null. */
function utc_time($v): ?string
{
    if (!is_string($v) || $v === '' || strlen($v) > 40) return null;
    $ts = strtotime($v);
    if ($ts === false || $ts < 946684800 || $ts > 4102444800) return null;
    return gmdate('Y-m-d H:i:s', $ts);
}

/** A short text without control characters, cut. */
function clean_line($v, int $max): string
{
    if (!is_string($v) && !is_numeric($v)) return '';
    return mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string)$v) ?? ''), 0, $max);
}

function clean_text($v, int $max): string
{
    if (!is_string($v)) return '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    return mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? ''), 0, $max);
}

function clean_id($v, array &$seen): string
{
    $id = is_string($v) && preg_match('/^[a-z0-9]{3,12}$/', $v) && !isset($seen[$v]) ? $v : substr(bin2hex(random_bytes(5)), 0, 8);
    $seen[$id] = true;
    return $id;
}

/** [{id, label}] of the choices, rows or columns of a question: empty labels go, ids are kept or made. */
function clean_opts($in, int $max = MAX_OPTIONS, bool $allowEmpty = false): array
{
    $out = [];
    $seen = [OTHER => true];
    foreach (is_array($in) ? $in : [] as $o) {
        if (count($out) >= $max) break;
        if (is_string($o)) $o = ['label' => $o];
        if (!is_array($o)) continue;
        $label = clean_line($o['label'] ?? '', 300);
        if ($label === '' && !$allowEmpty) continue;
        $out[] = ['id' => clean_id($o['id'] ?? null, $seen), 'label' => $label];
    }
    return $out;
}

function num_or_null($v): ?float
{
    if ($v === null || $v === '' || !is_numeric($v)) return null;
    $f = (float)$v;
    return is_finite($f) && abs($f) < 1e12 ? $f : null;
}

/** A picture inside a form: a data: URL of an image (made smaller by the app), or ''. */
function clean_image($v): string
{
    if (!is_string($v) || strlen($v) > MAX_IMAGE_BYTES * 1.4) return '';
    if (!preg_match('#^data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$#', $v, $m)) return '';
    $bin = base64_decode($m[2], true);
    if ($bin === false || strlen($bin) > MAX_IMAGE_BYTES) return '';
    // the bytes must really be a picture of the kind it says
    $info = @getimagesizefromstring($bin);
    if (!$info || !in_array($info['mime'] ?? '', ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true)) return '';
    return $v;
}

/** The questions sent by the editor, cleaned (see the top of this file). Unknown types and fields go. */
function clean_questions($in): array
{
    $out = [];
    $seen = [];
    foreach (is_array($in) ? $in : [] as $x) {
        if (!is_array($x) || count($out) >= MAX_QUESTIONS) continue;
        $type = in_array($x['t'] ?? '', TYPES, true) ? $x['t'] : null;
        if (!$type) continue;
        $q = ['id' => clean_id($x['id'] ?? null, $seen), 't' => $type, 'title' => clean_text($x['title'] ?? '', 600), 'descr' => clean_text($x['descr'] ?? '', 3000)];
        if (!in_array($type, STATIC_TYPES, true)) $q['req'] = !empty($x['req']);
        switch ($type) {
            case 'short':
            case 'long':
                $q['max'] = max(0, min($type === 'short' ? 500 : 10000, (int)($x['max'] ?? 0)));
                if ($type === 'short') {
                    $q['correct'] = array_values(array_filter(array_map(fn($s) => clean_line($s, 200), array_slice(is_array($x['correct'] ?? null) ? $x['correct'] : [], 0, 20)), fn($s) => $s !== ''));
                    $q['points'] = max(0, min(100, (int)($x['points'] ?? 1)));
                }
                break;
            case 'number':
                $q['min'] = num_or_null($x['min'] ?? null);
                $q['max'] = num_or_null($x['max'] ?? null);
                if ($q['min'] !== null && $q['max'] !== null && $q['min'] > $q['max']) [$q['min'], $q['max']] = [$q['max'], $q['min']];
                $q['int'] = !empty($x['int']);
                break;
            case 'single':
            case 'multi':
            case 'dropdown':
            case 'ranking':
                $q['opts'] = clean_opts($x['opts'] ?? []);
                if (!$q['opts']) $q['opts'] = [['id' => 'o1', 'label' => 'Option 1']];
                $q['shuffle'] = !empty($x['shuffle']);
                if ($type === 'single' || $type === 'multi') $q['other'] = !empty($x['other']);
                if ($type === 'multi') {
                    $q['min'] = max(0, min(count($q['opts']), (int)($x['min'] ?? 0)));
                    $q['max'] = max(0, min(count($q['opts']) + 1, (int)($x['max'] ?? 0)));
                    if ($q['max'] && $q['max'] < $q['min']) $q['max'] = $q['min'];
                }
                if ($type !== 'ranking') {
                    $ids = array_column($q['opts'], 'id');
                    $q['correct'] = array_values(array_intersect(array_map('strval', is_array($x['correct'] ?? null) ? $x['correct'] : []), $ids));
                    if ($type !== 'multi') $q['correct'] = array_slice($q['correct'], 0, 1);
                    $q['points'] = max(0, min(100, (int)($x['points'] ?? 1)));
                }
                break;
            case 'scale':
                $q['min'] = (int)($x['min'] ?? 1) === 0 ? 0 : 1;
                $q['max'] = max(2, min(10, (int)($x['max'] ?? 5)));
                $q['minLabel'] = clean_line($x['minLabel'] ?? '', 60);
                $q['maxLabel'] = clean_line($x['maxLabel'] ?? '', 60);
                break;
            case 'rating':
                $q['max'] = max(3, min(10, (int)($x['max'] ?? 5)));
                $q['icon'] = in_array($x['icon'] ?? '', RATING_ICONS, true) ? $x['icon'] : 'star';
                break;
            case 'grid':
            case 'checkgrid':
                $q['rows'] = clean_opts($x['rows'] ?? [], 50) ?: [['id' => 'r1', 'label' => 'Row 1']];
                $q['cols'] = clean_opts($x['cols'] ?? [], 20) ?: [['id' => 'c1', 'label' => 'Column 1']];
                break;
            case 'image':
                $q['src'] = clean_image($x['src'] ?? '');
                $q['alt'] = clean_line($x['alt'] ?? '', 300);
                break;
        }
        $out[] = $q;
    }
    return $out;
}

/** The settings of a form (see the editor, tab "Settings"): what is not sent keeps its default. */
function clean_settings($in): array
{
    $in = is_array($in) ? $in : [];
    $collect = in_array($in['collectEmail'] ?? '', ['none', 'ask', 'account'], true) ? $in['collectEmail'] : 'none';
    $signin = !empty($in['requireSignin']) || $collect === 'account' || !empty($in['onePerPerson']); // one per person: known only by the account
    return [
        'collectEmail' => $collect,
        'requireSignin' => $signin,
        'onePerPerson' => !empty($in['onePerPerson']),
        'allowEdit' => !empty($in['allowEdit']),
        'showSummary' => !empty($in['showSummary']),
        'progress' => ($in['progress'] ?? true) !== false,
        'shuffleQuestions' => !empty($in['shuffleQuestions']),
        'quiz' => !empty($in['quiz']),
        'showScore' => ($in['showScore'] ?? true) !== false,
        'showAnswers' => !empty($in['showAnswers']),
        'notify' => !empty($in['notify']),
        'limit' => max(0, min(MAX_RESPONSES, (int)($in['limit'] ?? 0))),
        'confirm' => clean_text($in['confirm'] ?? '', 2000),
        'closedMsg' => clean_text($in['closedMsg'] ?? '', 2000),
        'anotherLink' => ($in['anotherLink'] ?? true) !== false,
    ];
}

function clean_theme($in): array
{
    $in = is_array($in) ? $in : [];
    return [
        'color' => valid_color($in['color'] ?? '', FORM_COLORS[0]),
        'font' => in_array($in['font'] ?? '', FONTS, true) ? $in['font'] : 'sans',
        'back' => in_array($in['back'] ?? '', BACKS, true) ? $in['back'] : 'tint',
        'header' => clean_image($in['header'] ?? ''),
    ];
}

function questions_of(array $f): array
{
    $q = json_decode((string)($f['content'] ?? ''), true);
    return is_array($q) ? $q : [];
}

function settings_of(array $f): array
{
    return clean_settings(json_decode((string)($f['settings'] ?? ''), true));
}

function theme_of(array $f): array
{
    $t = json_decode((string)($f['theme'] ?? ''), true);
    return is_array($t) ? array_merge(['color' => FORM_COLORS[0], 'font' => 'sans', 'back' => 'tint', 'header' => ''], $t) : clean_theme([]);
}

// ------------------------------------------------------------------ profile, forms of an account

function profile(array $u, string $tz = 'UTC'): array
{
    $p = q('SELECT * FROM ' . t('form_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('form_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], json_out(['tz' => valid_tz($tz)]), now_utc()]);
        $p = q('SELECT * FROM ' . t('form_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

function form_by_fid($fid): ?array
{
    $fid = valid_code($fid);
    if ($fid === '') return null;
    return q('SELECT * FROM ' . t('form_forms') . ' WHERE fid = ?', [$fid])->fetch() ?: null;
}

/** A form of one's own, or null. */
function form_of(array $u, $fid, bool $lock = false): ?array
{
    $fid = valid_code($fid);
    if ($fid === '') return null;
    return q('SELECT * FROM ' . t('form_forms') . ' WHERE fid = ? AND user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$fid, $u['id']])->fetch() ?: null;
}

/**
 * Whether a form takes answers now: open, closed (by hand or by its deadline: why), soon (before opens_at), full (the
 * limit of answers is reached).
 */
function form_state(array $f, ?array $set = null): array
{
    $set = $set ?? settings_of($f);
    $now = now_utc();
    if (!$f['accepting']) return ['state' => 'closed', 'why' => 'manual'];
    if ($f['opens_at'] && $f['opens_at'] > $now) return ['state' => 'soon', 'why' => 'opens'];
    if ($f['closes_at'] && $f['closes_at'] <= $now) return ['state' => 'closed', 'why' => 'deadline'];
    if ($set['limit'] && (int)$f['responses'] >= $set['limit']) return ['state' => 'full', 'why' => 'limit'];
    return ['state' => 'open', 'why' => ''];
}

/** A form in the list of one's forms (no questions). */
function out_brief(array $f, int $new = 0): array
{
    $st = form_state($f);
    $th = theme_of($f);
    $qs = questions_of($f);
    return [
        'id' => $f['fid'], 'title' => $f['title'], 'color' => $th['color'], 'state' => $st['state'], 'why' => $st['why'],
        'responses' => (int)$f['responses'], 'new' => $new, 'questions' => count(array_filter($qs, fn($x) => !in_array($x['t'] ?? '', STATIC_TYPES, true))),
        'opens' => iso($f['opens_at']), 'closes' => iso($f['closes_at']), 'tz' => $f['tz'], 'inCalendar' => (bool)$f['in_calendar'],
        'starred' => (bool)$f['starred'], 'archived' => (bool)$f['archived'], 'quiz' => settings_of($f)['quiz'],
        'lastResponse' => iso($f['last_response_at']), 'created' => iso($f['created_at']), 'updated' => iso($f['updated_at']),
    ];
}

/** A whole form for its owner (the editor). */
function out_form(array $f): array
{
    return array_merge(out_brief($f), ['descr' => (string)$f['descr'], 'items' => questions_of($f), 'settings' => settings_of($f), 'theme' => theme_of($f), 'accepting' => (bool)$f['accepting']]);
}

/** What anybody with the link sees: never the right answers of a quiz, never the answers of others. */
function public_form(array $f): array
{
    $set = settings_of($f);
    $st = form_state($f, $set);
    $items = array_map(function ($x) {
        unset($x['correct'], $x['points']);
        return $x;
    }, questions_of($f));
    return [
        'id' => $f['fid'], 'title' => $f['title'], 'descr' => (string)$f['descr'], 'items' => $items, 'theme' => theme_of($f),
        'state' => $st['state'], 'why' => $st['why'], 'opens' => iso($f['opens_at']), 'closes' => iso($f['closes_at']), 'tz' => $f['tz'],
        'settings' => array_intersect_key($set, array_flip(['collectEmail', 'requireSignin', 'onePerPerson', 'allowEdit', 'showSummary', 'progress', 'shuffleQuestions', 'quiz', 'showScore', 'closedMsg', 'anotherLink'])),
    ];
}

// ------------------------------------------------------------------ answers

/** A wrong answer: the app shows it next to the question. */
function answer_fail(string $code, string $qid): void
{
    if (db_in_transaction()) db()->rollBack();
    send_json(['ok' => false, 'error' => $code, 'question' => $qid], 422);
}

/** A wrong answer, with the question it belongs to. */
class AnswerError extends Exception
{
    public $qid;

    public function __construct(string $code, string $qid)
    {
        parent::__construct($code);
        $this->qid = $qid;
    }
}

function bad(string $code, string $qid): void
{
    throw new AnswerError($code, $qid);
}

/**
 * The answers sent, checked against the questions (types, choices, limits, required ones). Unknown keys go. A wrong one
 * throws AnswerError; $soft (answers read from a file) leaves it out instead and ignores "required".
 */
function clean_answers(array $items, $in, bool $soft = false): array
{
    $in = is_array($in) ? $in : [];
    $out = [];
    foreach ($items as $q) {
        $t = $q['t'];
        if (in_array($t, STATIC_TYPES, true)) continue;
        $id = $q['id'];
        $v = $in[$id] ?? null;
        $given = false;
        if ($soft) $q['req'] = false;
        try {
        switch ($t) {
            case 'short':
            case 'long':
            case 'email':
                $s = $t === 'long' ? clean_text($v, $q['max'] ?: 10000) : clean_line($v, $t === 'email' ? 190 : ($q['max'] ?: 500));
                if ($s !== '') {
                    if ($t === 'email' && !filter_var($s, FILTER_VALIDATE_EMAIL)) bad('answer_email', $id);
                    if (!empty($q['max']) && mb_strlen($s) > $q['max']) bad('answer_long', $id);
                    $out[$id] = $s;
                    $given = true;
                }
                break;
            case 'number':
                if ($v !== null && $v !== '') {
                    $n = num_or_null(is_string($v) ? str_replace(',', '.', $v) : $v);
                    if ($n === null) bad('answer_number', $id);
                    if (!empty($q['int']) && floor($n) != $n) bad('answer_int', $id);
                    if ($q['min'] !== null && $n < $q['min'] || $q['max'] !== null && $n > $q['max']) bad('answer_range', $id);
                    $out[$id] = $n == floor($n) && abs($n) < 1e15 ? (int)$n : $n;
                    $given = true;
                }
                break;
            case 'date':
                if (is_string($v) && $v !== '') {
                    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) bad('answer_date', $id);
                    $out[$id] = $v;
                    $given = true;
                }
                break;
            case 'time':
                if (is_string($v) && $v !== '') {
                    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) bad('answer_time', $id);
                    $out[$id] = $v;
                    $given = true;
                }
                break;
            case 'single':
            case 'dropdown':
                if (is_string($v) && $v !== '') {
                    $ids = array_column($q['opts'], 'id');
                    if ($v === OTHER && !empty($q['other'])) {
                        $o = clean_line($in[$id . OTHER] ?? '', 300);
                        if ($o === '') bad('answer_other', $id);
                        $out[$id] = OTHER;
                        $out[$id . OTHER] = $o;
                    } elseif (in_array($v, $ids, true)) $out[$id] = $v;
                    else bad('answer_choice', $id);
                    $given = true;
                }
                break;
            case 'multi':
                $list = array_values(array_unique(array_filter(is_array($v) ? $v : [], 'is_string')));
                if ($list) {
                    $ids = array_column($q['opts'], 'id');
                    foreach ($list as $c) if (!in_array($c, $ids, true) && !($c === OTHER && !empty($q['other']))) bad('answer_choice', $id);
                    if (in_array(OTHER, $list, true)) {
                        $o = clean_line($in[$id . OTHER] ?? '', 300);
                        if ($o === '') bad('answer_other', $id);
                        $out[$id . OTHER] = $o;
                    }
                    if (!empty($q['min']) && count($list) < $q['min']) bad('answer_few', $id);
                    if (!empty($q['max']) && count($list) > $q['max']) bad('answer_many', $id);
                    // kept in the order of the options
                    usort($list, fn($a, $b) => (array_search($a, $ids, true) === false ? 999 : array_search($a, $ids, true)) <=> (array_search($b, $ids, true) === false ? 999 : array_search($b, $ids, true)));
                    $out[$id] = $list;
                    $given = true;
                }
                break;
            case 'scale':
            case 'rating':
                if ($v !== null && $v !== '') {
                    if (!is_numeric($v) || (int)$v != $v) bad('answer_choice', $id);
                    $n = (int)$v;
                    $lo = $t === 'scale' ? $q['min'] : 1;
                    if ($n < $lo || $n > $q['max']) bad('answer_range', $id);
                    $out[$id] = $n;
                    $given = true;
                }
                break;
            case 'grid':
            case 'checkgrid':
                $rows = array_column($q['rows'], 'id');
                $cols = array_column($q['cols'], 'id');
                $g = [];
                foreach (is_array($v) ? $v : [] as $r => $c) {
                    if (!in_array((string)$r, $rows, true)) continue;
                    if ($t === 'grid') {
                        if (is_string($c) && in_array($c, $cols, true)) $g[(string)$r] = $c;
                    } else {
                        $cs = array_values(array_intersect($cols, array_filter(is_array($c) ? $c : [], 'is_string')));
                        if ($cs) $g[(string)$r] = $cs;
                    }
                }
                if ($g) {
                    if (!empty($q['req']) && count($g) < count($rows)) bad('answer_rows', $id);
                    $out[$id] = $g;
                    $given = true;
                }
                break;
            case 'ranking':
                $ids = array_column($q['opts'], 'id');
                $list = array_values(array_filter(is_array($v) ? $v : [], 'is_string'));
                if ($list) {
                    if (count($list) !== count($ids) || array_diff($ids, $list) || count(array_unique($list)) !== count($list)) bad('answer_choice', $id);
                    $out[$id] = $list;
                    $given = true;
                }
                break;
        }
        if (!$given && !empty($q['req'])) bad('answer_required', $id);
        } catch (AnswerError $e) {
            if (!$soft) throw $e;
            unset($out[$id], $out[$id . OTHER]);
        }
    }
    $bytes = strlen(json_out($out));
    if ($bytes > MAX_ANSWER_BYTES) {
        if ($soft) return [];
        fail('too_big', 413);
    }
    return $out;
}

/**
 * The score of a quiz: [score, max, per question {id: [right, points got, points]}]. Only questions with a right answer
 * count: one choice (the right one), some choices (exactly the right ones), a line (one of the right texts, case and
 * spaces do not matter).
 */
function score_of(array $items, array $answers): array
{
    $score = 0;
    $max = 0;
    $per = [];
    foreach ($items as $q) {
        if (empty($q['correct']) || !in_array($q['t'], ['single', 'dropdown', 'multi', 'short'], true)) continue;
        $pts = (int)($q['points'] ?? 1);
        $max += $pts;
        $a = $answers[$q['id']] ?? null;
        if ($q['t'] === 'multi') {
            $got = is_array($a) ? $a : [];
            sort($got);
            $want = $q['correct'];
            sort($want);
            $ok = $got === $want;
        } elseif ($q['t'] === 'short') {
            $norm = fn($s) => mb_strtolower(preg_replace('/\s+/u', ' ', trim((string)$s)));
            $ok = is_string($a) && in_array($norm($a), array_map($norm, $q['correct']), true);
        } else $ok = is_string($a) && in_array($a, $q['correct'], true);
        if ($ok) $score += $pts;
        $per[$q['id']] = ['right' => $ok, 'got' => $ok ? $pts : 0, 'points' => $pts];
    }
    return [$score, $max, $per];
}

/** For who answered a quiz: the score, and the right answers when the form shows them. */
function quiz_feedback(array $f, array $answers): ?array
{
    $set = settings_of($f);
    if (!$set['quiz'] || !$set['showScore']) return null;
    $items = questions_of($f);
    [$score, $max, $per] = score_of($items, $answers);
    if (!$max) return null;
    $out = ['score' => $score, 'max' => $max, 'per' => (object)$per];
    if ($set['showAnswers']) {
        $right = [];
        foreach ($items as $q) if (!empty($q['correct'])) $right[$q['id']] = $q['correct'];
        $out['correct'] = (object)$right;
    }
    return $out;
}

function out_response(array $r): array
{
    return [
        'id' => $r['rid'], 'answers' => (object)(json_decode((string)$r['answers'], true) ?: []), 'name' => $r['name'], 'email' => $r['email'],
        'account' => $r['user_id'] !== null, 'score' => $r['score'] !== null ? (float)$r['score'] : null, 'maxScore' => $r['max_score'] !== null ? (float)$r['max_score'] : null,
        'seconds' => $r['seconds'] !== null ? (int)$r['seconds'] : null, 'created' => iso($r['created_at']), 'updated' => iso($r['updated_at']),
    ];
}

/** Counts the answers of a form again (after some are deleted). */
function recount(int $formId): void
{
    q('UPDATE ' . t('form_forms') . ' f SET responses = (SELECT COUNT(*) FROM ' . t('form_responses') . ' r WHERE r.form_id = f.id),
        last_response_at = (SELECT MAX(created_at) FROM ' . t('form_responses') . ' r WHERE r.form_id = f.id) WHERE f.id = ?', [$formId]);
}

/** The answers of a form, a thousand at a time (the oldest first): fn(row). */
function each_response(int $formId, callable $fn): void
{
    $last = 0;
    do {
        $rows = q('SELECT * FROM ' . t('form_responses') . ' WHERE form_id = ? AND id > ? ORDER BY id LIMIT 1000', [$formId, $last])->fetchAll();
        foreach ($rows as $r) {
            $last = (int)$r['id'];
            $fn($r);
        }
    } while (count($rows) === 1000);
}

/** The day of a UTC moment in a zone (YYYY-MM-DD). */
function day_in(string $utc, string $tz): string
{
    try {
        $d = new DateTime($utc, new DateTimeZone('UTC'));
        $d->setTimezone(new DateTimeZone($tz));
        return $d->format('Y-m-d');
    } catch (Throwable $e) {
        return substr($utc, 0, 10);
    }
}

/**
 * What the charts of the answers show, question by question (the app draws them):
 *   choices: counts by option (and "other" with its last texts) · scale, rating: counts by value, average ·
 *   number: count, average, median, smallest, largest, ten bars · date: counts by day · time: counts by hour ·
 *   texts: the last ones and the most repeated · grid: counts by row and column · ranking: average place, firsts ·
 * and for the form: answers by day (in the zone of the form) and, for a quiz, the scores.
 */
function summarize(array $f): array
{
    $items = array_values(array_filter(questions_of($f), fn($q) => !in_array($q['t'], STATIC_TYPES, true)));
    $tz = valid_tz($f['tz'], 'UTC');
    $S = [];
    foreach ($items as $q) $S[$q['id']] = ['n' => 0];
    $days = [];
    $scores = [];
    $secs = [];
    $nums = [];
    $total = 0;
    each_response((int)$f['id'], function ($r) use (&$S, &$days, &$scores, &$secs, &$nums, &$total, $items, $tz) {
        $total++;
        $a = json_decode((string)$r['answers'], true) ?: [];
        $d = day_in($r['created_at'], $tz);
        $days[$d] = ($days[$d] ?? 0) + 1;
        if ($r['score'] !== null) $scores[] = (float)$r['score'];
        if ($r['seconds'] !== null) $secs[] = (int)$r['seconds'];
        foreach ($items as $q) {
            $id = $q['id'];
            if (!array_key_exists($id, $a)) continue;
            $v = $a[$id];
            $s = &$S[$id];
            $s['n']++;
            switch ($q['t']) {
                case 'single':
                case 'dropdown':
                    $s['c'][$v] = ($s['c'][$v] ?? 0) + 1;
                    if ($v === OTHER) $s['others'][] = (string)($a[$id . OTHER] ?? '');
                    break;
                case 'multi':
                    foreach ((array)$v as $c) $s['c'][$c] = ($s['c'][$c] ?? 0) + 1;
                    if (in_array(OTHER, (array)$v, true)) $s['others'][] = (string)($a[$id . OTHER] ?? '');
                    break;
                case 'scale':
                case 'rating':
                    $s['c'][(string)$v] = ($s['c'][(string)$v] ?? 0) + 1;
                    $s['sum'] = ($s['sum'] ?? 0) + (int)$v;
                    break;
                case 'number':
                    $nums[$id][] = (float)$v;
                    break;
                case 'date':
                    $s['c'][(string)$v] = ($s['c'][(string)$v] ?? 0) + 1;
                    break;
                case 'time':
                    $hh = (int)substr((string)$v, 0, 2);
                    $s['c'][$hh] = ($s['c'][$hh] ?? 0) + 1;
                    break;
                case 'short':
                case 'long':
                case 'email':
                    $s['texts'][] = (string)$v;
                    if ($q['t'] !== 'long') {
                        $k = mb_strtolower(trim((string)$v));
                        $s['same'][$k] = ($s['same'][$k] ?? 0) + 1;
                    }
                    break;
                case 'grid':
                    foreach ((array)$v as $row => $col) $s['g'][$row][$col] = ($s['g'][$row][$col] ?? 0) + 1;
                    break;
                case 'checkgrid':
                    foreach ((array)$v as $row => $cols) foreach ((array)$cols as $col) $s['g'][$row][$col] = ($s['g'][$row][$col] ?? 0) + 1;
                    break;
                case 'ranking':
                    foreach ((array)$v as $i => $c) {
                        $s['pos'][$c] = ($s['pos'][$c] ?? 0) + $i + 1;
                        if ($i === 0) $s['first'][$c] = ($s['first'][$c] ?? 0) + 1;
                    }
                    break;
            }
            unset($s);
        }
    });
    $out = [];
    foreach ($items as $q) {
        $id = $q['id'];
        $s = $S[$id];
        $x = ['id' => $id, 't' => $q['t'], 'n' => $s['n']];
        switch ($q['t']) {
            case 'single':
            case 'dropdown':
            case 'multi':
                $x['counts'] = (object)($s['c'] ?? []);
                $x['others'] = array_slice(array_reverse($s['others'] ?? []), 0, 50);
                break;
            case 'scale':
            case 'rating':
                $x['counts'] = (object)($s['c'] ?? []);
                $x['avg'] = $s['n'] ? round(($s['sum'] ?? 0) / $s['n'], 2) : null;
                break;
            case 'number':
                $v = $nums[$id] ?? [];
                sort($v);
                $n = count($v);
                $x['avg'] = $n ? round(array_sum($v) / $n, 3) : null;
                $x['median'] = $n ? ($n % 2 ? $v[intdiv($n, 2)] : ($v[$n / 2 - 1] + $v[$n / 2]) / 2) : null;
                $x['min'] = $n ? $v[0] : null;
                $x['max'] = $n ? $v[$n - 1] : null;
                $x['bins'] = number_bins($v);
                break;
            case 'date':
                $c = $s['c'] ?? [];
                ksort($c);
                $x['counts'] = (object)$c;
                break;
            case 'time':
                $x['counts'] = (object)($s['c'] ?? []);
                break;
            case 'short':
            case 'long':
            case 'email':
                $x['texts'] = array_slice(array_reverse($s['texts'] ?? []), 0, 200);
                if (!empty($s['same'])) {
                    arsort($s['same']);
                    $x['same'] = array_slice(array_map(fn($k, $c) => [$k, $c], array_keys($s['same']), $s['same']), 0, 10);
                    $x['same'] = array_values(array_filter($x['same'], fn($p) => $p[1] > 1));
                }
                break;
            case 'grid':
            case 'checkgrid':
                $x['grid'] = (object)array_map(fn($r) => (object)$r, $s['g'] ?? []);
                break;
            case 'ranking':
                $x['avg'] = (object)array_map(fn($p) => $s['n'] ? round($p / $s['n'], 2) : null, $s['pos'] ?? []);
                $x['first'] = (object)($s['first'] ?? []);
                break;
        }
        $out[] = $x;
    }
    ksort($days);
    sort($secs);
    return [
        'total' => $total, 'days' => (object)$days, 'items' => $out,
        'scores' => $scores ? ['avg' => round(array_sum($scores) / count($scores), 2), 'bins' => array_count_values(array_map(fn($s) => (string)round($s), $scores))] : null,
        'medianSeconds' => $secs ? $secs[intdiv(count($secs), 2)] : null,
    ];
}

/** Ten bars of the same width between the smallest and the largest number (fewer when there are few different values). */
function number_bins(array $v): array
{
    if (!$v) return [];
    $lo = $v[0];
    $hi = $v[count($v) - 1];
    $distinct = array_values(array_unique($v));
    if (count($distinct) <= 12) {
        $c = array_count_values(array_map(fn($x) => (string)$x, $v));
        return array_map(fn($k) => ['from' => (float)$k, 'to' => (float)$k, 'n' => $c[(string)$k]], $distinct);
    }
    $w = ($hi - $lo) / 10;
    $bins = [];
    for ($i = 0; $i < 10; $i++) $bins[] = ['from' => $lo + $w * $i, 'to' => $lo + $w * ($i + 1), 'n' => 0];
    foreach ($v as $x) $bins[min(9, (int)floor(($x - $lo) / $w))]['n']++;
    return $bins;
}

/** One answer as text for a table (the CSV file): the labels of the options, not their ids. */
function answer_text(array $q, array $a): string
{
    $id = $q['id'];
    if (!array_key_exists($id, $a)) return '';
    $v = $a[$id];
    $label = function ($oid) use ($q, $a, $id) {
        if ($oid === OTHER) return (string)($a[$id . OTHER] ?? '');
        foreach ($q['opts'] ?? [] as $o) if ($o['id'] === $oid) return $o['label'];
        return '';
    };
    switch ($q['t']) {
        case 'single':
        case 'dropdown':
            return $label($v);
        case 'multi':
        case 'ranking':
            return implode('; ', array_map($label, (array)$v));
        default:
            return is_scalar($v) ? (string)$v : '';
    }
}

/** The columns of the CSV file: [header, fn(answers)] (a grid has one column per row). */
function csv_columns(array $items): array
{
    $cols = [];
    foreach ($items as $q) {
        if (in_array($q['t'], STATIC_TYPES, true)) continue;
        $title = $q['title'] !== '' ? $q['title'] : '#' . $q['id'];
        if ($q['t'] === 'grid' || $q['t'] === 'checkgrid') {
            foreach ($q['rows'] as $row) {
                $cols[] = [$title . ' [' . $row['label'] . ']', function ($a) use ($q, $row) {
                    $v = $a[$q['id']][$row['id']] ?? null;
                    $name = function ($cid) use ($q) {
                        foreach ($q['cols'] as $c) if ($c['id'] === $cid) return $c['label'];
                        return '';
                    };
                    return $v === null ? '' : implode('; ', array_map($name, (array)$v));
                }];
            }
        } else $cols[] = [$title, fn($a) => answer_text($q, $a)];
    }
    return $cols;
}

/** A cell of a CSV file, safe for spreadsheets (a text that starts like a formula is not run as one). */
function csv_cell($v): string
{
    $s = (string)$v;
    if ($s !== '' && strpbrk($s[0], '=+-@') !== false && !is_numeric($s)) $s = "'" . $s;
    return '"' . str_replace('"', '""', $s) . '"';
}
