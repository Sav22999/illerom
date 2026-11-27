<?php
// how many projects (the apps of SavOffice one by one) are at each level
$perLevel = array_count_values(array_map(fn($p) => (int)$p['level'], $projects));
$cnt = fn(int $n): string => $n === 1 ? $t['count_one'] : sprintf($t['count_many'], $n);
?>
<section class="hero">
    <div class="wrap hero-in">
        <div class="hero-text">
            <p class="kicker"><?= bars() ?><?= e($t['about_title']) ?></p>
            <h1><?= e($t['about_h1']) ?></h1>
            <p class="lede"><?= e($t['about_lede']) ?></p>
            <div class="hero-go">
                <sav-button href="<?= $base ?>#projects" variant="primary" size="lg"><?= e($t['hero_go']) ?></sav-button>
                <sav-button href="<?= e($site['contact']) ?>" appearance="outline" size="lg"><?= e($t['help_contact']) ?></sav-button>
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
</section>

<section class="wrap ab-name" aria-labelledby="name-h">
    <div class="ab-name-text">
        <p class="kicker"><?= bars() ?><?= e($t['name_kicker']) ?></p>
        <h2 id="name-h"><?= e($t['name_h']) ?></h2>
        <p><?= e($t['name_p']) ?></p>
        <p class="rev" aria-label="<?= e($t['name_rev']) ?>"><span>morelli</span><?= icon('flip') ?><span>illerom</span></p>
    </div>
    <ul class="letters" aria-label="<?= e($t['letters_label']) ?>">
        <?php foreach ($t['strokes'] as $i => [$ch, $how]): $m = $ch === 'm'; ?>
            <li class="lt<?= $m ? ' lt-m' : '' ?>" style="--i:<?= $i ?>"><span class="tf-text" aria-hidden="true"><?= $ch ?></span><b><?= $ch ?></b><small><?= e($how) ?><?= $m ? ' · ' . e($t['mark_word']) : '' ?></small></li>
        <?php endforeach; ?>
    </ul>
</section>

<section class="wrap ab-sites" aria-labelledby="diff-h">
    <p class="kicker"><?= bars() ?><?= e($t['diff_kicker']) ?></p>
    <h2 id="diff-h"><?= e($t['diff_h']) ?></h2>
    <p class="ab-sub"><?= e($t['diff_p']) ?></p>
    <div class="sites">
        <?php foreach ([1, 2] as $col): ?>
            <article class="site site-<?= $col ?>">
                <h3><?php if ($col === 2): ?><a href="<?= e($site['personal']) ?>"><?= e($t['diff'][0][2]) ?><?= icon('out') ?></a><?php else: ?><?= mark() ?><?= e($t['diff'][0][1]) ?><?php endif; ?></h3>
                <dl>
                    <?php foreach (array_slice($t['diff'], 1) as $row): ?>
                        <div><dt><?= e($row[0]) ?></dt><dd><?= e($row[$col]) ?></dd></div>
                    <?php endforeach; ?>
                </dl>
            </article>
        <?php endforeach; ?>
    </div>
</section>

<section class="why ab-rules" aria-labelledby="rules-h">
    <div class="wrap">
        <p class="kicker"><?= bars() ?><?= e($t['rules_kicker']) ?></p>
        <h2 id="rules-h"><?= e($t['rules_h']) ?></h2>
        <ul class="why-notes two">
            <?php foreach ($t['rules'] as $i => [$h, $x]): ?>
                <li class="wn wn-<?= $i ? 3 : 0 ?>">
                    <span class="wn-ic"><?= icon($i ? 'lock' : 'code') ?></span>
                    <h3><?= e($h) ?></h3>
                    <p><?= e($x) ?></p>
                </li>
            <?php endforeach; ?>
        </ul>
    </div>
</section>

<section class="wrap ab-levels" aria-labelledby="levels-h">
    <p class="kicker"><?= bars() ?><?= e($t['levels_kicker']) ?></p>
    <h2 id="levels-h"><?= e($t['levels_h']) ?></h2>
    <p class="ab-sub"><?= e($t['levels_p']) ?></p>
    <ol class="steps">
        <?php foreach ([1, 2, 3] as $n): ?>
            <li class="step step-<?= $n ?>">
                <span class="step-bars"><?= bars($n) ?></span>
                <h3><?= e($t['levels'][$n]) ?></h3>
                <p><?= e($t['level_text'][$n]) ?></p>
                <small><?= e($cnt($perLevel[$n] ?? 0)) ?></small>
            </li>
        <?php endforeach; ?>
    </ol>
</section>

<section class="homes ab-help" aria-labelledby="help-h">
    <div class="wrap ab-help-in">
        <div>
            <p class="kicker"><?= bars() ?><?= e($t['help_kicker']) ?></p>
            <h2 id="help-h"><?= e($t['help_h']) ?></h2>
            <p><?= e($t['help_p']) ?></p>
        </div>
        <div class="hero-go">
            <sav-button href="<?= e($site['contact']) ?>" variant="primary"><?= e($t['help_contact']) ?></sav-button>
            <sav-button appearance="outline" href="<?= e($site['repo']) ?>"><span slot="prefix"><?= icon('code') ?></span><?= e($t['help_code']) ?></sav-button>
        </div>
    </div>
</section>
