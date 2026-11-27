<?php
/**
 * SavPodcasts — from cron (never from the browser: tools/ is blocked by .htaccess, and this file runs only on the command
 * line). Reads again the feeds that people follow and that are older than refresh_minutes, ten at a time, for at most
 * --minutes (4 by default); then cleans up: answers of the catalogues older than a day, artwork not asked for in 90 days,
 * feeds nobody follows or listened to for 30 days (with their episodes).
 *
 *   php savpodcasts/tools/refresh.php [--minutes=4]
 *   e.g. every 15 minutes:  *\/15 * * * *  php /path/to/savpodcasts/tools/refresh.php
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/feeds.php';

if (!credentials()) { fwrite(STDERR, "SavPodcasts: not installed\n"); exit(1); }
$minutes = 4;
foreach ($argv as $a) if (preg_match('/^--minutes=(\d+)$/', $a, $m)) $minutes = max(1, min(30, (int)$m[1]));
$until = time() + $minutes * 60;
$every = (int)config_value('refresh_minutes', 30);
$done = ['new' => 0, 'same' => 0, 'error' => 0];

while (time() < $until) {
    $rows = q('SELECT * FROM ' . t('pod_feeds') . ' WHERE subs > 0 AND (checked_at IS NULL OR checked_at < ?) ORDER BY checked_at IS NOT NULL, checked_at LIMIT 30', [gmdate('Y-m-d H:i:s', time() - $every * 60)])->fetchAll();
    $rows = array_slice(array_values(array_filter($rows, 'feed_stale')), 0, 10);
    if (!$rows) break;
    foreach (refresh_feeds($rows, 20) as $r) $done[$r] = ($done[$r] ?? 0) + 1;
}

// clean-up
$cache = q('DELETE FROM ' . t('pod_cache') . ' WHERE at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)])->rowCount();
$old = gmdate('Y-m-d H:i:s', time() - 30 * 86400);
$feeds = q('DELETE f FROM ' . t('pod_feeds') . ' f WHERE f.subs = 0 AND f.created_at < ? AND (f.checked_at IS NULL OR f.checked_at < ?)
    AND NOT EXISTS (SELECT 1 FROM ' . t('pod_episodes') . ' e JOIN ' . t('pod_states') . ' s ON s.episode_id = e.id WHERE e.feed_id = f.id)
    AND NOT EXISTS (SELECT 1 FROM ' . t('pod_episodes') . ' e JOIN ' . t('pod_queue') . ' qu ON qu.episode_id = e.id WHERE e.feed_id = f.id)', [$old, $old])->rowCount();
$pics = 0;
foreach ([dirname(__DIR__) . '/cache/img', sys_get_temp_dir() . '/savpodcasts-img'] as $dir) {
    foreach (glob($dir . '/*') ?: [] as $f) if (is_file($f) && filemtime($f) < time() - 90 * 86400 && @unlink($f)) $pics++;
}
printf("SavPodcasts: %d feeds with new episodes, %d unchanged, %d not answering; removed %d cached answers, %d unused feeds, %d pictures\n", $done['new'], $done['same'], $done['error'], $cache, $feeds, $pics);
