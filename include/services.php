<?php
/** The list of checks, flat: [id, project, type, name, …], from data/projects.php and data/services.php. */
function services(array $projects, array $extra, array $site): array
{
    $out = [['id' => 'portal-web', 'project' => 'portal', 'type' => 'web', 'it' => 'Portale', 'en' => 'Portal', 'url' => $site['url'] . '/en/privacy/']];
    foreach ($projects as $slug => $p) {
        $url = app_url($slug, $p);
        if ($url === '') continue;
        $abs = is_external($url) ? $url : $site['url'] . $url;
        $x = $extra[$slug] ?? [];
        $out[] = ['id' => "$slug-web", 'project' => $slug, 'type' => 'web', 'it' => $p['cat'] === 'games' ? 'Gioco' : 'App web', 'en' => $p['cat'] === 'games' ? 'Game' : 'Web app', 'url' => $abs];
        foreach ($x['web'] ?? [] as $k => [$file, $it, $en]) $out[] = ['id' => "$slug-$k", 'project' => $slug, 'type' => 'web', 'it' => $it, 'en' => $en, 'url' => $abs . $file];
        if (isset($x['app'])) {
            // an app may live in the database of another one (4th element: its folder, version key, version constant)
            [$creds, $key, $const] = ($x['app'][3] ?? []) + [$slug, 'schema_version', 'SCHEMA_VERSION'];
            $out[] = ['id' => "$slug-db", 'project' => $slug, 'type' => 'app', 'it' => $x['app'][1], 'en' => $x['app'][2], 'prefix' => $x['app'][0], 'creds' => $creds, 'key' => $key, 'const' => $const];
            $out[] = ['id' => "$slug-mail", 'project' => $slug, 'type' => 'mail', 'it' => 'Email', 'en' => 'Emails', 'creds' => $creds];
        }
        if (isset($x['game'])) $out[] = ['id' => "$slug-db", 'project' => $slug, 'type' => 'game', 'it' => $x['game'][1], 'en' => $x['game'][2], 'table' => $x['game'][0]];
    }
    return $out;
}
