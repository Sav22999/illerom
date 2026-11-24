<?php /** One project of the list. Needs $s (slug) and $p (project). */
$url = app_url($s, $p);
$words = mb_strtolower(implode(' ', [$p['name'], $t['cats'][$p['cat']], $t['cat_one'][$p['cat']], implode(' ', $p['it'][2]), implode(' ', $p['en'][2]), $p['it'][0], $p['en'][0], $p['it'][1], $p['en'][1]]));
$facts = array_filter(['noaccount' => in_array($p['account'], ['none', 'optional'], true), 'offline' => $p['offline'], 'android' => $p['play'] !== '']);
?>
<li class="item" data-cat="<?= $p['cat'] ?>" data-facts="<?= implode(' ', array_keys($facts)) ?>" data-name="<?= e(mb_strtolower($p['name'])) ?>" data-words="<?= e($words) ?>">
    <sav-card class="pcard" interactive>
        <div class="pc">
            <span class="picon cat-<?= $p['cat'] ?>">
<?php if (is_file(ROOT . "/assets/projects/$s.png")): ?>
                <img src="<?= asset("projects/$s.png") ?>" alt="" width="64" height="64" loading="lazy" style="view-transition-name:p-<?= $s ?>">
<?php else: ?>
                <span class="pbars"><?= bars(1) ?></span>
<?php endif; ?>
            </span>
            <span class="plevel" title="<?= e($t['level_text'][$p['level']]) ?>"><?= bars($p['level']) ?><?= e($t['levels'][$p['level']]) ?></span>
            <h3><a class="stretch" href="<?= $base ?>projects/<?= $s ?>/"><?= e($p['name']) ?></a></h3>
            <p><?= e($p[$lang][0]) ?></p>
            <div class="pfoot">
                <ul class="pfacts">
<?php foreach (array_keys($facts) as $f): ?>
                    <li><?= e($t['c_' . $f]) ?></li>
<?php endforeach; ?>
                </ul>
<?php if ($url !== ''): ?>
                <sav-button class="go" size="sm" appearance="soft" href="<?= e($url) ?>" label="<?= e(($p['cat'] === 'games' ? $t['play'] : $t['open']) . ': ' . $p['name']) ?>"><?= e($p['cat'] === 'games' ? $t['play'] : $t['open']) ?></sav-button>
<?php else: ?>
                <span class="soon"><?= e($t['soon']) ?></span>
<?php endif; ?>
            </div>
        </div>
    </sav-card>
</li>
