<?php
header('Content-Type: application/xml; charset=utf-8');
echo '<?xml version="1.0" encoding="UTF-8"?>', "\n", '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', "\n";
$own = array_filter($projects, fn($p) => !isset($p['suite'])); // the apps of SavOffice have their pages in /savoffice/
$mod = '<lastmod>' . date('Y-m-d', max(filemtime(ROOT . '/data/projects.php'), filemtime(ROOT . '/data/strings.php'), filemtime(ROOT . '/pages/home.php'))) . '</lastmod>';
$pages = array_merge(['', 'about/', 'typeface/', 'status/', 'privacy/', 'terms/'], array_map(fn($s) => "projects/$s/", array_keys($own)));
foreach ($pages as $r) foreach (['it', 'en'] as $l) {
    echo '  <url><loc>', $site['url'], "/$l/$r</loc>", $mod;
    foreach (['it', 'en'] as $a) echo '<xhtml:link rel="alternate" hreflang="', $a, '" href="', $site['url'], "/$a/$r\"/>";
    echo "</url>\n";
}
foreach (array_merge([''], array_map(fn($s) => "$s/", array_keys(array_filter($projects, fn($p) => ($p['suite'] ?? '') === 'savoffice')))) as $r) foreach (['it', 'en'] as $l) {
    echo '  <url><loc>', $site['url'], "/savoffice/$r?lang=$l</loc>", $mod;
    foreach (['it', 'en'] as $a) echo '<xhtml:link rel="alternate" hreflang="', $a, '" href="', $site['url'], "/savoffice/$r?lang=$a\"/>";
    echo "</url>\n";
}
echo "</urlset>\n";
