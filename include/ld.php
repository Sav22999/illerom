<?php
/**
 * Structured data (schema.org, JSON-LD) of the page, for search engines and AI assistants: the site and its author on
 * every page, then what the page is: the list of projects (home), the author (about) or one project with its breadcrumb.
 * Needs $page, $lang, $t, $site, $projects, $slug, $base, $rest. Prints one <script type="application/ld+json">.
 */
$url = $site['url'] . $base . $rest;
$person = ['@type' => 'Person', '@id' => rtrim($site['personal'], '/') . '/#person', 'name' => 'Saverio Morelli', 'url' => $site['personal'],
    'sameAs' => ['https://github.com/Sav22999', 'https://www.linkedin.com/in/saveriomorelli']];
$website = ['@type' => 'WebSite', '@id' => $site['url'] . '/#website', 'name' => 'Illerom', 'alternateName' => 'illerom.eu', 'url' => $site['url'] . '/',
    'description' => $t['home_desc'], 'inLanguage' => ['it', 'en'], 'publisher' => ['@id' => $person['@id']], 'author' => ['@id' => $person['@id']],
    'potentialAction' => ['@type' => 'SearchAction', 'target' => ['@type' => 'EntryPoint', 'urlTemplate' => $site['url'] . $base . '?q={search_term_string}'], 'query-input' => 'required name=search_term_string']];
$graph = [$website, $person];
$crumb = fn(array $items) => ['@type' => 'BreadcrumbList', 'itemListElement' => array_map(fn($i, $x) => ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $x[0], 'item' => $x[1]], array_keys($items), $items)];
$abs = fn(string $u): string => is_external($u) ? $u : $site['url'] . $u;

if ($page === 'home') {
    // the list as the home shows it: the apps of SavOffice are one entry, the suite
    $list = [];
    foreach ($projects as $s => $p) {
        if (isset($p['suite'])) continue;
        $list[] = [$p['name'], $site['url'] . $base . "projects/$s/", $p[$lang][0]];
    }
    array_unshift($list, ['SavOffice', $site['url'] . '/savoffice/?lang=' . $lang, $t['feat_h']]);
    $graph[] = ['@type' => 'CollectionPage', '@id' => $url . '#page', 'url' => $url, 'name' => $t['home_title'], 'description' => $t['home_desc'], 'inLanguage' => $lang,
        'isPartOf' => ['@id' => $website['@id']], 'primaryImageOfPage' => $site['url'] . "/assets/brand/og-$lang.png",
        'mainEntity' => ['@type' => 'ItemList', 'numberOfItems' => count($list), 'itemListElement' => array_map(fn($i, $x) => ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $x[0], 'url' => $x[1], 'description' => $x[2]], array_keys($list), $list)]];
} elseif ($page === 'about') {
    $graph[] = ['@type' => 'AboutPage', '@id' => $url . '#page', 'url' => $url, 'name' => $t['about_title'], 'description' => $t['about_desc'], 'inLanguage' => $lang,
        'isPartOf' => ['@id' => $website['@id']], 'about' => ['@id' => $website['@id']], 'author' => ['@id' => $person['@id']]];
} elseif ($page === 'project') {
    $p = $projects[$slug];
    $game = $p['cat'] === 'games';
    $app = ['@type' => $game ? ['VideoGame', 'WebApplication'] : 'WebApplication', '@id' => $url . '#app', 'name' => $p['name'], 'headline' => $p[$lang][0],
        'description' => $p[$lang][1], 'featureList' => $p[$lang][2], 'inLanguage' => $p['langs'], 'isAccessibleForFree' => true,
        'applicationCategory' => $game ? 'GameApplication' : ($p['cat'] === 'learn' ? 'EducationalApplication' : ($p['cat'] === 'home' ? 'LifestyleApplication' : 'BusinessApplication')),
        'operatingSystem' => $p['play'] ? 'Web, Android' : 'Web', 'author' => ['@id' => $person['@id']], 'publisher' => ['@id' => $person['@id']],
        'offers' => ['@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'EUR'], 'mainEntityOfPage' => $url];
    if ($p['url'] !== '') $app['url'] = $abs($p['url']);
    if (is_file(ROOT . "/assets/projects/$slug.png")) $app['image'] = $site['url'] . "/assets/projects/$slug.png";
    if (($n = (int)($p['desk'] ?? 0)) > 0) $app['screenshot'] = array_map(fn($j) => $site['url'] . "/assets/projects/$slug/d$j.jpg", range(1, $n));
    if ($src = source_url($p, $site)) $app['sameAs'] = [$src];
    if ($p['play']) $app['installUrl'] = 'https://play.google.com/store/apps/details?id=' . $p['play'];
    $graph[] = $app;
    $graph[] = $crumb([['Illerom', $site['url'] . $base], [$p['name'], $url]]);
}

echo '<script type="application/ld+json">', json_encode(['@context' => 'https://schema.org', '@graph' => $graph], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG), "</script>\n";
