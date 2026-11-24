<section class="hero">
    <div class="wrap hero-in">
        <div class="hero-text">
            <h1><?= preg_replace('/\*(.+?)\*/u', '<span class="askew">$1</span>', e($t['h1'])) ?></h1>
            <p class="lede"><?= e($t['lede']) ?></p>
        </div>
        <div class="plates<?= $site['flip'] ? '' : ' solo' ?>">
            <div class="plate-y" role="img" aria-label="<?= e($t['plate_alt']) ?>"><?= wordmark() ?></div>
<?php if ($site['flip']): ?>
            <button class="plate-b" id="flip" type="button" aria-pressed="false" data-on="<?= e($t['unflip']) ?>" data-off="<?= e($t['flip']) ?>"><?= icon('flip') ?><span><?= e($t['flip']) ?></span></button>
<?php endif; ?>
        </div>
    </div>
</section>

<section class="wrap list" id="projects" aria-label="<?= e($t['nav_projects']) ?>">
    <form class="filters" id="filters" role="search" hidden>
        <sav-input class="find" id="q" type="search" clearable aria-label="<?= e($t['search']) ?>" placeholder="<?= e($t['search_ph']) ?>"><span slot="prefix"><?= icon('search') ?></span></sav-input>
        <div class="rows">
            <div class="row" role="group" aria-label="<?= e($t['cat_label']) ?>">
                <sav-chip-group id="cat" required>
<?php foreach ($t['cats'] as $k => $label): $n = $k === 'all' ? count($projects) : count(array_filter($projects, fn($x) => $x['cat'] === $k)); ?>
                    <sav-chip value="<?= $k ?>"<?= $k === 'all' ? ' selected' : '' ?>><?= e($label) ?> <small><?= $n ?></small></sav-chip>
<?php endforeach; ?>
                </sav-chip-group>
            </div>
            <div class="row" role="group" aria-label="<?= e($t['facts_label']) ?>">
                <sav-chip-group id="facts" multiple>
                    <sav-chip value="noaccount" variant="neutral"><span slot="prefix"><?= icon('nouser') ?></span><?= e($t['f_noaccount']) ?></sav-chip>
                    <sav-chip value="offline" variant="neutral"><span slot="prefix"><?= icon('offline') ?></span><?= e($t['f_offline']) ?></sav-chip>
                    <sav-chip value="android" variant="neutral"><span slot="prefix"><?= icon('phone') ?></span><?= e($t['f_android']) ?></sav-chip>
                </sav-chip-group>
            </div>
        </div>
    </form>
    <h2 class="sr"><?= e($t['nav_projects']) ?></h2>
    <p class="count" id="count" role="status" data-one="<?= e($t['count_one']) ?>" data-many="<?= e($t['count_many']) ?>"><?= e(sprintf($t['count_many'], count($projects))) ?></p>
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

<section class="big">
    <div class="wrap big-in">
        <div>
            <h2><?= e($t['big_title']) ?></h2>
            <p><?= e($t['big_text']) ?></p>
            <a class="more" href="<?= e($site['personal']) ?>"><?= e($t['big_link']) ?><?= icon('out') ?></a>
        </div>
        <ul class="big-list">
<?php foreach ($site['big'] as [$name, $url, $img, $text]): ?>
            <li><a href="<?= e($url) ?>"><img src="<?= asset("projects/$img.png") ?>" alt="" width="40" height="40" loading="lazy"><span><b><?= e($name) ?></b><?= e($text[$lang]) ?></span><?= icon('out') ?></a></li>
<?php endforeach; ?>
        </ul>
    </div>
</section>
