<?php
header('Content-Type: application/xml; charset=utf-8');
echo '<?xml version="1.0" encoding="UTF-8"?>', "\n", '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', "\n";
$pages = array_merge(['', 'about/', 'privacy/'], array_map(fn($s) => "projects/$s/", array_keys($projects)));
foreach ($pages as $r) foreach (['it', 'en'] as $l) {
    echo '  <url><loc>', $site['url'], "/$l/$r</loc>";
    foreach (['it', 'en'] as $a) echo '<xhtml:link rel="alternate" hreflang="', $a, '" href="', $site['url'], "/$a/$r\"/>";
    echo "</url>\n";
}
echo "</urlset>\n";
