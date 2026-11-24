<section class="ahero">
    <div class="wrap">
        <h1><?= e($t['about_h1']) ?></h1>
        <p class="lede"><?= e($t['about_lede']) ?></p>
    </div>
</section>
<section class="wrap aname">
    <div class="plates<?= $site['flip'] ? '' : ' solo' ?>">
        <div class="plate-y" role="img" aria-label="<?= e($t['plate_alt']) ?>"><?= wordmark() ?></div>
<?php if ($site['flip']): ?>
        <button class="plate-b" id="flip" type="button" aria-pressed="false" data-on="<?= e($t['unflip']) ?>" data-off="<?= e($t['flip']) ?>"><?= icon('flip') ?><span><?= e($t['flip']) ?></span></button>
<?php endif; ?>
    </div>
    <div>
        <h2><?= e($t['name_h']) ?></h2>
        <p><?= e($t['name_p']) ?></p>
    </div>
</section>
<section class="wrap adiff">
    <h2><?= e($t['diff_h']) ?></h2>
    <p><?= e($t['diff_p']) ?></p>
    <div class="table">
        <table>
            <thead><tr><td></td><th scope="col"><?= e($t['diff'][0][1]) ?></th><th scope="col"><a href="<?= e($site['personal']) ?>"><?= e($t['diff'][0][2]) ?></a></th></tr></thead>
            <tbody>
<?php foreach (array_slice($t['diff'], 1) as [$h, $a, $b]): ?>
            <tr><th scope="row"><?= e($h) ?></th><td><?= e($a) ?></td><td><?= e($b) ?></td></tr>
<?php endforeach; ?>
            </tbody>
        </table>
    </div>
</section>
<section class="wrap arules">
    <h2><?= e($t['rules_h']) ?></h2>
    <div class="two">
<?php foreach ($t['rules'] as $i => [$h, $x]): ?>
        <sav-card><div class="rule"><?= icon($i ? 'lock' : 'code') ?><h3><?= e($h) ?></h3><p><?= e($x) ?></p></div></sav-card>
<?php endforeach; ?>
    </div>
</section>
<section class="wrap alevels">
    <h2><?= e($t['levels_h']) ?></h2>
    <p><?= e($t['levels_p']) ?></p>
    <ul class="levels">
<?php foreach ($t['levels'] as $n => $name): ?>
        <li><?= bars($n) ?><b><?= e($name) ?></b><span><?= e($t['level_text'][$n]) ?></span></li>
<?php endforeach; ?>
    </ul>
</section>
<section class="wrap ahelp">
    <h2><?= e($t['help_h']) ?></h2>
    <p><?= e($t['help_p']) ?></p>
    <div class="actions">
        <sav-button href="<?= e($site['contact']) ?>"><?= e($t['help_contact']) ?></sav-button>
        <sav-button appearance="outline" href="<?= e($site['repo']) ?>"><span slot="prefix"><?= icon('code') ?></span><?= e($t['help_code']) ?></sav-button>
    </div>
</section>
