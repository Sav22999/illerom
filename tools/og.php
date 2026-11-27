<?php
/**
 * The pictures of a shared link (1200 × 630), one per language: php tools/og.php <illerom|savoffice> <it|en> > page.html
 * tools/brand.sh renders them with Chrome into assets/brand/og-<lang>.png and savoffice/og-<lang>.png.
 * The numbers come from data/projects.php, so a new project changes the picture the next time it is drawn.
 */
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
require ROOT . '/include/lib.php';
$projects = require ROOT . '/data/projects.php';
$strings = require ROOT . '/data/strings.php';

[$which, $lang] = [$argv[1] ?? 'illerom', $argv[2] ?? 'it'];
$it = $lang === 'it';
$t = $strings[$lang];
$f = fn(string $p): string => 'file://' . ROOT . '/' . $p;

$suite = array_filter($projects, fn($p) => ($p['suite'] ?? '') === 'savoffice');
ksort($suite);
$home = array_filter($projects, fn($p) => !isset($p['suite']));
$homeCount = count($home) + ($suite ? 1 : 0);
$games = count(array_filter($home, fn($p) => $p['cat'] === 'games'));

$fonts = '@font-face{font-family:Notch;src:url(' . $f('assets/fonts/stack-sans-notch.ttf') . ');font-weight:200 700}'
    . '@font-face{font-family:Inter;src:url(' . $f('assets/fonts/inter-latin-wght-normal.woff2') . ');font-weight:100 900}'
    . '@font-face{font-family:Inter;src:url(' . $f('assets/fonts/inter-latin-ext-wght-normal.woff2') . ');font-weight:100 900;unicode-range:U+0100-024F}';
?><!doctype html>
<html lang="<?= $lang ?>">
<meta charset="utf-8">
<style>
    <?= $fonts ?>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 1200px; height: 630px; overflow: hidden; position: relative; font-family: Inter, sans-serif; -webkit-font-smoothing: antialiased; }
    ul { list-style: none; }
<?php if ($which === 'illerom'): ?>
    body { background: #f4f1f7; color: #2a1430; }
    /* only the name on its notes, as in the opening of the site, and the numbers on four little notes */
    .plate { position: absolute; left: 120px; top: 58px; width: 960px; height: 318px; isolation: isolate; }
    .plate::before, .plate::after { content: ""; position: absolute; inset: 0; z-index: -1; }
    .plate::before { background: #ffd94f; rotate: -2.2deg; box-shadow: 0 22px 44px -24px rgb(42 20 48 / .5); }
    .plate::after { background: #84d3ea; rotate: 2.2deg; z-index: -2; }
    .plate svg { position: absolute; left: 100px; top: 72px; width: 760px; }
    .bar { fill: #7d2359; }
    .stats { position: absolute; left: 120px; right: 120px; top: 432px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
    .stats li { position: relative; isolation: isolate; display: flex; align-items: baseline; gap: 12px; padding: 20px 22px; }
    .stats li::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--c); rotate: var(--r); box-shadow: 0 14px 26px -18px rgb(42 20 48 / .55); }
    .stats b { font: 700 52px/1 Notch, sans-serif; }
    .stats span { font-size: 19px; font-weight: 650; line-height: 1.2; }
    .url { position: absolute; right: 122px; bottom: 30px; display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 650; }
    .url i { width: 12px; height: 12px; background: #7d2359; rotate: -9deg; }
</style>
<body>
<div class="plate"><?= wordmark() ?></div>
<?php $colors = [['#ffd94f', '-1.6deg'], ['#84d3ea', '1.3deg'], ['#b4dd86', '-1.1deg'], ['#f0a9d0', '1.7deg']]; ?>
<ul class="stats">
    <?php foreach ([[$homeCount, $t['stat_projects']], [$games, $t['stat_games']], [count($suite), $t['stat_apps']], [0, $t['stat_ads']]] as $i => [$n, $label]): ?>
        <li style="--c:<?= $colors[$i][0] ?>;--r:<?= $colors[$i][1] ?>"><b><?= $n ?></b><span><?= e($label) ?></span></li>
    <?php endforeach; ?>
</ul>
<p class="url"><i></i>illerom.eu</p>
<?php else: ?>
    body { background: #f6f5f3; color: #1d1d22; }
    .sun { position: absolute; right: -110px; bottom: -170px; width: 460px; height: 460px; border-radius: 50%; background: #ffd166; opacity: .32; }
    .dot { position: absolute; left: -90px; top: -120px; width: 330px; height: 330px; border-radius: 50%; background: rgb(120 69 244 / .12); }
    .brand { position: absolute; left: 76px; top: 70px; display: flex; align-items: center; gap: 18px; }
    .brand img { width: 74px; height: 74px; }
    .brand span { font-size: 56px; letter-spacing: -.04em; line-height: 1; font-weight: 400; }
    .brand b { font-weight: 800; }
    h1 { position: absolute; left: 76px; top: 196px; width: 560px; font-size: 62px; line-height: 1.02; letter-spacing: -.05em; font-weight: 800; }
    h1 em { font-style: normal; background: linear-gradient(90deg, #7845f4, #13a079 55%, #d6378a); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .lede { position: absolute; left: 78px; top: 362px; width: 540px; font-size: 23px; line-height: 1.38; color: #5e5e68; font-weight: 500; }
    .pills { position: absolute; left: 76px; bottom: 62px; display: flex; flex-wrap: wrap; gap: 10px; width: 640px; }
    .pills li { display: inline-flex; align-items: center; gap: 8px; padding: 7px 13px; border-radius: 99px; background: #fff; border: 1px solid #e4e2de; font-size: 17px; font-weight: 600; }
    .pills li::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: #ffd166; }
    .grid { position: absolute; right: 64px; top: 92px; display: grid; grid-template-columns: repeat(4, 104px); gap: 22px; rotate: -4deg; }
    .grid li { width: 104px; height: 104px; display: grid; place-items: center; border-radius: 26px; background: #fff; box-shadow: 0 12px 28px rgb(30 20 40 / .10), 0 0 0 1px rgb(30 20 40 / .05); }
    .grid img { width: 72px; height: 72px; }
    .url { position: absolute; right: 70px; bottom: 50px; font-size: 21px; font-weight: 650; display: flex; align-items: center; gap: 10px; }
    .url i { width: 12px; height: 12px; border-radius: 4px; background: #7845f4; }
</style>
<body>
<div class="dot"></div>
<div class="sun"></div>
<div class="brand"><img src="<?= $f('savoffice/icons/favicon.svg') ?>" alt=""><span>Sav<b>Office</b></span></div>
<h1><?= $it ? 'Un ufficio <em>libero</em>, aperto, tuo.' : 'A <em>free</em>, open office of your own.' ?></h1>
<p class="lede"><?= e($it ? count($suite) . ' app gratuite e open source che lavorano insieme, con un solo account.' : count($suite) . ' free, open-source apps that work together, with one account.') ?></p>
<ul class="pills">
    <?php foreach ($it ? ['Gratis', 'Open source', 'Niente pubblicità', 'Dati nell’UE'] : ['Free', 'Open source', 'No ads', 'Data in the EU'] as $p): ?><li><?= e($p) ?></li><?php endforeach; ?>
</ul>
<ul class="grid">
    <?php foreach (array_keys($suite) as $a): ?><li><img src="<?= $f("$a/icons/favicon.svg") ?>" alt=""></li><?php endforeach; ?>
</ul>
<p class="url"><i></i>illerom.eu/savoffice</p>
<?php endif; ?>
</body>
</html>
