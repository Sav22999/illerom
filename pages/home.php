<?php
// The apps of SavOffice are one card that leads to the page of the suite (../savoffice/), in the place of the first of
// them; their own pages stay, reachable from there and from the search of the suite card.
$suite = array_filter($projects, fn($p) => ($p['suite'] ?? '') === 'savoffice');
ksort($suite); // alphabetical, as on the page of the suite and in the SavOffice button
$home = [];
foreach ($projects as $s => $p) {
    if (!isset($p['suite'])) { $home[$s] = $p; continue; }
    if (isset($home['savoffice'])) continue;
    $members = array_map(fn($x) => $x['name'], $suite);
    $words = fn(string $l) => implode(' ', array_map(fn($x) => $x[$l][0] . ' ' . implode(' ', $x[$l][2]), $suite));
    $home['savoffice'] = [
        'name' => 'SavOffice', 'cat' => 'work', 'level' => 2, 'account' => 'required',
        'offline' => false, 'play' => '', // only some of the apps work offline: their own pages say which
        'url' => '/savoffice/' . ($lang === 'it' ? '?lang=it' : '?lang=en'), 'page' => '/savoffice/?lang=' . $lang, 'apps' => array_keys($suite),
        'it' => ['Un ufficio libero, aperto, tuo: ' . count($suite) . ' app che lavorano insieme.', 'File, foto, documenti, fogli di calcolo, libri, presentazioni, calendario, sondaggi, attività, moduli, lavagna, quaderni, posta, podcast, spese condivise e newsletter. ' . implode(' ', $members), [$words('it')]],
        'en' => ['A free, open office of your own: ' . count($suite) . ' apps that work together.', 'Files, photos, documents, spreadsheets, books, presentations, calendar, polls, tasks, forms, whiteboard, notebooks, email, podcasts, shared expenses and newsletters. ' . implode(' ', $members), [$words('en')]],
    ];
}
$projects = $home;
?>
<?php
$games = count(array_filter($projects, fn($x) => $x['cat'] === 'games'));
$stats = [[count($projects), $t['stat_projects']], [$games, $t['stat_games']], [count($suite), $t['stat_apps']], [0, $t['stat_ads']]];
$q = '?lang=' . $lang;
?>
<section class="hero">
    <div class="wrap hero-in">
        <div class="hero-text">
            <p class="kicker"><?= bars() ?><?= e($t['hero_kicker']) ?></p>
            <h1><?= preg_replace('/\*(.+?)\*/u', '<span class="askew">$1</span>', e($t['h1'])) ?></h1>
            <p class="lede"><?= e($t['lede']) ?></p>
            <div class="hero-go">
                <sav-button href="#projects" variant="primary" size="lg"><?= e($t['hero_go']) ?></sav-button>
                <sav-button href="<?= $base ?>about/" appearance="outline" size="lg"><?= e($t['hero_about']) ?></sav-button>
            </div>
        </div>
        <div class="plates<?= $site['flip'] ? '' : ' solo' ?>">
            <div class="plate-y" role="img" aria-label="<?= e($t['plate_alt']) ?>"><?= wordmark() ?></div>
            <?php if ($site['flip']): ?>
                <button class="plate-b" id="flip" type="button" aria-pressed="false" data-on="<?= e($t['unflip']) ?>"
                        data-off="<?= e($t['flip']) ?>"><?= icon('flip') ?><span><?= e($t['flip']) ?></span></button>
            <?php endif; ?>
        </div>
    </div>
    <div class="wrap">
        <ul class="stats">
            <?php foreach ($stats as $i => [$n, $label]): ?>
                <li class="stat stat-<?= $i ?>"><b><?= $n ?></b><span><?= e($label) ?></span></li>
            <?php endforeach; ?>
        </ul>
    </div>
</section>

<?php if ($suite): ?>
<section class="wrap feat" aria-labelledby="feat-h">
    <div class="feat-in">
        <div class="feat-text">
            <p class="kicker"><?= bars() ?><?= e($t['feat_kicker']) ?></p>
            <h2 id="feat-h"><?= preg_replace('/^SavOffice/u', '<span class="sav">Sav</span>Office', e($t['feat_h'])) ?></h2>
            <p><?= e(sprintf($t['feat_p'], count($suite))) ?></p>
            <sav-button href="/savoffice/<?= $q ?>" variant="primary"><?= e($t['feat_go']) ?></sav-button>
        </div>
        <ul class="feat-apps" aria-label="<?= e($t['feat_apps']) ?>">
            <?php foreach ($suite as $a => $x): ?>
                <li><a href="/savoffice/<?= $a ?>/<?= $q ?>" title="<?= e($x[$lang][0]) ?>"><img src="/<?= $a ?>/icons/favicon.svg" alt="" width="56" height="56" loading="lazy"><span><?= pname($x['name']) ?></span></a></li>
            <?php endforeach; ?>
        </ul>
    </div>
</section>
<?php endif; ?>

<section class="wrap list" id="projects" aria-labelledby="list-h">
    <div class="list-head">
        <h2 id="list-h"><?= e($t['list_h']) ?></h2>
        <p><?= e($t['list_p']) ?></p>
    </div>
    <form class="filters" id="filters" role="search" hidden>
        <sav-input class="find" id="q" type="search" clearable aria-label="<?= e($t['search']) ?>"
                   placeholder="<?= e($t['search_ph']) ?>"><span slot="prefix"><?= icon('search') ?></span></sav-input>
        <div class="rows">
            <div class="row" role="group" aria-label="<?= e($t['cat_label']) ?>">
                <sav-chip-group id="cat" required>
                    <?php foreach ($t['cats'] as $k => $label): $n = $k === 'all' ? count($projects) : count(array_filter($projects, fn($x) => $x['cat'] === $k)); ?>
                        <sav-chip value="<?= $k ?>"<?= $k === 'all' ? ' selected' : '' ?>><?= e($label) ?>
                            <small><?= $n ?></small></sav-chip>
                    <?php endforeach; ?>
                </sav-chip-group>
            </div>
            <div class="row" role="group" aria-label="<?= e($t['facts_label']) ?>">
                <sav-chip-group id="facts" multiple>
                    <sav-chip value="noaccount" variant="neutral"><span
                                slot="prefix"><?= icon('nouser') ?></span><?= e($t['f_noaccount']) ?></sav-chip>
                    <sav-chip value="offline" variant="neutral"><span
                                slot="prefix"><?= icon('offline') ?></span><?= e($t['f_offline']) ?></sav-chip>
                    <sav-chip value="android" variant="neutral"><span
                                slot="prefix"><?= icon('phone') ?></span><?= e($t['f_android']) ?></sav-chip>
                </sav-chip-group>
            </div>
        </div>
    </form>
    <p class="count" id="count" role="status" data-one="<?= e($t['count_one']) ?>"
       data-many="<?= e($t['count_many']) ?>"><?= e(sprintf($t['count_many'], count($projects))) ?></p>
    <ul class="grid" id="grid">
        <?php foreach ($projects as $s => $p) require ROOT . '/include/card.php'; ?>
    </ul>
    <div class="none" id="none" hidden>
        <span class="none-bars"><?= bars(0) ?></span>
        <h3><?= e($t['none_title']) ?></h3>
        <p><?= e($t['none_text']) ?></p>
        <sav-button id="reset" appearance="outline"><?= e($t['reset']) ?></sav-button>
    </div>
</section>

<section class="why" aria-labelledby="why-h">
    <div class="wrap">
        <p class="kicker"><?= bars() ?><?= e($t['why_kicker']) ?></p>
        <h2 id="why-h"><?= e($t['why_h']) ?></h2>
        <ul class="why-notes">
            <?php foreach ($t['why'] as $i => [$h, $txt]): ?>
                <li class="wn wn-<?= $i ?>">
                    <span class="wn-n"><?= str_pad((string)($i + 1), 2, '0', STR_PAD_LEFT) ?></span>
                    <h3><?= e($h) ?></h3>
                    <p><?= e($txt) ?></p>
                    <?php if ($i === 3): ?>
                        <ul class="wn-levels">
                            <?php foreach ([3, 2, 1] as $lv): ?><li title="<?= e($t['level_text'][$lv]) ?>"><?= bars($lv) ?><?= e($t['levels'][$lv]) ?></li><?php endforeach; ?>
                        </ul>
                    <?php endif; ?>
                </li>
            <?php endforeach; ?>
        </ul>
    </div>
</section>

<section class="wrap tfhome" aria-labelledby="tfhome-h">
    <div class="tfhome-in">
        <a class="tfhome-note note-y" href="<?= $base ?>typeface/" tabindex="-1" aria-hidden="true">
            <span class="tf-text" id="tfhome"><?= e($t['tf_home_sample']) ?></span>
        </a>
        <div>
            <h2 id="tfhome-h"><?= e($t['tf_home_h']) ?></h2>
            <p><?= e($t['tf_home_p']) ?></p>
            <sav-button href="<?= $base ?>typeface/" appearance="outline"><?= e($t['tf_home_link']) ?></sav-button>
        </div>
    </div>
</section>

<section class="homes" aria-labelledby="homes-h">
    <div class="wrap">
        <div class="homes-head">
            <div>
                <h2 id="homes-h"><?= e($t['big_title']) ?></h2>
                <p><?= e($t['big_text']) ?></p>
            </div>
            <a class="more" href="<?= e($site['personal']) ?>"><?= e($t['big_link']) ?><?= icon('out') ?></a>
        </div>
        <ul class="homes-list">
            <?php foreach ($site['big'] as $i => [$name, $url, $img, $text]): ?>
                <li><a href="<?= e($url) ?>"><span class="hm-icon"><img src="<?= asset("projects/$img.png") ?>" alt="" width="48" height="48" loading="lazy"></span><b><?= pname($name) ?></b><span><?= e($text[$lang]) ?></span><span class="hm-host"><?= e(preg_replace('#^https?://(www\.)?|/$#', '', $url)) ?><?= icon('out') ?></span></a></li>
            <?php endforeach; ?>
        </ul>
    </div>
</section>
