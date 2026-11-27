<?php
/**
 * /llms.txt and /llms-full.txt (https://llmstxt.org): what Illerom is and every project, in Markdown, for language models
 * and the assistants that read the web. Written from data/projects.php, so a new project shows up here by itself.
 * $full: false = one line per project, true = descriptions, features and facts too. In English (the site is also Italian).
 */
header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex'); // for machines that read it, not a page to find in search results
$t = $strings['en'];
$u = $site['url'];
$own = array_filter($projects, fn($p) => !isset($p['suite']));
$suite = array_filter($projects, fn($p) => ($p['suite'] ?? '') === 'savoffice');
ksort($suite);
$page = fn(string $s, array $p): string => isset($p['suite']) ? "$u/savoffice/$s/?lang=en" : "$u/en/projects/$s/";
$open = fn(array $p): string => $p['url'] === '' ? '' : (is_external($p['url']) ? $p['url'] : $u . $p['url']);
$kinds = ['games' => 'Games', 'work' => 'Apps for work', 'home' => 'Apps for the home', 'learn' => 'Apps for studying'];

/** One project: a line, or (full) a section with everything the page of the project says. */
$item = function (string $s, array $p) use ($full, $t, $page, $open, $site): string {
    [$tag, $desc, $features] = $p['en'];
    if (!$full) return "- [{$p['name']}]({$page($s, $p)}): $tag " . $desc . ($open($p) ? " Open it at {$open($p)}" : '') . "\n";
    $facts = [
        'Status' => $t['levels'][$p['level']] . ' (' . $t['level_text'][$p['level']] . ')',
        'Account' => $t['account'][$p['account']],
        'Works offline' => $p['offline'] ? 'yes' : 'no',
        'Languages' => implode(', ', array_map(fn($l) => $t['lang_names'][$l] ?? $l, $p['langs'])),
        'Android' => $p['play'] ? 'https://play.google.com/store/apps/details?id=' . $p['play'] : 'no',
        'Price' => 'free, no adverts',
        'Open it' => $open($p) ?: 'not yet',
        'Page' => $page($s, $p),
        'Source code' => source_url($p, $site) ?: 'not published yet',
        'Privacy' => $open($p) && $p['privacy'] ? $open($p) . $p['privacy'] : '',
    ];
    $o = "### {$p['name']}\n\n$tag $desc\n\n";
    foreach ($features as $f) $o .= "- $f\n";
    $o .= "\n";
    foreach (array_filter($facts) as $k => $v) $o .= "- $k: $v\n";
    return $o . "\n";
};

echo "# Illerom\n\n";
echo "> Illerom (www.illerom.eu) is the portal of the open projects by Saverio Morelli: games, apps and free alternatives to the usual services, to try right away, even before they are finished. Every project is free, open source, without adverts or third-party tracking, and in Italian and English.\n\n";
echo "The name is \"Morelli\" read backwards. Each project shows how far along it is with the three bars of the mark: " . implode('; ', array_map(fn($n) => "{$t['levels'][$n]}: " . rtrim($t['level_text'][$n], '.'), [3, 2, 1])) . "\n\n";
echo "SavOffice is the office suite of Illerom: " . count($suite) . " apps that work together (" . implode(', ', array_map(fn($p) => $p['name'], $suite)) . "), with one account, the same look and the data in the European Union. The bigger projects of the same author (Notefox, Sav PDF Viewer, SavAccount, SavComponents) have their own sites, listed on https://www.saveriomorelli.com/.\n\n";

echo "## Pages\n\n";
echo "- [Home]($u/en/): all the projects, with search and filters (Italian: $u/it/)\n";
echo "- [About]($u/en/about/): what Illerom is, the name, the rules, the status of the projects\n";
echo "- [SavOffice]($u/savoffice/?lang=en): the suite of " . count($suite) . " apps (also at https://savoffice.eu)\n";
echo "- [Illerom Bars]($u/en/typeface/): the typeface made from the mark, free to download\n";
echo "- [Status]($u/en/status/): whether the services and their databases are working\n";
echo "- [Privacy]($u/en/privacy/): the portal sets no cookies and has no analytics\n\n";

echo "## SavOffice\n\n";
foreach ($suite as $s => $p) echo $item($s, $p);
echo $full ? '' : "\n";
foreach ($kinds as $k => $title) {
    $list = array_filter($own, fn($p) => $p['cat'] === $k);
    if (!$list) continue;
    echo "## $title\n\n";
    foreach ($list as $s => $p) echo $item($s, $p);
    echo $full ? '' : "\n";
}

echo "## Optional\n\n";
echo $full ? "- [Short version]($u/llms.txt): one line per project\n" : "- [Full version]($u/llms-full.txt): every project with its features and facts\n";
echo "- [Sitemap]($u/sitemap.xml)\n";
echo "- [Source code]({$site['repo']}): the portal and the projects, on GitHub\n";
echo "- [Saverio Morelli]({$site['personal']}): the author, and his other projects\n";
echo "- [Contact]({$site['contact']})\n";
