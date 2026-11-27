<?php
/**
 * SavReads — from cron (never from the browser: tools/ is blocked by .htaccess, and this file runs only on the command
 * line). Reads again the feeds that people follow and that are older than refresh_minutes, ten at a time, then the
 * articles still waiting for their text (an import, a page that was busy), for at most --minutes (4 by default); then
 * cleans up: feeds nobody follows for 30 days (with their articles), pictures not asked for in 90 days.
 *
 *   php savreads/tools/refresh.php [--minutes=4]
 *   e.g. every 15 minutes:  *\/15 * * * *  php /path/to/savreads/tools/refresh.php
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/feeds.php';

if (!credentials()) { fwrite(STDERR, "SavReads: not installed\n"); exit(1); }
$minutes = 4;
foreach ($argv as $a) if (preg_match('/^--minutes=(\d+)$/', $a, $m)) $minutes = max(1, min(30, (int)$m[1]));
$until = time() + $minutes * 60;
$every = (int)config_value('refresh_minutes', 30);
$done = ['new' => 0, 'same' => 0, 'error' => 0];

// the feeds: two thirds of the time at most
while (time() < $until - $minutes * 20) {
    $rows = q('SELECT * FROM ' . t('rd_feeds') . ' WHERE subs > 0 AND (checked_at IS NULL OR checked_at < ?) ORDER BY checked_at IS NOT NULL, checked_at LIMIT 30', [gmdate('Y-m-d H:i:s', time() - $every * 60)])->fetchAll();
    $rows = array_slice(array_values(array_filter($rows, 'rd_feed_stale')), 0, 10);
    if (!$rows) break;
    foreach (rd_refresh_feeds($rows, 20) as $r) $done[$r] = ($done[$r] ?? 0) + 1;
}

// the articles waiting for their text, of every account
$read = $failed = 0;
while (time() < $until) {
    $rows = q('SELECT id, url FROM ' . t('rd_articles') . " WHERE status = 'pending' AND tries < 3 ORDER BY tries, added_at DESC LIMIT 8")->fetchAll();
    if (!$rows) break;
    $urls = [];
    foreach ($rows as $a) $urls[(int)$a['id']] = $a['url'];
    foreach (rd_fetch_pages($urls, 20) as $id => $x) {
        if (isset($x['error'])) {
            $final = $x['error'] === 'bad_url' || $x['error'] === 'not_page' || preg_match('/^http_4(?!29)/', $x['error']);
            q('UPDATE ' . t('rd_articles') . ' SET status = IF(? OR tries >= 2, \'failed\', \'pending\'), error = ?, tries = tries + 1, updated_at = ? WHERE id = ?', [$final ? 1 : 0, mb_substr($x['error'], 0, 40), now_utc(), $id]);
            $failed++;
            continue;
        }
        $ok = $x['content'] !== '' && ($x['words'] >= 20 || stripos($x['content'], '<img') !== false);
        q('UPDATE ' . t('rd_articles') . ' SET title = IF(? <> \'\', ?, title), author = ?, site = ?, lang = ?, image = ?, excerpt = ?, content = ?, words = ?, published_at = ?, status = ?, error = ?, tries = tries + 1, updated_at = ? WHERE id = ?', [
            $x['title'], mb_substr($x['title'], 0, 400), mb_substr($x['author'], 0, 300), mb_substr($x['site'], 0, 200), mb_substr($x['lang'], 0, 16), mb_substr($x['image'], 0, 2048), mb_substr($x['excerpt'], 0, 500),
            $x['content'] !== '' ? $x['content'] : null, (int)$x['words'], $x['published'], $ok ? 'ready' : 'failed', $ok ? '' : 'no_text', now_utc(), $id]);
        $read++;
    }
}

// clean-up
$old = gmdate('Y-m-d H:i:s', time() - 30 * 86400);
$feeds = q('DELETE FROM ' . t('rd_feeds') . ' WHERE subs = 0 AND created_at < ? AND (checked_at IS NULL OR checked_at < ?)', [$old, $old])->rowCount();
$pics = 0;
foreach ([dirname(__DIR__) . '/cache/img', sys_get_temp_dir() . '/savreads-img'] as $dir) {
    foreach (glob($dir . '/*') ?: [] as $f) if (is_file($f) && fileatime($f) < time() - 90 * 86400 && filemtime($f) < time() - 90 * 86400 && @unlink($f)) $pics++;
}
printf("SavReads: %d feeds with new articles, %d unchanged, %d not answering; %d articles read, %d not readable; removed %d unused feeds, %d pictures\n", $done['new'], $done['same'], $done['error'], $read, $failed, $feeds, $pics);
