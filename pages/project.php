<?php
$p = $projects[$slug];
$url = app_url($slug, $p);
$src = source_url($p, $site);
$open = $p['cat'] === 'games' ? $t['play'] : $t['open'];
$hasIcon = is_file(ROOT . "/assets/projects/$slug.png");
$privacy = $p['privacy'] && $url ? $url . $p['privacy'] : '';
// same category first, then the others
$rel = array_filter($projects, fn($x, $k) => $k !== $slug && $x['cat'] === $p['cat'] && $x['url'] !== '', ARRAY_FILTER_USE_BOTH)
    + array_filter($projects, fn($x, $k) => $k !== $slug && $x['cat'] !== $p['cat'] && $x['url'] !== '', ARRAY_FILTER_USE_BOTH);
?>
<article>
<section class="phero">
    <div class="wrap">
        <a class="back" href="<?= $base ?>"><?= icon('back') . e($t['back']) ?></a>
        <div class="phero-in">
            <span class="picon xl cat-<?= $p['cat'] ?>">
<?php if ($hasIcon): ?>
                <img src="<?= asset("projects/$slug.png") ?>" alt="" width="132" height="132" style="view-transition-name:p-<?= $slug ?>">
<?php else: ?>
                <span class="pbars"><?= bars(1) ?></span>
<?php endif; ?>
            </span>
            <div class="phero-text">
                <span class="plevel" title="<?= e($t['level_text'][$p['level']]) ?>"><?= bars($p['level']) ?><?= e($t['levels'][$p['level']]) ?></span>
                <h1><?= e($p['name']) ?></h1>
                <p class="lede"><?= e($p[$lang][0]) ?></p>
<?php if ($url !== ''): ?>
                <div class="actions">
                    <sav-button size="lg" href="<?= e($url) ?>"><?= e($open) ?></sav-button>
<?php if ($p['play']): ?>
                    <sav-button size="lg" appearance="outline" href="https://play.google.com/store/apps/details?id=<?= e($p['play']) ?>"><span slot="prefix"><?= icon('phone') ?></span><?= e($t['gplay']) ?></sav-button>
<?php endif; if ($src): ?>
                    <sav-button size="lg" appearance="outline" href="<?= e($src) ?>"><span slot="prefix"><?= icon('code') ?></span><?= e($t['source']) ?></sav-button>
<?php endif; ?>
                </div>
                <noscript><p><a href="<?= e($url) ?>"><?= e($open) ?></a><?php if ($src): ?> · <a href="<?= e($src) ?>"><?= e($t['source']) ?></a><?php endif; ?></p></noscript>
<?php if (is_external($url)): ?>
                <p class="note"><?= e($t['elsewhere']) ?></p>
<?php endif; endif; ?>
            </div>
        </div>
    </div>
</section>

<div class="wrap pbody">
    <div class="ptext">
        <p class="intro"><?= e($p[$lang][1]) ?></p>
<?php if ($p[$lang][2]): ?>
        <h2><?= e($t['features']) ?></h2>
        <ul class="ticks">
<?php foreach ($p[$lang][2] as $f): ?>
            <li><?= e($f) ?></li>
<?php endforeach; ?>
        </ul>
<?php endif; ?>
    </div>
    <aside class="facts" aria-label="<?= e($t['card']) ?>">
        <h2><?= e($t['card']) ?></h2>
        <dl>
            <div><dt><?= e($t['r_level']) ?></dt><dd><?= e($t['levels'][$p['level']]) ?><small><?= e($t['level_text'][$p['level']]) ?></small></dd></div>
            <div><dt><?= e($t['r_type']) ?></dt><dd><?= e($t['cat_one'][$p['cat']]) ?></dd></div>
<?php if ($url !== ''): ?>
            <div><dt><?= e($t['r_where']) ?></dt><dd><?= e($t['web'] . ($p['play'] ? ', Android' : '')) ?></dd></div>
            <div><dt><?= e($t['r_account']) ?></dt><dd><?= e($t['account'][$p['account']]) ?></dd></div>
            <div><dt><?= e($t['r_offline']) ?></dt><dd><?= e($p['offline'] ? $t['yes_offline'] : $t['no_offline']) ?></dd></div>
            <div><dt><?= e($t['r_langs']) ?></dt><dd><?= e(ucfirst(implode(', ', array_map(fn($l) => $t['lang_names'][$l], $p['langs'])))) ?></dd></div>
            <div><dt><?= e($t['r_status']) ?></dt><dd><a href="<?= $base ?>status/#<?= $slug ?>"><?= e($t['see_status']) ?></a></dd></div>
            <div><dt><?= e($t['r_license']) ?></dt><dd><?= e($t['open_source']) ?></dd></div>
<?php endif; ?>
        </dl>
<?php if ($privacy): ?>
        <a class="more" href="<?= e($privacy) ?>"><?= icon('lock') . e($t['privacy_of']) ?></a>
<?php endif; ?>
    </aside>
</div>

<?php if ($p['shots']): ?>
<section class="shots" aria-labelledby="shots-h">
    <div class="wrap"><h2 id="shots-h"><?= e($t['shots']) ?></h2></div>
    <ul class="strip" tabindex="0" aria-labelledby="shots-h">
<?php for ($i = 1; $i <= $p['shots']; $i++): ?>
        <li><img src="<?= asset("projects/$slug/$i.jpg") ?>" alt="<?= e(sprintf($t['shot_alt'], $p['name'], $i)) ?>" width="281" height="500" loading="lazy"></li>
<?php endfor; ?>
    </ul>
</section>
<?php endif; ?>
</article>

<section class="wrap rel">
    <h2><?= e($t['related']) ?></h2>
    <ul class="grid">
<?php foreach (array_slice($rel, 0, 3, true) as $s => $p) require ROOT . '/include/card.php'; ?>
    </ul>
</section>
