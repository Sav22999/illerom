<?php
/**
 * SavAwards — what is new, as a feed: products reviewed (newest analysis first) and published awards editions.
 * feed.php (RSS 2.0) · feed.php?format=json (JSON Feed 1.1) · &lang=it|en
 */

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/catalog.php';

if (!credentials()) {
    http_response_code(503);
    exit;
}
$l = lang();
$it = $l === 'it';
$app = app_url();
$items = [];
foreach (q('SELECT p.*, c.name_it AS c_it, c.name_en AS c_en FROM ' . t('products') . ' p LEFT JOIN ' . t('categories') . " c ON c.id = p.category_id
    WHERE p.status = 'published' ORDER BY COALESCE(p.reviewed_at, p.created_at) DESC LIMIT 40")->fetchAll() as $p) {
    $score = $p['score'] !== null ? number_format((float)$p['score'], 1) . '/10' : '';
    $items[] = ['id' => $app . '#/p/' . $p['slug'], 'url' => $app . '#/p/' . $p['slug'], 'title' => $p['name'] . ($score ? " · $score" : ''),
        'summary' => pick($p['tagline_it'], $p['tagline_en'], $l), 'date' => $p['reviewed_at'] ?: $p['created_at'], 'tags' => array_filter([pick($p['c_it'], $p['c_en'], $l)])];
}
foreach (q('SELECT * FROM ' . t('editions') . " WHERE status = 'published' ORDER BY year DESC LIMIT 10")->fetchAll() as $e) {
    $items[] = ['id' => $app . '#/awards/' . $e['year'], 'url' => $app . '#/awards/' . $e['year'], 'title' => (pick($e['title_it'], $e['title_en'], $l) ?: 'SavAwards ' . $e['year']),
        'summary' => mb_substr(pick($e['intro_it'], $e['intro_en'], $l), 0, 400), 'date' => $e['published_at'] ?: ($e['year'] . '-12-01 00:00:00'), 'tags' => ['Awards']];
}
usort($items, fn($a, $b) => strcmp($b['date'], $a['date']));
$title = 'SavAwards';
$desc = $it ? 'Recensioni indipendenti e riconoscimenti per software europei, liberi e open source.' : 'Independent reviews and awards for European, free and open-source software.';
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=900');

if (($_GET['format'] ?? '') === 'json') {
    header('Content-Type: application/feed+json; charset=utf-8');
    echo json_out(['version' => 'https://jsonfeed.org/version/1.1', 'title' => $title, 'home_page_url' => $app, 'feed_url' => $app . 'feed.php?format=json&lang=' . $l,
        'description' => $desc, 'language' => $l, 'icon' => $app . 'icons/icon-512.png',
        'items' => array_map(fn($i) => ['id' => $i['id'], 'url' => $i['url'], 'title' => $i['title'], 'content_text' => $i['summary'], 'date_published' => iso($i['date']), 'tags' => array_values($i['tags'])], $items)]);
    exit;
}
header('Content-Type: application/rss+xml; charset=utf-8');
$x = fn($s) => htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>';
echo '<title>' . $x($title) . '</title><link>' . $x($app) . '</link><description>' . $x($desc) . '</description><language>' . $l . '</language>';
echo '<atom:link href="' . $x($app . 'feed.php?lang=' . $l) . '" rel="self" type="application/rss+xml"/>';
foreach ($items as $i) {
    echo '<item><title>' . $x($i['title']) . '</title><link>' . $x($i['url']) . '</link><guid isPermaLink="false">' . $x($i['id']) . '</guid>'
        . '<pubDate>' . gmdate('D, d M Y H:i:s', strtotime($i['date'] . ' UTC')) . ' +0000</pubDate><description>' . $x($i['summary']) . '</description>'
        . implode('', array_map(fn($t) => '<category>' . $x($t) . '</category>', $i['tags'])) . '</item>';
}
echo '</channel></rss>';
