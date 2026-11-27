<?php
/**
 * SavAwards — JSON API.  api/index.php?r=<action>
 *
 * Accounts:   auth.config, auth.me, auth.register, auth.login, auth.resend, auth.verify, auth.logout, auth.password,
 *             auth.forgot, auth.reset, auth.profile, auth.export, auth.delete (and SavAccount: ../identity/identity.php)
 * Public:     pub.meta, pub.home, pub.products, pub.product, pub.compare, pub.edition, pub.logo, pub.shot, pub.verify
 * Members:    me.activity, me.fav, me.review, me.review.delete, me.helpful, me.comment, me.comment.delete, me.report,
 *             me.request, me.suggest, me.vote
 * Staff:      staff.queue, staff.request, staff.report, staff.moderate, staff.suggestion             (moderators: their products)
 *             staff.alternatives, staff.products, staff.product, staff.product.save, staff.shot.add, staff.shots.save                                       (moderators: their products)
 *             staff.import, staff.product.delete, staff.criteria, staff.criteria.save, staff.categories.save, staff.users, staff.user.save,
 *             staff.editions, staff.edition, staff.edition.save, staff.edition.delete, staff.acat.save, staff.acat.delete,
 *             staff.nominees.save, staff.audit                                                         (administrators)
 *             staff.certs, staff.cert.issue, staff.cert.revoke, staff.cert.restore                     (master administrators)
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/catalog.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    error_log('SavAwards API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);
if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}

function writer(bool $unverifiedOk = false): array
{
    only('POST');
    $u = require_user($unverifiedOk);
    require_csrf($u);
    return $u;
}

function reader(): array
{
    only('GET');
    return require_user();
}

/** A member of the staff with at least this role (GET or POST, CSRF checked on POST). */
function staff(int $min): array
{
    $u = $_SERVER['REQUEST_METHOD'] === 'POST' ? writer() : reader();
    if ($u['role'] < $min) fail('forbidden', 403);
    return $u;
}

/** The signed-in user when there is one (public pages show more to them), never failing. */
function viewer(): ?array
{
    $u = current_user();
    return $u && $u['status'] === 'active' && !empty($u['email_verified_at']) ? $u : null;
}

function validate_password(string $pw): void
{
    if (mb_strlen($pw) < 8) fail('password_short', 422);
    if (mb_strlen($pw) > 200) fail('password_long', 422);
}

function ui_lang(array $b): string
{
    $l = (string)($b['lang'] ?? '');
    return in_array($l, LANGS, true) ? $l : lang();
}

function valid_email(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) fail('email_invalid', 422);
}

function new_user(string $name, string $email, string $hash, string $lang): int
{
    q('INSERT INTO ' . t('users') . ' (name, email, password_hash, ui_lang, created_at, last_login_at) VALUES (?,?,?,?,?,?)', [mb_substr($name, 0, 80), $email, $hash, $lang, now_utc(), now_utc()]);
    return (int)db()->lastInsertId();
}

function signed_in(int $uid): void
{
    q('UPDATE ' . t('users') . ' SET last_login_at = ? WHERE id = ?', [now_utc(), $uid]);
    $csrf = create_auth_session($uid);
    send_json(['ok' => true, 'user' => public_user(user_row($uid)), 'csrf' => $csrf]);
}

function int_in(array $b, string $k): int
{
    return (int)($b[$k] ?? 0);
}

function product_or_404(int $id, bool $staff = false): array
{
    $p = $id ? product_row((string)$id, $staff) : null;
    if (!$p) fail('not_found', 404);
    return $p;
}

// ---------- SavAccount: signing in and joining an account that already exists ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

identity_setup([
    'name' => 'SavAwards', 'cookie' => 'savawards', 'lang' => fn() => lang(),
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', ui_lang($b)),
    'writer' => fn() => writer(),
]);
identity_route($r);

switch ($r) {

    // ================================================================ accounts

    case 'auth.config':
        send_json(['ok' => true, 'installed' => true, 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null]);

    case 'auth.me':
        only('GET');
        $u = current_user();
        if (!$u || $u['status'] !== 'active') send_json(['ok' => true, 'user' => null]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id'])), 'csrf' => $u['csrf_token']]);

    case 'auth.register':
        only('POST');
        if (too_many_attempts('register', 5, 60)) fail('rate_limited', 429);
        $b = body();
        $name = s($b, 'name', 80);
        $email = mb_strtolower(s($b, 'email', 190));
        $pw = (string)($b['password'] ?? '');
        if (mb_strlen($name) < 2) fail('name_required', 422);
        valid_email($email);
        validate_password($pw);
        if (empty($b['acceptTerms'])) fail('terms_required', 422);
        // The same answer whether the address is new or already registered
        $row = q('SELECT * FROM ' . t('users') . ' WHERE email = ?', [$email])->fetch();
        record_attempt('register');
        if (!$row) send_account_link(user_row(new_user($name, $email, password_hash($pw, PASSWORD_DEFAULT), ui_lang($b))), ui_lang($b), 'verify');
        elseif (empty($row['email_verified_at']) && $row['status'] === 'active' && !too_many_attempts('verify_mail', 3, 60)) {
            record_attempt('verify_mail');
            send_account_link($row, ui_lang($b), 'verify');
        }
        send_json(['ok' => true, 'checkEmail' => true]);

    case 'auth.login':
        only('POST');
        if (too_many_attempts('login', 10, 15)) fail('rate_limited', 429);
        $b = body();
        $row = q('SELECT * FROM ' . t('users') . ' WHERE email = ?', [mb_strtolower(s($b, 'email', 190))])->fetch();
        $pw = (string)($b['password'] ?? '');
        $ok = $row && $row['password_hash'] !== '' ? password_verify($pw, $row['password_hash']) : password_hash($pw, PASSWORD_DEFAULT) === '';
        if (!$ok) {
            record_attempt('login');
            fail('bad_credentials', 401);
        }
        if ($row['status'] !== 'active') fail('disabled', 403);
        clear_attempts('login');
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) q('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
        signed_in((int)$row['id']);

    case 'auth.resend':
        $u = writer(true);
        if (!empty($u['email_verified_at'])) send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);
        if (too_many_attempts('verify_mail', 3, 60)) fail('rate_limited', 429);
        record_attempt('verify_mail');
        send_account_link(user_row($u['id']), ui_lang(body()), 'verify');
        send_json(['ok' => true]);

    case 'auth.verify':
        // The link of the email opens the app, which asks for this with a button: mail scanners that open links do nothing
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $uid = (int)q('SELECT user_id FROM ' . t('email_tokens') . " WHERE token_hash = ? AND purpose = 'verify' AND expires_at > ?", [hash('sha256', (string)(body()['token'] ?? '')), now_utc()])->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        q('UPDATE ' . t('users') . ' SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', [now_utc(), $uid]);
        q('DELETE FROM ' . t('email_tokens') . " WHERE user_id = ? AND purpose = 'verify'", [$uid]);
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        signed_in($uid);

    case 'auth.logout':
        only('POST');
        $u = current_user();
        if ($u) require_csrf($u);
        destroy_auth_session();
        send_json(['ok' => true]);

    case 'auth.password':
        $u = writer();
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['current'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        q('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.forgot':
        only('POST');
        if (too_many_attempts('forgot', 5, 60)) fail('rate_limited', 429);
        record_attempt('forgot');
        $b = body();
        $row = q('SELECT * FROM ' . t('users') . " WHERE email = ? AND status = 'active'", [mb_strtolower(s($b, 'email', 190))])->fetch();
        if ($row) send_account_link($row, ui_lang($b), 'reset');
        send_json(['ok' => true]);

    case 'auth.reset':
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $b = body();
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        $uid = (int)q('SELECT user_id FROM ' . t('email_tokens') . " WHERE token_hash = ? AND purpose = 'reset' AND expires_at > ?", [hash('sha256', (string)($b['token'] ?? '')), now_utc()])->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        q('UPDATE ' . t('users') . ' SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), now_utc(), $uid]);
        q('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ?', [$uid]);
        q('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?', [$uid]);
        signed_in($uid);

    case 'auth.profile':
        $u = writer(true);
        $b = body();
        $name = s($b, 'name', 80);
        if ($name !== '' && mb_strlen($name) < 2) fail('name_required', 422);
        q('UPDATE ' . t('users') . " SET name = IF(? = '', name, ?), ui_lang = ? WHERE id = ?", [$name, $name, ui_lang($b), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.export':
        // Everything SavAwards keeps about the account, as one JSON file
        $u = reader();
        $uid = $u['id'];
        header('Content-Disposition: attachment; filename="savawards-data.json"');
        send_json(['app' => 'SavAwards', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at']), 'role' => (int)$u['role']],
            'favourites' => q('SELECT p.name, p.slug, f.created_at FROM ' . t('favorites') . ' f JOIN ' . t('products') . ' p ON p.id = f.product_id WHERE f.user_id = ?', [$uid])->fetchAll(),
            'reviews' => q('SELECT p.name AS product, r.rating, r.title, r.body, r.used_on, r.created_at, r.updated_at FROM ' . t('reviews') . ' r JOIN ' . t('products') . ' p ON p.id = r.product_id WHERE r.user_id = ?', [$uid])->fetchAll(),
            'comments' => q('SELECT p.name AS product, c.body, c.created_at FROM ' . t('comments') . ' c JOIN ' . t('products') . ' p ON p.id = c.product_id WHERE c.user_id = ?', [$uid])->fetchAll(),
            'editRequests' => q('SELECT p.name AS product, e.field, e.proposal, e.reason, e.status, e.reply, e.created_at FROM ' . t('edit_requests') . ' e JOIN ' . t('products') . ' p ON p.id = e.product_id WHERE e.user_id = ?', [$uid])->fetchAll(),
            'suggestions' => q('SELECT name, website, alternative_to, reason, status, reply, created_at FROM ' . t('suggestions') . ' WHERE user_id = ?', [$uid])->fetchAll(),
            'votes' => q('SELECT e.year, ac.name_en AS award, p.name AS product FROM ' . t('votes') . ' v JOIN ' . t('award_categories') . ' ac ON ac.id = v.category_id JOIN ' . t('editions') . ' e ON e.id = ac.edition_id JOIN ' . t('products') . ' p ON p.id = v.product_id WHERE v.user_id = ?', [$uid])->fetchAll(),
        ]);

    case 'auth.delete':
        $u = writer(true);
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)(body()['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        if ((int)$row['role'] >= ROLE_MASTER && (int)q('SELECT COUNT(*) FROM ' . t('users') . ' WHERE role >= ?', [ROLE_MASTER])->fetchColumn() <= 1) fail('last_master', 422);
        q('UPDATE ' . t('edit_requests') . ' SET user_id = NULL WHERE user_id = ?', [$u['id']]);
        q('UPDATE ' . t('suggestions') . ' SET user_id = NULL WHERE user_id = ?', [$u['id']]);
        q('DELETE FROM ' . t('reports') . ' WHERE user_id = ?', [$u['id']]);
        q('DELETE FROM ' . t('users') . ' WHERE id = ?', [$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);

    // ================================================================ public

    case 'pub.meta':
        // What the app needs at the start: categories (with how many products), criteria, alternatives, editions
        only('GET');
        $counts = q('SELECT category_id, COUNT(*) n FROM ' . t('products') . " WHERE status = 'published' GROUP BY category_id")->fetchAll(PDO::FETCH_KEY_PAIR);
        send_json(['ok' => true,
            'categories' => array_map(fn($c) => $c + ['n' => (int)($counts[$c['id']] ?? 0)], categories()),
            'criteria' => array_map('criterion_out', criteria()),
            'platforms' => PLATFORMS, 'pricing' => PRICING, 'features' => FEATURES, 'europe' => EUROPE, 'requestFields' => REQUEST_FIELDS,
            'alternatives' => alternatives_index(),
            'editions' => array_map(fn($e) => edition_out($e), q('SELECT * FROM ' . t('editions') . " WHERE status <> 'draft' ORDER BY year DESC")->fetchAll()),
        ]);

    case 'pub.home':
        only('GET');
        $latest = q('SELECT * FROM ' . t('editions') . " WHERE status = 'published' ORDER BY year DESC LIMIT 1")->fetch();
        // this year's contenders: the newest edition whose nominees are public but whose winners are not yet
        $current = q('SELECT * FROM ' . t('editions') . " WHERE status IN ('nominees','voting') AND year > ? ORDER BY year DESC LIMIT 1", [$latest ? (int)$latest['year'] : 0])->fetch();
        $contenders = $current ? array_values(array_filter(array_map(fn($c) => ['name' => $c['name'], 'kind' => $c['kind'],
            'nominees' => array_map(fn($n) => ['slug' => $n['slug'], 'name' => $n['name'], 'logo' => $n['logo'], 'score' => $n['score']], $c['nominees'])], edition_full($current, null)['categories']), fn($c) => $c['nominees'])) : [];
        $winners = [];
        if ($latest) {
            foreach (edition_full($latest, null)['categories'] as $c) {
                foreach ($c['nominees'] as $n) if ($n['place'] === 1) $winners[] = ['award' => $c['name'], 'kind' => $c['kind'], 'product' => $n];
            }
        }
        send_json(['ok' => true,
            'stats' => [
                'products' => (int)q('SELECT COUNT(*) FROM ' . t('products') . " WHERE status = 'published'")->fetchColumn(),
                'criteria' => (int)q('SELECT COUNT(*) FROM ' . t('criteria') . ' WHERE active = 1')->fetchColumn(),
                'reviews' => (int)q('SELECT COUNT(*) FROM ' . t('reviews') . " WHERE status = 'visible'")->fetchColumn(),
                'europe' => (int)q('SELECT COUNT(*) FROM ' . t('products') . " WHERE status = 'published' AND country IN (" . implode(',', array_map(fn($c) => "'$c'", EUROPE)) . ')')->fetchColumn(),
            ],
            'top' => product_list(['sort' => 'score'], false, 6),
            'community' => product_list(['sort' => 'community', 'rated' => true], false, 6),
            'recent' => product_list(['sort' => 'recent'], false, 6),
            'latest' => $latest ? edition_out($latest) + ['winners' => $winners] : null,
            'current' => $current ? edition_out($current) + ['categories' => $contenders] : null,
            'voting' => $current && $current['status'] === 'voting' ? edition_out($current) : null,
        ]);

    case 'pub.products':
        only('GET');
        $g = $_GET;
        send_json(['ok' => true, 'products' => product_list([
            'q' => s($g, 'q', 80), 'cat' => s($g, 'cat', 60), 'europe' => !empty($g['europe']), 'os' => !empty($g['os']), 'free' => !empty($g['free']),
            'selfhost' => !empty($g['selfhost']), 'green' => !empty($g['green']), 'platform' => s($g, 'platform', 20), 'alt' => s($g, 'alt', 80), 'sort' => s($g, 'sort', 20),
        ])]);

    case 'pub.product':
        only('GET');
        $me = viewer();
        $isStaff = $me && $me['role'] >= ROLE_MOD;
        $p = product_row(s($_GET, 'slug', 90), $isStaff);
        if (!$p) fail('not_found', 404);
        $staffHere = $me && can_edit_product($me, (int)$p['id']);
        $out = product_full($p, $me);
        $out['reviews'] = product_reviews((int)$p['id'], $me, $staffHere);
        $out['comments'] = product_comments((int)$p['id'], $me, $staffHere);
        send_json(['ok' => true, 'product' => $out]);

    case 'pub.compare':
        only('GET');
        $out = [];
        foreach (array_slice(csv_list(s($_GET, 'slugs', 400)), 0, 4) as $slug) {
            $p = product_row($slug);
            if ($p) $out[] = product_full($p, null);
        }
        send_json(['ok' => true, 'products' => $out, 'criteria' => array_map('criterion_out', criteria())]);

    case 'pub.edition':
        only('GET');
        $me = viewer();
        $e = q('SELECT * FROM ' . t('editions') . ' WHERE year = ?', [(int)($_GET['year'] ?? 0)])->fetch();
        if (!$e || ($e['status'] === 'draft' && !($me && $me['role'] >= ROLE_ADMIN))) fail('not_found', 404);
        send_json(['ok' => true, 'edition' => edition_full($e, $me)]);

    case 'pub.logo':
        $row = q('SELECT logo, logo_mime FROM ' . t('products') . ' WHERE id = ?', [(int)($_GET['id'] ?? 0)])->fetch();
        if (!$row || !$row['logo_mime']) {
            http_response_code(404);
            exit;
        }
        header('Content-Type: ' . $row['logo_mime']);
        header('Cache-Control: public, max-age=604800');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'");
        echo base64_decode((string)$row['logo']);
        exit;

    case 'pub.shot':
        // a screenshot; those of drafts only for the staff
        $row = q('SELECT s.data, s.mime, p.status FROM ' . t('shots') . ' s JOIN ' . t('products') . ' p ON p.id = s.product_id WHERE s.id = ?', [(int)($_GET['id'] ?? 0)])->fetch();
        $me = viewer();
        if (!$row || ($row['status'] !== 'published' && !($me && $me['role'] >= ROLE_MOD))) {
            http_response_code(404);
            exit;
        }
        header('Content-Type: ' . $row['mime']);
        header('Cache-Control: ' . ($row['status'] === 'published' ? 'public, max-age=604800' : 'private, no-store'));
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'");
        echo base64_decode((string)$row['data']);
        exit;

    case 'pub.verify':
        only('GET');
        if (too_many_attempts('cert', 60, 10)) fail('rate_limited', 429);
        $c = cert_find(s($_GET, 'code', 40));
        if (!$c) {
            record_attempt('cert');
            send_json(['ok' => true, 'found' => false]);
        }
        send_json(['ok' => true, 'found' => true, 'code' => cert_display($c['code']), 'url' => cert_url($c), 'revoked' => (bool)$c['revoked_at'], 'kind' => $c['kind'],
            'product' => $c['product_name'], 'award' => pick($c['award_it'], $c['award_en']), 'year' => (int)$c['year'], 'place' => (int)$c['place']]);

    // ================================================================ members

    case 'me.activity':
        $u = reader();
        $fav = q('SELECT product_id FROM ' . t('favorites') . ' WHERE user_id = ? ORDER BY created_at DESC', [$u['id']])->fetchAll(PDO::FETCH_COLUMN);
        send_json(['ok' => true,
            'favourites' => $fav ? product_list(['ids' => $fav, 'sort' => 'name']) : [],
            'reviews' => array_map(fn($r) => ['product' => $r['name'], 'slug' => $r['slug'], 'rating' => (int)$r['rating'], 'title' => $r['title'], 'hidden' => $r['status'] !== 'visible', 'updated' => iso($r['updated_at'])],
                q('SELECT r.*, p.name, p.slug FROM ' . t('reviews') . ' r JOIN ' . t('products') . ' p ON p.id = r.product_id WHERE r.user_id = ? ORDER BY r.updated_at DESC', [$u['id']])->fetchAll()),
            'requests' => array_map(fn($r) => ['product' => $r['name'], 'slug' => $r['slug'], 'field' => $r['field'], 'proposal' => $r['proposal'], 'status' => $r['status'], 'reply' => (string)$r['reply'], 'created' => iso($r['created_at'])],
                q('SELECT e.*, p.name, p.slug FROM ' . t('edit_requests') . ' e JOIN ' . t('products') . ' p ON p.id = e.product_id WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 100', [$u['id']])->fetchAll()),
            'suggestions' => array_map(fn($s) => ['name' => $s['name'], 'status' => $s['status'], 'reply' => (string)$s['reply'], 'created' => iso($s['created_at'])],
                q('SELECT * FROM ' . t('suggestions') . ' WHERE user_id = ? ORDER BY id DESC LIMIT 100', [$u['id']])->fetchAll()),
        ]);

    case 'me.fav':
        $u = writer();
        $p = product_or_404(int_in(body(), 'product'));
        if (!empty(body()['on'])) q('INSERT IGNORE INTO ' . t('favorites') . ' (user_id, product_id, created_at) VALUES (?,?,?)', [$u['id'], $p['id'], now_utc()]);
        else q('DELETE FROM ' . t('favorites') . ' WHERE user_id = ? AND product_id = ?', [$u['id'], $p['id']]);
        send_json(['ok' => true, 'fav' => !empty(body()['on'])]);

    case 'me.review':
        $u = writer();
        $b = body();
        $p = product_or_404(int_in($b, 'product'));
        if (too_many_attempts('review', 30, 60)) fail('rate_limited', 429);
        record_attempt('review');
        $rating = (int)($b['rating'] ?? -1);
        if ($rating < 0 || $rating > 10) fail('rating_invalid', 422);
        $text = multiline($b, 'body', 4000);
        if (mb_strlen($text) < 20) fail('review_short', 422);
        q('INSERT INTO ' . t('reviews') . ' (product_id, user_id, rating, title, body, used_on, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE rating = VALUES(rating), title = VALUES(title), body = VALUES(body), used_on = VALUES(used_on), updated_at = VALUES(updated_at)',
            [$p['id'], $u['id'], $rating, s($b, 'title', 120), $text, s($b, 'usedOn', 120), now_utc(), now_utc()]);
        send_json(['ok' => true]);

    case 'me.review.delete':
        $u = writer();
        q('DELETE FROM ' . t('reviews') . ' WHERE product_id = ? AND user_id = ?', [int_in(body(), 'product'), $u['id']]);
        send_json(['ok' => true]);

    case 'me.helpful':
        $u = writer();
        $rid = int_in(body(), 'review');
        $rv = q('SELECT user_id FROM ' . t('reviews') . " WHERE id = ? AND status = 'visible'", [$rid])->fetch();
        if (!$rv) fail('not_found', 404);
        if ((int)$rv['user_id'] === $u['id']) fail('own_review', 422);
        if (!empty(body()['on'])) q('INSERT IGNORE INTO ' . t('review_votes') . ' (review_id, user_id) VALUES (?,?)', [$rid, $u['id']]);
        else q('DELETE FROM ' . t('review_votes') . ' WHERE review_id = ? AND user_id = ?', [$rid, $u['id']]);
        send_json(['ok' => true]);

    case 'me.comment':
        $u = writer();
        $b = body();
        $p = product_or_404(int_in($b, 'product'));
        if (too_many_attempts('comment', 20, 10)) fail('rate_limited', 429);
        $text = multiline($b, 'body', 2000);
        if (mb_strlen($text) < 2) fail('comment_empty', 422);
        record_attempt('comment');
        q('INSERT INTO ' . t('comments') . ' (product_id, user_id, body, created_at) VALUES (?,?,?,?)', [$p['id'], $u['id'], $text, now_utc()]);
        send_json(['ok' => true]);

    case 'me.comment.delete':
        // Own comments; the staff of the product removes any (and it is logged)
        $u = writer();
        $c = q('SELECT * FROM ' . t('comments') . ' WHERE id = ?', [int_in(body(), 'id')])->fetch();
        if (!$c) fail('not_found', 404);
        $own = (int)$c['user_id'] === $u['id'];
        if (!$own && !can_edit_product($u, (int)$c['product_id'])) fail('forbidden', 403);
        q('DELETE FROM ' . t('comments') . ' WHERE id = ?', [$c['id']]);
        if (!$own) audit($u['id'], 'comment.delete', 'product', (int)$c['product_id'], ['comment' => mb_substr($c['body'], 0, 200)]);
        send_json(['ok' => true]);

    case 'me.report':
        $u = writer();
        $b = body();
        $kind = s($b, 'kind', 10);
        if (!in_array($kind, ['review', 'comment'], true)) fail('bad_request', 422);
        if (!q('SELECT 1 FROM ' . t($kind === 'review' ? 'reviews' : 'comments') . ' WHERE id = ?', [int_in($b, 'id')])->fetchColumn()) fail('not_found', 404);
        if (too_many_attempts('report', 20, 60)) fail('rate_limited', 429);
        record_attempt('report');
        q('INSERT IGNORE INTO ' . t('reports') . ' (kind, target_id, user_id, reason, created_at) VALUES (?,?,?,?,?)', [$kind, int_in($b, 'id'), $u['id'], s($b, 'reason', 500), now_utc()]);
        send_json(['ok' => true]);

    case 'me.request':
        $u = writer();
        $b = body();
        $p = product_or_404(int_in($b, 'product'));
        $field = s($b, 'field', 30);
        if (!in_array($field, REQUEST_FIELDS, true)) fail('bad_request', 422);
        $proposal = multiline($b, 'proposal', 4000);
        if (mb_strlen($proposal) < 3) fail('proposal_empty', 422);
        if ((int)q('SELECT COUNT(*) FROM ' . t('edit_requests') . " WHERE user_id = ? AND status = 'pending'", [$u['id']])->fetchColumn() >= 20) fail('too_many_pending', 429);
        q('INSERT INTO ' . t('edit_requests') . ' (product_id, user_id, field, proposal, reason, created_at) VALUES (?,?,?,?,?,?)', [$p['id'], $u['id'], $field, $proposal, multiline($b, 'reason', 2000), now_utc()]);
        send_json(['ok' => true]);

    case 'me.suggest':
        $u = writer();
        $b = body();
        $name = s($b, 'name', 90);
        if (mb_strlen($name) < 2) fail('name_required', 422);
        if ((int)q('SELECT COUNT(*) FROM ' . t('suggestions') . " WHERE user_id = ? AND status = 'pending'", [$u['id']])->fetchColumn() >= 20) fail('too_many_pending', 429);
        q('INSERT INTO ' . t('suggestions') . ' (user_id, name, website, alternative_to, reason, created_at) VALUES (?,?,?,?,?,?)',
            [$u['id'], $name, clean_url(s($b, 'website', 300)), s($b, 'alternativeTo', 200), multiline($b, 'reason', 2000), now_utc()]);
        send_json(['ok' => true]);

    case 'me.vote':
        // People's choice: one vote per category, changeable while the voting is open
        $u = writer();
        $b = body();
        $c = q('SELECT ac.*, e.status, e.vote_until FROM ' . t('award_categories') . ' ac JOIN ' . t('editions') . ' e ON e.id = ac.edition_id WHERE ac.id = ?', [int_in($b, 'category')])->fetch();
        if (!$c || $c['kind'] !== 'public') fail('not_found', 404);
        if ($c['status'] !== 'voting' || ($c['vote_until'] && strtotime($c['vote_until'] . ' UTC') <= time())) fail('voting_closed', 409);
        $pid = int_in($b, 'product');
        if (!q('SELECT 1 FROM ' . t('nominees') . ' WHERE category_id = ? AND product_id = ?', [$c['id'], $pid])->fetchColumn()) fail('not_found', 404);
        q('INSERT INTO ' . t('votes') . ' (category_id, user_id, product_id, created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE product_id = VALUES(product_id), created_at = VALUES(created_at)', [$c['id'], $u['id'], $pid, now_utc()]);
        send_json(['ok' => true]);

    // ================================================================ staff: what is waiting

    case 'staff.queue':
        $u = staff(ROLE_MOD);
        $scope = mod_scope($u);
        $all = in_array(0, $scope, true);
        $in = $all ? '' : ' AND e.product_id IN (' . ($scope ? implode(',', $scope) : '0') . ')';
        $requests = q('SELECT e.*, p.name AS pname, p.slug, u.name AS uname FROM ' . t('edit_requests') . ' e JOIN ' . t('products') . ' p ON p.id = e.product_id
            LEFT JOIN ' . t('users') . " u ON u.id = e.user_id WHERE e.status = 'pending'$in ORDER BY e.id LIMIT 200")->fetchAll();
        $reports = q('SELECT r.kind, r.target_id, COUNT(*) n, GROUP_CONCAT(r.reason SEPARATOR \'\n\') reasons, MIN(r.created_at) first,
                COALESCE(rv.product_id, cm.product_id) AS product_id, COALESCE(rv.body, cm.body) AS body, COALESCE(rv.status, cm.status) AS tstatus, COALESCE(ru.name, cu.name) AS author
            FROM ' . t('reports') . ' r LEFT JOIN ' . t('reviews') . " rv ON r.kind = 'review' AND rv.id = r.target_id LEFT JOIN " . t('users') . ' ru ON ru.id = rv.user_id
            LEFT JOIN ' . t('comments') . " cm ON r.kind = 'comment' AND cm.id = r.target_id LEFT JOIN " . t('users') . " cu ON cu.id = cm.user_id
            WHERE r.status = 'open' GROUP BY r.kind, r.target_id ORDER BY first LIMIT 200")->fetchAll();
        $reports = array_values(array_filter($reports, fn($r) => $r['product_id'] !== null && can_edit_product($u, (int)$r['product_id'])));
        $names = $reports ? q('SELECT id, name, slug FROM ' . t('products') . ' WHERE id IN (' . implode(',', array_map(fn($r) => (int)$r['product_id'], $reports)) . ')')->fetchAll(PDO::FETCH_UNIQUE) : [];
        $sugg = $u['role'] >= ROLE_ADMIN ? q('SELECT s.*, u.name AS uname FROM ' . t('suggestions') . ' s LEFT JOIN ' . t('users') . " u ON u.id = s.user_id WHERE s.status = 'pending' ORDER BY s.id LIMIT 200")->fetchAll() : [];
        send_json(['ok' => true,
            'requests' => array_map(fn($e) => ['id' => (int)$e['id'], 'product' => ['id' => (int)$e['product_id'], 'name' => $e['pname'], 'slug' => $e['slug']], 'user' => $e['uname'],
                'field' => $e['field'], 'proposal' => $e['proposal'], 'reason' => (string)$e['reason'], 'created' => iso($e['created_at'])], $requests),
            'reports' => array_map(fn($r) => ['kind' => $r['kind'], 'id' => (int)$r['target_id'], 'n' => (int)$r['n'], 'reasons' => lines($r['reasons']), 'body' => (string)$r['body'],
                'author' => $r['author'], 'hidden' => $r['tstatus'] !== 'visible', 'product' => ['id' => (int)$r['product_id'], 'name' => $names[$r['product_id']]['name'] ?? '', 'slug' => $names[$r['product_id']]['slug'] ?? '']], $reports),
            'suggestions' => array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name'], 'website' => $s['website'], 'alternativeTo' => $s['alternative_to'], 'reason' => (string)$s['reason'],
                'user' => $s['uname'], 'created' => iso($s['created_at'])], $sugg),
        ]);

    case 'staff.request':
        $u = staff(ROLE_MOD);
        $b = body();
        $e = q('SELECT e.*, p.name AS pname, p.slug FROM ' . t('edit_requests') . ' e JOIN ' . t('products') . " p ON p.id = e.product_id WHERE e.id = ? AND e.status = 'pending'", [int_in($b, 'id')])->fetch();
        if (!$e) fail('not_found', 404);
        if (!can_edit_product($u, (int)$e['product_id'])) fail('forbidden', 403);
        $accept = !empty($b['accept']);
        $reply = multiline($b, 'reply', 1000);
        q('UPDATE ' . t('edit_requests') . ' SET status = ?, reply = ?, handled_by = ?, handled_at = ? WHERE id = ?', [$accept ? 'accepted' : 'rejected', $reply, $u['id'], now_utc(), $e['id']]);
        audit($u['id'], $accept ? 'request.accept' : 'request.reject', 'product', (int)$e['product_id'], ['request' => (int)$e['id'], 'field' => $e['field']]);
        send_outcome($e['user_id'] !== null ? (int)$e['user_id'] : null, 'req', $accept, $e['pname'], $reply, app_url() . '#/p/' . $e['slug']);
        send_json(['ok' => true]);

    case 'staff.report':
    case 'staff.moderate':
        // hide | restore | dismiss (the reports are closed, the review or comment stays as it is)
        $u = staff(ROLE_MOD);
        $b = body();
        $kind = s($b, 'kind', 10);
        if (!in_array($kind, ['review', 'comment'], true)) fail('bad_request', 422);
        $table = $kind === 'review' ? 'reviews' : 'comments';
        $row = q('SELECT * FROM ' . t($table) . ' WHERE id = ?', [int_in($b, 'id')])->fetch();
        if (!$row) fail('not_found', 404);
        if (!can_edit_product($u, (int)$row['product_id'])) fail('forbidden', 403);
        $action = s($b, 'action', 10);
        if (!in_array($action, ['hide', 'restore', 'dismiss'], true)) fail('bad_request', 422);
        if ($action !== 'dismiss') q('UPDATE ' . t($table) . ' SET status = ? WHERE id = ?', [$action === 'hide' ? 'hidden' : 'visible', $row['id']]);
        q('UPDATE ' . t('reports') . " SET status = 'closed', handled_by = ?, handled_at = ? WHERE kind = ? AND target_id = ? AND status = 'open'", [$u['id'], now_utc(), $kind, $row['id']]);
        audit($u['id'], "$kind.$action", 'product', (int)$row['product_id'], [$kind => (int)$row['id']]);
        send_json(['ok' => true]);

    case 'staff.suggestion':
        $u = staff(ROLE_ADMIN);
        $b = body();
        $sg = q('SELECT * FROM ' . t('suggestions') . " WHERE id = ? AND status = 'pending'", [int_in($b, 'id')])->fetch();
        if (!$sg) fail('not_found', 404);
        $accept = !empty($b['accept']);
        $reply = multiline($b, 'reply', 1000);
        $pid = null;
        if ($accept && !empty($b['draft'])) {
            // a draft product, ready to be analysed
            $slug = slugify($sg['name']) ?: 'product';
            for ($i = 2; q('SELECT 1 FROM ' . t('products') . ' WHERE slug = ?', [$slug])->fetchColumn(); $i++) $slug = slugify($sg['name']) . '-' . $i;
            q('INSERT INTO ' . t('products') . ' (slug, name, website, alternatives_to, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [$slug, $sg['name'], $sg['website'], $sg['alternative_to'], $u['id'], now_utc(), now_utc()]);
            $pid = (int)db()->lastInsertId();
            audit($u['id'], 'product.create', 'product', $pid, ['from' => 'suggestion']);
        }
        q('UPDATE ' . t('suggestions') . ' SET status = ?, reply = ?, product_id = ?, handled_by = ?, handled_at = ? WHERE id = ?', [$accept ? 'accepted' : 'rejected', $reply, $pid, $u['id'], now_utc(), $sg['id']]);
        send_outcome($sg['user_id'] !== null ? (int)$sg['user_id'] : null, 'sug', $accept, $sg['name'], $reply, app_url());
        send_json(['ok' => true, 'product' => $pid]);

    // ================================================================ staff: products

    case 'staff.products':
        $u = staff(ROLE_MOD);
        $list = product_list(['q' => s($_GET, 'q', 80), 'sort' => 'name'], true, 1000);
        $scope = mod_scope($u);
        if (!in_array(0, $scope, true)) $list = array_values(array_filter($list, fn($p) => in_array($p['id'], $scope, true)));
        $starter = 0;
        if ($u['role'] >= ROLE_ADMIN) {
            // how many products of the starter catalogue are not in yet
            $seed = json_decode((string)@file_get_contents(dirname(__DIR__) . '/lib/seed/catalogue.json'), true);
            $have = array_flip(array_merge(array_map(fn($p) => $p['slug'], $list), array_map(fn($p) => mb_strtolower($p['name']), $list)));
            foreach ((array)($seed['products'] ?? []) as $x) if (!isset($have[slugify((string)$x['name'])]) && !isset($have[mb_strtolower((string)$x['name'])])) $starter++;
        }
        send_json(['ok' => true, 'products' => $list, 'all' => in_array(0, $scope, true), 'starter' => $starter]);

    case 'staff.import':
        // the starter catalogue (lib/seed/catalogue.json): European alternatives added as drafts, without scores, to be
        // checked one by one before publishing; products already there (same slug or name) are left as they are
        $u = staff(ROLE_ADMIN);
        [$added, $skipped] = import_starter((int)$u['id']);
        send_json(['ok' => true, 'added' => $added, 'skipped' => $skipped]);

    case 'staff.alternatives':
        // every name products are alternatives to (drafts too), and the well-known ones: chosen from a list, never retyped;
        // and the test devices used so far
        staff(ROLE_MOD);
        $names = [];
        foreach (MAINSTREAM as $n) $names[alt_key($n)] = ['name' => $n, 'n' => 0];
        foreach (q('SELECT alternatives_to FROM ' . t('products') . " WHERE alternatives_to <> ''")->fetchAll(PDO::FETCH_COLUMN) as $s) {
            foreach (csv_list($s) as $n) {
                $k = alt_key($n);
                if ($k === '') continue;
                $names[$k] = ['name' => $names[$k]['name'] ?? $n, 'n' => ($names[$k]['n'] ?? 0) + 1];
            }
        }
        $list = array_values($names);
        usort($list, fn($a, $b) => strcasecmp($a['name'], $b['name']));
        // the test devices already written for the products (one per line), the most used first: picked again, not retyped
        $dev = [];
        foreach (q('SELECT tested_on FROM ' . t('products') . " WHERE tested_on IS NOT NULL AND tested_on <> ''")->fetchAll(PDO::FETCH_COLUMN) as $s) {
            foreach (array_unique(lines($s)) as $l) {
                $l = preg_replace('/\s+/u', ' ', $l);
                $k = mb_strtolower($l);
                $dev[$k] = ['line' => $dev[$k]['line'] ?? $l, 'n' => ($dev[$k]['n'] ?? 0) + 1];
            }
        }
        $dev = array_values($dev);
        usort($dev, fn($a, $b) => $b['n'] <=> $a['n'] ?: strcasecmp($a['line'], $b['line']));
        send_json(['ok' => true, 'names' => $list, 'licences' => LICENCES, 'openLicences' => OPEN_LICENCES, 'devices' => array_slice($dev, 0, 300)]);

    case 'staff.product':
        $u = staff(ROLE_MOD);
        $p = product_or_404((int)($_GET['id'] ?? 0), true);
        if (!can_edit_product($u, (int)$p['id'])) fail('forbidden', 403);
        send_json(['ok' => true, 'product' => product_full($p, $u, true), 'criteria' => array_map('criterion_out', criteria()), 'categories' => categories()]);

    case 'staff.product.save':
        $u = staff(ROLE_MOD);
        $b = body();
        $id = int_in($b, 'id');
        $old = $id ? product_or_404($id, true) : null;
        if ($old && !can_edit_product($u, $id)) fail('forbidden', 403);
        if (!$old && $u['role'] < ROLE_ADMIN) fail('forbidden', 403);
        $name = s($b, 'name', 90);
        if (mb_strlen($name) < 1) fail('name_required', 422);
        $slug = slugify(s($b, 'slug', 90) ?: $name);
        if ($slug === '') fail('slug_invalid', 422);
        if (q('SELECT 1 FROM ' . t('products') . ' WHERE slug = ? AND id <> ?', [$slug, $id])->fetchColumn()) fail('slug_taken', 409);
        $cat = int_in($b, 'category_id') ?: null;
        if ($cat && !q('SELECT 1 FROM ' . t('categories') . ' WHERE id = ?', [$cat])->fetchColumn()) $cat = null;
        $pricing = in_array($b['pricing'] ?? '', PRICING, true) ? $b['pricing'] : 'free';
        $country = strtoupper(s($b, 'country', 2));
        if (!preg_match('/^[A-Z]{2}$/', $country)) $country = '';
        $platforms = implode(',', array_values(array_intersect(PLATFORMS, (array)($b['platforms'] ?? []))));
        $features = implode(',', array_values(array_intersect(FEATURES, (array)($b['features'] ?? []))));
        $alts = implode(', ', array_slice(array_unique(array_filter(array_map(fn($x) => mb_substr(trim((string)$x), 0, 40), is_array($b['alternatives_to'] ?? null) ? $b['alternatives_to'] : csv_list(s($b, 'alternatives_to', 500))), 'strlen')), 0, 12));
        $testedAt = s($b, 'tested_at', 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $testedAt)) $testedAt = null;
        // the status changes only by an administrator (publishing is adding a product)
        $status = $u['role'] >= ROLE_ADMIN && in_array($b['status'] ?? '', ['draft', 'published'], true) ? $b['status'] : ($old['status'] ?? 'draft');
        $f = [
            'slug' => $slug, 'name' => $name, 'category_id' => $cat,
            'tagline_it' => s($b, 'tagline_it', 200), 'tagline_en' => s($b, 'tagline_en', 200),
            'review_it' => multiline($b, 'review_it', 20000), 'review_en' => multiline($b, 'review_en', 20000),
            'pros_it' => multiline($b, 'pros_it', 3000), 'pros_en' => multiline($b, 'pros_en', 3000), 'cons_it' => multiline($b, 'cons_it', 3000), 'cons_en' => multiline($b, 'cons_en', 3000),
            'website' => clean_url(s($b, 'website', 300)), 'source_url' => clean_url(s($b, 'source_url', 300)), 'licence' => s($b, 'licence', 60),
            'open_source' => !empty($b['open_source']) ? 1 : 0, 'pricing' => $pricing, 'country' => $country, 'self_host' => !empty($b['self_host']) ? 1 : 0,
            'platforms' => $platforms, 'features' => $features, 'alternatives_to' => $alts,
            'tested_on' => multiline($b, 'tested_on', 3000), 'tested_version' => s($b, 'tested_version', 60), 'tested_at' => $testedAt,
            'status' => $status, 'updated_at' => now_utc(),
        ];
        if (!empty($b['reviewed'])) $f['reviewed_at'] = now_utc();
        if (array_key_exists('logo', $b)) {
            $logo = (string)($b['logo'] ?? '');
            if ($logo === '') $f['logo'] = $f['logo_mime'] = null;
            elseif (preg_match('#^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$#', $logo, $m)) {
                $bin = base64_decode($m[2], true);
                if ($bin === false || strlen($bin) > MAX_LOGO_BYTES) fail('logo_too_big', 413);
                $info = @getimagesizefromstring($bin);
                if (!$info || $info['mime'] !== $m[1]) fail('logo_invalid', 422);
                $f['logo'] = base64_encode($bin);
                $f['logo_mime'] = $m[1];
            } elseif (!preg_match('#^api/\?r=pub\.logo#', $logo)) fail('logo_invalid', 422);
        }
        db()->beginTransaction();
        if ($old) {
            q('UPDATE ' . t('products') . ' SET ' . implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($f))) . ' WHERE id = ?', array_merge(array_values($f), [$id]));
        } else {
            $f['created_by'] = $u['id'];
            $f['created_at'] = now_utc();
            q('INSERT INTO ' . t('products') . ' (' . implode(', ', array_map(fn($k) => "`$k`", array_keys($f))) . ') VALUES (' . implode(',', array_fill(0, count($f), '?')) . ')', array_values($f));
            $id = (int)db()->lastInsertId();
        }
        // scores: every change goes into the public history
        $changed = [];
        if (is_array($b['scores'] ?? null)) {
            $valid = array_map('intval', q('SELECT id FROM ' . t('criteria'))->fetchAll(PDO::FETCH_COLUMN));
            $before = q('SELECT criterion_id, score FROM ' . t('scores') . ' WHERE product_id = ?', [$id])->fetchAll(PDO::FETCH_KEY_PAIR);
            foreach ($b['scores'] as $sc) {
                if (!is_array($sc)) continue;
                $cid = (int)($sc['criterion'] ?? 0);
                if (!in_array($cid, $valid, true)) continue;
                $v = $sc['score'] ?? null;
                $v = $v === null || $v === '' ? null : round(max(0, min(10, (float)$v)) * 2) / 2; // 0–10, halves allowed
                q('INSERT INTO ' . t('scores') . ' (product_id, criterion_id, score, note_it, note_en) VALUES (?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE score = VALUES(score), note_it = VALUES(note_it), note_en = VALUES(note_en)', [$id, $cid, $v, multiline($sc, 'note_it', 2000), multiline($sc, 'note_en', 2000)]);
                $was = array_key_exists($cid, $before) && $before[$cid] !== null ? (float)$before[$cid] : null;
                if ($was !== $v) {
                    q('INSERT INTO ' . t('score_history') . ' (product_id, criterion_id, old_score, new_score, user_id, created_at) VALUES (?,?,?,?,?,?)', [$id, $cid, $was, $v, $u['id'], now_utc()]);
                    $changed[] = $cid;
                }
            }
        }
        $total = recompute_score($id);
        if ($changed && $old && (float)$old['score'] !== (float)$total) q('INSERT INTO ' . t('score_history') . ' (product_id, criterion_id, old_score, new_score, user_id, created_at) VALUES (?,?,?,?,?,?)', [$id, null, $old['score'], $total, $u['id'], now_utc()]);
        $diff = $old ? array_keys(array_filter($f, fn($v, $k) => !in_array($k, ['updated_at', 'logo'], true) && (string)$v !== (string)($old[$k] ?? ''), ARRAY_FILTER_USE_BOTH)) : ['created'];
        audit($u['id'], $old ? 'product.edit' : 'product.create', 'product', $id, ['fields' => array_values($diff), 'scores' => count($changed)]);
        db()->commit();
        send_json(['ok' => true, 'id' => $id, 'slug' => $slug]);

    case 'staff.shot.add':
        // one screenshot at a time (the app makes it smaller first): PNG, JPEG or WebP, 10 per product at most
        $u = staff(ROLE_MOD);
        $b = body();
        $p = product_or_404(int_in($b, 'product'), true);
        if (!can_edit_product($u, (int)$p['id'])) fail('forbidden', 403);
        if ((int)q('SELECT COUNT(*) FROM ' . t('shots') . ' WHERE product_id = ?', [$p['id']])->fetchColumn() >= MAX_SHOTS) fail('too_many_shots', 422);
        if (!preg_match('#^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$#', (string)($b['data'] ?? ''), $m)) fail('shot_invalid', 422);
        $bin = base64_decode($m[2], true);
        if ($bin === false || strlen($bin) > MAX_SHOT_BYTES) fail('shot_too_big', 413);
        $info = @getimagesizefromstring($bin);
        if (!$info || $info['mime'] !== $m[1]) fail('shot_invalid', 422);
        $sort = (int)q('SELECT COALESCE(MAX(sort), 0) + 1 FROM ' . t('shots') . ' WHERE product_id = ?', [$p['id']])->fetchColumn();
        q('INSERT INTO ' . t('shots') . ' (product_id, mime, data, width, height, caption, sort, created_at) VALUES (?,?,?,?,?,?,?,?)',
            [$p['id'], $m[1], base64_encode($bin), min(65535, (int)$info[0]), min(65535, (int)$info[1]), s($b, 'caption', 160), $sort, now_utc()]);
        send_json(['ok' => true, 'id' => (int)db()->lastInsertId()]);

    case 'staff.shots.save':
        // the screenshots that stay, in this order, with their captions; the others are deleted
        $u = staff(ROLE_MOD);
        $b = body();
        $p = product_or_404(int_in($b, 'product'), true);
        if (!can_edit_product($u, (int)$p['id'])) fail('forbidden', 403);
        $keep = [];
        db()->beginTransaction();
        foreach (array_values((array)($b['items'] ?? [])) as $i => $it) {
            $sid = (int)($it['id'] ?? 0);
            if (!$sid) continue;
            q('UPDATE ' . t('shots') . ' SET sort = ?, caption = ? WHERE id = ? AND product_id = ?', [$i, s((array)$it, 'caption', 160), $sid, $p['id']]);
            $keep[] = $sid;
        }
        $gone = q('DELETE FROM ' . t('shots') . ' WHERE product_id = ?' . ($keep ? ' AND id NOT IN (' . implode(',', $keep) . ')' : ''), [$p['id']])->rowCount();
        if ($gone || $keep) audit($u['id'], 'shots.save', 'product', (int)$p['id'], ['kept' => count($keep), 'deleted' => $gone]);
        db()->commit();
        send_json(['ok' => true, 'shots' => product_shots((int)$p['id'])]);

    case 'staff.product.delete':
        $u = staff(ROLE_ADMIN);
        $p = product_or_404(int_in(body(), 'id'), true);
        if (q('SELECT 1 FROM ' . t('certificates') . ' WHERE product_id = ? AND revoked_at IS NULL', [$p['id']])->fetchColumn()) fail('has_certificates', 409);
        q('DELETE FROM ' . t('products') . ' WHERE id = ?', [$p['id']]);
        audit($u['id'], 'product.delete', 'product', (int)$p['id'], ['name' => $p['name']]);
        send_json(['ok' => true]);

    case 'staff.criteria':
        staff(ROLE_ADMIN);
        send_json(['ok' => true, 'criteria' => array_map('criterion_out', criteria(true))]);

    case 'staff.criteria.save':
        // the whole list; a criterion with scores is switched off rather than deleted
        $u = staff(ROLE_ADMIN);
        $items = (array)(body()['items'] ?? []);
        db()->beginTransaction();
        foreach ($items as $i => $c) {
            if (!is_array($c)) continue;
            $slug = slugify(s($c, 'slug', 60) ?: s($c, 'name_en', 80));
            if ($slug === '' || s($c, 'name_en', 80) === '') fail('name_required', 422);
            $vals = [$slug, s($c, 'name_it', 80) ?: s($c, 'name_en', 80), s($c, 'name_en', 80), multiline($c, 'desc_it', 2000), multiline($c, 'desc_en', 2000), s($c, 'icon', 40) ?: 'circle-check', $i * 10, !empty($c['active']) ? 1 : 0];
            if (int_in($c, 'id')) q('UPDATE ' . t('criteria') . ' SET slug = ?, name_it = ?, name_en = ?, desc_it = ?, desc_en = ?, icon = ?, sort = ?, active = ? WHERE id = ?', array_merge($vals, [int_in($c, 'id')]));
            else q('INSERT INTO ' . t('criteria') . ' (slug, name_it, name_en, desc_it, desc_en, icon, sort, active) VALUES (?,?,?,?,?,?,?,?)', $vals);
        }
        recompute_all_scores();
        audit($u['id'], 'criteria.save', 'criteria', 0, ['n' => count($items)]);
        db()->commit();
        send_json(['ok' => true, 'criteria' => array_map('criterion_out', criteria(true))]);

    case 'staff.categories.save':
        $u = staff(ROLE_ADMIN);
        $b = body();
        db()->beginTransaction();
        foreach ((array)($b['items'] ?? []) as $i => $c) {
            if (!is_array($c)) continue;
            $slug = slugify(s($c, 'slug', 60) ?: s($c, 'name_en', 80));
            if ($slug === '' || s($c, 'name_en', 80) === '') fail('name_required', 422);
            $vals = [$slug, s($c, 'name_it', 80) ?: s($c, 'name_en', 80), s($c, 'name_en', 80), s($c, 'icon', 40) ?: 'box', $i * 10];
            if (int_in($c, 'id')) q('UPDATE ' . t('categories') . ' SET slug = ?, name_it = ?, name_en = ?, icon = ?, sort = ? WHERE id = ?', array_merge($vals, [int_in($c, 'id')]));
            else q('INSERT INTO ' . t('categories') . ' (slug, name_it, name_en, icon, sort) VALUES (?,?,?,?,?)', $vals);
        }
        foreach ((array)($b['delete'] ?? []) as $cid) {
            q('UPDATE ' . t('products') . ' SET category_id = NULL WHERE category_id = ?', [(int)$cid]);
            q('DELETE FROM ' . t('categories') . ' WHERE id = ?', [(int)$cid]);
        }
        audit($u['id'], 'categories.save', 'categories', 0);
        db()->commit();
        send_json(['ok' => true, 'categories' => categories()]);

    // ================================================================ staff: people

    case 'staff.users':
        $u = staff(ROLE_ADMIN);
        $qq = s($_GET, 'q', 80);
        $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $qq) . '%';
        $rows = q('SELECT u.id, u.name, u.email, u.role, u.status, u.email_verified_at, u.created_at, u.last_login_at, u.sav_sub, u.mod_all, u.password_hash <> \'\' AS haspw,
                (SELECT COUNT(*) FROM ' . t('reviews') . ' r WHERE r.user_id = u.id) AS reviews, (SELECT GROUP_CONCAT(product_id) FROM ' . t('mod_scopes') . ' m WHERE m.user_id = u.id) AS scope
            FROM ' . t('users') . ' u WHERE (? = \'\' OR u.name LIKE ? OR u.email LIKE ?) ORDER BY u.role DESC, u.created_at DESC LIMIT 300', [$qq, $like, $like])->fetchAll();
        send_json(['ok' => true, 'me' => $u['id'], 'users' => array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name'], 'email' => $x['email'], 'role' => (int)$x['role'], 'status' => $x['status'],
            'verified' => (bool)$x['email_verified_at'], 'created' => iso($x['created_at']), 'lastLogin' => iso($x['last_login_at']), 'sav' => (bool)$x['sav_sub'], 'password' => (bool)$x['haspw'],
            'reviews' => (int)$x['reviews'], 'scope' => $x['mod_all'] ? 'all' : array_map('intval', csv_list($x['scope']))], $rows)]);

    case 'staff.user.save':
        // Administrators manage members and moderators; the master administrator also manages administrators
        $u = staff(ROLE_ADMIN);
        $b = body();
        $t = user_row(int_in($b, 'id'));
        if (!$t) fail('not_found', 404);
        if ((int)$t['id'] === $u['id']) fail('not_yourself', 422);
        $max = $u['role'] >= ROLE_MASTER ? ROLE_ADMIN : ROLE_MOD; // the highest role this user may give or take away
        if ((int)$t['role'] > $max) fail('forbidden', 403);
        $role = (int)($b['role'] ?? $t['role']);
        if (!in_array($role, ROLES, true) || $role > $max) fail('forbidden', 403);
        $status = in_array($b['status'] ?? '', ['active', 'disabled'], true) ? $b['status'] : $t['status'];
        db()->beginTransaction();
        q('UPDATE ' . t('users') . ' SET role = ?, status = ? WHERE id = ?', [$role, $status, $t['id']]);
        if ($status === 'disabled') q('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?', [$t['id']]);
        q('DELETE FROM ' . t('mod_scopes') . ' WHERE user_id = ?', [$t['id']]);
        // a moderator looks after every product ('all') or only some
        $scope = $b['scope'] ?? 'all';
        $all = $role === ROLE_MOD && $scope === 'all';
        q('UPDATE ' . t('users') . ' SET mod_all = ? WHERE id = ?', [$all ? 1 : 0, $t['id']]);
        if ($role === ROLE_MOD && !$all) {
            foreach (array_unique(array_map('intval', (array)$scope)) as $pid) {
                if ($pid > 0 && q('SELECT 1 FROM ' . t('products') . ' WHERE id = ?', [$pid])->fetchColumn()) q('INSERT IGNORE INTO ' . t('mod_scopes') . ' (user_id, product_id) VALUES (?,?)', [$t['id'], $pid]);
            }
        }
        audit($u['id'], 'user.save', 'user', (int)$t['id'], ['role' => $role, 'status' => $status, 'scope' => $role === ROLE_MOD ? $scope : null]);
        db()->commit();
        send_json(['ok' => true]);

    case 'staff.audit':
        staff(ROLE_ADMIN);
        $rows = q('SELECT a.*, u.name AS uname, p.name AS pname, p.slug AS pslug FROM ' . t('audit') . ' a LEFT JOIN ' . t('users') . ' u ON u.id = a.user_id
            LEFT JOIN ' . t('products') . " p ON a.target_type = 'product' AND p.id = a.target_id ORDER BY a.id DESC LIMIT 300")->fetchAll();
        send_json(['ok' => true, 'items' => array_map(fn($a) => ['id' => (int)$a['id'], 'user' => $a['uname'], 'action' => $a['action'], 'type' => $a['target_type'], 'target' => (int)$a['target_id'],
            'product' => $a['pname'] ? ['name' => $a['pname'], 'slug' => $a['pslug']] : null, 'detail' => json_decode((string)$a['detail'], true), 'at' => iso($a['created_at'])], $rows)]);

    // ================================================================ staff: awards

    case 'staff.editions':
        staff(ROLE_ADMIN);
        send_json(['ok' => true, 'editions' => array_map(fn($e) => edition_out($e, true), q('SELECT * FROM ' . t('editions') . ' ORDER BY year DESC')->fetchAll())]);

    case 'staff.edition':
        $u = staff(ROLE_ADMIN);
        $e = q('SELECT * FROM ' . t('editions') . ' WHERE id = ?', [(int)($_GET['id'] ?? 0)])->fetch();
        if (!$e) fail('not_found', 404);
        send_json(['ok' => true, 'edition' => edition_full($e, null, true)]);

    case 'staff.edition.save':
        $u = staff(ROLE_ADMIN);
        $b = body();
        $year = int_in($b, 'year');
        if ($year < 2000 || $year > 2100) fail('year_invalid', 422);
        $id = int_in($b, 'id');
        if (q('SELECT 1 FROM ' . t('editions') . ' WHERE year = ? AND id <> ?', [$year, $id])->fetchColumn()) fail('year_taken', 409);
        $status = in_array($b['status'] ?? '', ['draft', 'nominees', 'voting', 'published'], true) ? $b['status'] : 'draft';
        $until = s($b, 'vote_until', 25);
        $until = $until !== '' && strtotime($until) ? gmdate('Y-m-d H:i:s', strtotime($until)) : null;
        $vals = [$year, s($b, 'title_it', 120), s($b, 'title_en', 120), multiline($b, 'intro_it', 4000), multiline($b, 'intro_en', 4000), $status, $until];
        if ($id) {
            $old = q('SELECT * FROM ' . t('editions') . ' WHERE id = ?', [$id])->fetch();
            if (!$old) fail('not_found', 404);
            q('UPDATE ' . t('editions') . ' SET year = ?, title_it = ?, title_en = ?, intro_it = ?, intro_en = ?, status = ?, vote_until = ?, published_at = ' . ($status === 'published' ? 'COALESCE(published_at, UTC_TIMESTAMP())' : 'published_at') . ' WHERE id = ?', array_merge($vals, [$id]));
        } else {
            q('INSERT INTO ' . t('editions') . ' (year, title_it, title_en, intro_it, intro_en, status, vote_until, published_at) VALUES (?,?,?,?,?,?,?,' . ($status === 'published' ? 'UTC_TIMESTAMP()' : 'NULL') . ')', $vals);
            $id = (int)db()->lastInsertId();
        }
        audit($u['id'], 'edition.save', 'edition', $id, ['year' => $year, 'status' => $status]);
        send_json(['ok' => true, 'id' => $id]);

    case 'staff.edition.delete':
        $u = staff(ROLE_ADMIN);
        $id = int_in(body(), 'id');
        if (q('SELECT 1 FROM ' . t('certificates') . ' c JOIN ' . t('award_categories') . ' ac ON ac.id = c.category_id WHERE ac.edition_id = ?', [$id])->fetchColumn()) fail('has_certificates', 409);
        q('DELETE FROM ' . t('editions') . ' WHERE id = ?', [$id]);
        audit($u['id'], 'edition.delete', 'edition', $id);
        send_json(['ok' => true]);

    case 'staff.acat.save':
        $u = staff(ROLE_ADMIN);
        $b = body();
        $id = int_in($b, 'id');
        $ed = $id ? (int)q('SELECT edition_id FROM ' . t('award_categories') . ' WHERE id = ?', [$id])->fetchColumn() : int_in($b, 'edition');
        if (!$ed || !q('SELECT 1 FROM ' . t('editions') . ' WHERE id = ?', [$ed])->fetchColumn()) fail('not_found', 404);
        if (s($b, 'name_en', 120) === '') fail('name_required', 422);
        $slug = slugify(s($b, 'name_en', 120));
        for ($i = 2, $base = $slug; q('SELECT 1 FROM ' . t('award_categories') . ' WHERE edition_id = ? AND slug = ? AND id <> ?', [$ed, $slug, $id])->fetchColumn(); $i++) $slug = "$base-$i";
        $vals = [$slug, s($b, 'name_it', 120) ?: s($b, 'name_en', 120), s($b, 'name_en', 120), multiline($b, 'desc_it', 2000), multiline($b, 'desc_en', 2000), ($b['kind'] ?? '') === 'public' ? 'public' : 'jury', int_in($b, 'sort')];
        if ($id) q('UPDATE ' . t('award_categories') . ' SET slug = ?, name_it = ?, name_en = ?, desc_it = ?, desc_en = ?, kind = ?, sort = ? WHERE id = ?', array_merge($vals, [$id]));
        else {
            q('INSERT INTO ' . t('award_categories') . ' (slug, name_it, name_en, desc_it, desc_en, kind, sort, edition_id) VALUES (?,?,?,?,?,?,?,?)', array_merge($vals, [$ed]));
            $id = (int)db()->lastInsertId();
        }
        audit($u['id'], 'award.save', 'edition', $ed, ['category' => $id]);
        send_json(['ok' => true, 'id' => $id]);

    case 'staff.acat.delete':
        $u = staff(ROLE_ADMIN);
        $id = int_in(body(), 'id');
        if (q('SELECT 1 FROM ' . t('certificates') . ' WHERE category_id = ?', [$id])->fetchColumn()) fail('has_certificates', 409);
        q('DELETE FROM ' . t('award_categories') . ' WHERE id = ?', [$id]);
        audit($u['id'], 'award.delete', 'category', $id);
        send_json(['ok' => true]);

    case 'staff.nominees.save':
        // the shortlist of a category, and who won: places 1 (winner), 2 and 3, each at most once
        $u = staff(ROLE_ADMIN);
        $b = body();
        $cid = int_in($b, 'category');
        if (!q('SELECT 1 FROM ' . t('award_categories') . ' WHERE id = ?', [$cid])->fetchColumn()) fail('not_found', 404);
        $seen = [];
        $places = [];
        $rows = [];
        foreach ((array)($b['nominees'] ?? []) as $n) {
            $pid = (int)($n['product'] ?? 0);
            if (!$pid || isset($seen[$pid]) || !q('SELECT 1 FROM ' . t('products') . ' WHERE id = ?', [$pid])->fetchColumn()) continue;
            $seen[$pid] = true;
            $place = in_array((int)($n['place'] ?? 0), [1, 2, 3], true) ? (int)$n['place'] : null;
            if ($place !== null && isset($places[$place])) fail('place_twice', 422);
            if ($place !== null) $places[$place] = true;
            $rows[] = [$cid, $pid, $place, multiline($n, 'motivation_it', 2000), multiline($n, 'motivation_en', 2000)];
        }
        if (count($rows) > 30) fail('too_many', 422);
        db()->beginTransaction();
        $keep = array_map(fn($r) => $r[1], $rows);
        // a certified place stays as it is (revoke the certificate first)
        foreach (q('SELECT n.product_id, n.place FROM ' . t('nominees') . ' n JOIN ' . t('certificates') . ' c ON c.category_id = n.category_id AND c.product_id = n.product_id AND c.revoked_at IS NULL WHERE n.category_id = ?', [$cid])->fetchAll() as $cert) {
            $now = array_values(array_filter($rows, fn($r) => $r[1] === (int)$cert['product_id']));
            if (!$now || $now[0][2] !== (int)$cert['place']) fail('certified_place', 409);
        }
        q('DELETE FROM ' . t('nominees') . ' WHERE category_id = ?' . ($keep ? ' AND product_id NOT IN (' . implode(',', $keep) . ')' : ''), [$cid]);
        foreach ($rows as $r) q('INSERT INTO ' . t('nominees') . ' (category_id, product_id, place, motivation_it, motivation_en) VALUES (?,?,?,?,?)
            ON DUPLICATE KEY UPDATE place = VALUES(place), motivation_it = VALUES(motivation_it), motivation_en = VALUES(motivation_en)', $r);
        audit($u['id'], 'nominees.save', 'category', $cid, ['n' => count($rows)]);
        db()->commit();
        send_json(['ok' => true]);

    // ================================================================ master: certificates

    case 'staff.certs':
        staff(ROLE_MASTER);
        $certs = q('SELECT c.*, u.name AS uname FROM ' . t('certificates') . ' c LEFT JOIN ' . t('users') . ' u ON u.id = c.issued_by ORDER BY c.id DESC LIMIT 500')->fetchAll();
        // places of published editions without a certificate yet
        $todo = q('SELECT e.year, ac.id AS cat, ac.name_it, ac.name_en, ac.kind, n.place, p.id AS pid, p.name, p.slug FROM ' . t('nominees') . ' n
            JOIN ' . t('award_categories') . ' ac ON ac.id = n.category_id JOIN ' . t('editions') . ' e ON e.id = ac.edition_id JOIN ' . t('products') . ' p ON p.id = n.product_id
            LEFT JOIN ' . t('certificates') . " c ON c.category_id = n.category_id AND c.product_id = n.product_id
            WHERE n.place IS NOT NULL AND e.status = 'published' AND c.id IS NULL ORDER BY e.year DESC, ac.sort, n.place")->fetchAll();
        send_json(['ok' => true,
            'certificates' => array_map(fn($c) => ['id' => (int)$c['id'], 'code' => cert_display($c['code']), 'url' => cert_url($c), 'product' => $c['product_name'], 'award' => pick($c['award_it'], $c['award_en']),
                'year' => (int)$c['year'], 'place' => (int)$c['place'], 'kind' => $c['kind'], 'issuedBy' => $c['uname'], 'issued' => iso($c['issued_at']), 'revoked' => iso($c['revoked_at']), 'reason' => (string)$c['revoke_reason']], $certs),
            'pending' => array_map(fn($x) => ['year' => (int)$x['year'], 'category' => (int)$x['cat'], 'award' => pick($x['name_it'], $x['name_en']), 'place' => (int)$x['place'], 'kind' => $x['kind'],
                'product' => ['id' => (int)$x['pid'], 'name' => $x['name'], 'slug' => $x['slug']]], $todo)]);

    case 'staff.cert.issue':
        $u = staff(ROLE_MASTER);
        $b = body();
        $x = q('SELECT e.year, e.status, ac.id AS cat, ac.name_it, ac.name_en, ac.kind, n.place, p.id AS pid, p.name, p.slug, p.score,
                (SELECT AVG(r.rating) FROM ' . t('reviews') . " r WHERE r.product_id = p.id AND r.status = 'visible') AS cavg FROM " . t('nominees') . ' n
            JOIN ' . t('award_categories') . ' ac ON ac.id = n.category_id JOIN ' . t('editions') . ' e ON e.id = ac.edition_id JOIN ' . t('products') . ' p ON p.id = n.product_id
            WHERE n.category_id = ? AND n.product_id = ?', [int_in($b, 'category'), int_in($b, 'product')])->fetch();
        if (!$x || $x['place'] === null) fail('not_found', 404);
        if ($x['status'] !== 'published') fail('edition_not_published', 409);
        if (q('SELECT 1 FROM ' . t('certificates') . ' WHERE category_id = ? AND product_id = ?', [$x['cat'], $x['pid']])->fetchColumn()) fail('cert_exists', 409);
        $code = cert_new_code((int)$x['year']);
        $kind = $x['kind'] === 'public' ? 'public' : 'jury';
        q('INSERT INTO ' . t('certificates') . ' (code, category_id, product_id, place, year, product_name, product_slug, award_it, award_en, score, kind, issued_by, issued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$code, $x['cat'], $x['pid'], $x['place'], $x['year'], $x['name'], $x['slug'], $x['name_it'], $x['name_en'], $kind === 'public' ? ($x['cavg'] !== null ? round((float)$x['cavg'], 2) : null) : $x['score'], $kind, $u['id'], now_utc()]);
        $cid = (int)db()->lastInsertId();
        audit($u['id'], 'cert.issue', 'certificate', $cid, ['code' => cert_display($code), 'product' => $x['name']]);
        $c = q('SELECT * FROM ' . t('certificates') . ' WHERE id = ?', [$cid])->fetch();
        send_json(['ok' => true, 'code' => cert_display($code), 'url' => cert_url($c)]);

    case 'staff.cert.revoke':
    case 'staff.cert.restore':
        // a revoked certificate keeps answering at its address, saying it was revoked, when and why
        $u = staff(ROLE_MASTER);
        $b = body();
        $c = q('SELECT * FROM ' . t('certificates') . ' WHERE id = ?', [int_in($b, 'id')])->fetch();
        if (!$c) fail('not_found', 404);
        if ($r === 'staff.cert.revoke') {
            $reason = s($b, 'reason', 300);
            if ($reason === '') fail('reason_required', 422);
            q('UPDATE ' . t('certificates') . ' SET revoked_at = ?, revoke_reason = ? WHERE id = ?', [now_utc(), $reason, $c['id']]);
        } else q('UPDATE ' . t('certificates') . ' SET revoked_at = NULL, revoke_reason = NULL WHERE id = ?', [$c['id']]);
        audit($u['id'], $r === 'staff.cert.revoke' ? 'cert.revoke' : 'cert.restore', 'certificate', (int)$c['id'], ['code' => cert_display($c['code'])]);
        send_json(['ok' => true]);
}

fail('not_found', 404);
