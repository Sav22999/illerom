<?php
/**
 * SavOffice — the checks of every app of SavOffice in one job: see README.md. Run it every 30 minutes (e.g. 0,30 * * * *)
 * instead of scheduling each script on its own.
 *
 * It runs the scripts listed in JOBS one after the other, each in a process (or a request) of its own: every app loads
 * its own libraries, whose functions share names (credentials(), db(), t()…), and every script ends with exit. A script
 * that fails or is missing does not stop the others. The answer gathers the answer of each one.
 *
 *   command line: each script with the same PHP binary (php savoffice-checks.php, no key needed)
 *   URL:          each script by its own URL on this site, with the same key (…/savoffice-checks.php?key=SECRET_KEY);
 *                 under the built-in server of PHP (php -S, one request at a time: it could not answer itself) each
 *                 script runs with the PHP binary instead
 *
 * A new app with something to check every 30 minutes: one more line in JOBS.
 */

declare(strict_types=1);

const JOBS = [
    'savnewsletters-schedule.php',  // SavNewsletters: newsletters whose slot has come, the sending queue
    'savnewsletters-reminders.php', // SavNewsletters: proposals waiting for approval near their slot
    'savtasks-reminders.php',       // SavTasks: the reminders of the tasks by email
];
const JOB_TIMEOUT = 300;            // seconds for each script (the sending of newsletters takes up to about 4 minutes)

header('Content-Type: application/json');
header('X-Robots-Tag: noindex, nofollow');

function finish_savoffice_checks(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    exit($status === 200 ? 0 : 1);
}

$key = '';
if (PHP_SAPI !== 'cli') {
    $cron = is_file(__DIR__ . '/credentials.php') ? require __DIR__ . '/credentials.php' : [];
    $key = (string)($cron['cron_key'] ?? '');
    if (strlen($key) < 32) finish_savoffice_checks(503, ['error' => 'cron_key is not configured']);
    if (!hash_equals($key, (string)($_GET['key'] ?? ''))) finish_savoffice_checks(403, ['error' => 'forbidden']);
}

@set_time_limit(0);
ignore_user_abort(true);

// one run at a time: a run that is still going makes the next one wait for the following turn
$lock = fopen(sys_get_temp_dir() . '/savoffice-checks.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) finish_savoffice_checks(200, ['ok' => true, 'skipped' => 'still running', 'utc' => gmdate('Y-m-d H:i')]);

/** A script from the command line, with the same PHP: [exit code, output]. */
function run_cli(string $file): array
{
    $p = proc_open([PHP_BINARY, $file], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, __DIR__);
    if (!is_resource($p)) return [-1, 'cannot start'];
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $out = $err = '';
    $end = time() + JOB_TIMEOUT;
    while (true) {
        $out .= (string)stream_get_contents($pipes[1]);
        $err .= (string)stream_get_contents($pipes[2]);
        $st = proc_get_status($p);
        if (!$st['running']) break;
        if (time() > $end) {
            proc_terminate($p);
            return [-1, 'timeout'];
        }
        usleep(100000);
    }
    $out .= (string)stream_get_contents($pipes[1]);
    $err .= (string)stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($p);
    return [(int)$st['exitcode'], $out !== '' ? $out : $err];
}

/** A script by its URL on this site, with the key: [HTTP status (0 = no answer), body]. */
function run_url(string $name, string $key): array
{
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    $host = preg_replace('/[^a-z0-9.:-]/i', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $url = ($https ? 'https://' : 'http://') . $host . rtrim(dirname((string)$_SERVER['SCRIPT_NAME']), '/') . '/' . $name . '?key=' . rawurlencode($key);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => JOB_TIMEOUT, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_USERAGENT => 'SavOffice checks']);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        return [$code, $body === false ? $error : (string)$body];
    }
    $ctx = stream_context_create(['http' => ['timeout' => JOB_TIMEOUT, 'ignore_errors' => true, 'header' => "User-Agent: SavOffice checks\r\n"]]);
    $body = @file_get_contents($url, false, $ctx);
    $head = function_exists('http_get_last_response_headers') ? (http_get_last_response_headers() ?? []) : ($http_response_header ?? []);
    $code = isset($head[0]) && preg_match('/\s(\d{3})\s/', $head[0], $m) ? (int)$m[1] : 0;
    return [$code, $body === false ? 'no answer' : $body];
}

$viaCli = PHP_SAPI === 'cli' || PHP_SAPI === 'cli-server';
$jobs = [];
$ok = true;
foreach (JOBS as $name) {
    $file = __DIR__ . '/' . $name;
    $job = basename($name, '.php');
    if (!is_file($file)) {
        $jobs[$job] = ['ok' => true, 'skipped' => 'not installed'];
        continue;
    }
    $t = microtime(true);
    try {
        [$code, $out] = $viaCli ? run_cli($file) : run_url($name, $key);
        $good = $viaCli ? $code === 0 : $code === 200;
    } catch (Throwable $e) {
        [$code, $out, $good] = [-1, $e->getMessage(), false];
    }
    $answer = json_decode(trim((string)$out), true);
    $jobs[$job] = ['ok' => $good, 'seconds' => round(microtime(true) - $t, 1)]
        + (is_array($answer) ? ['result' => $answer] : ['output' => mb_substr(trim((string)$out), -500)])
        + ($good ? [] : [$viaCli ? 'exit' : 'status' => $code]);
    if (!$good) {
        $ok = false;
        error_log('SavOffice checks: ' . $job . ' failed (' . $code . ')');
    }
}

flock($lock, LOCK_UN);
finish_savoffice_checks($ok ? 200 : 500, ['ok' => $ok, 'utc' => gmdate('Y-m-d H:i'), 'jobs' => $jobs]);
