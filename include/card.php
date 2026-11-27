<?php /** One project of the list (home, related projects). Needs $s (slug) and $p (project). */
$url = app_url($s, $p);
$words = mb_strtolower(implode(' ', [$p['name'], $t['cats'][$p['cat']], $t['cat_one'][$p['cat']], implode(' ', $p['it'][2]), implode(' ', $p['en'][2]), $p['it'][0], $p['en'][0], $p['it'][1], $p['en'][1]]));
$facts = array_filter(['noaccount' => in_array($p['account'], ['none', 'optional'], true), 'offline' => $p['offline'], 'android' => $p['play'] !== '']);
$factIcon = ['noaccount' => 'nouser', 'offline' => 'offline', 'android' => 'phone'];
?>
<li class="item" data-cat="<?= $p['cat'] ?>" data-facts="<?= implode(' ', array_keys($facts)) ?>"
    data-name="<?= e(mb_strtolower($p['name'])) ?>" data-words="<?= e($words) ?>">
    <sav-card class="pj" interactive>
        <div class="pj-in cat-<?= $p['cat'] ?>">
            <div class="pj-top">
                <span class="pj-icon">
                    <?php if (is_file(ROOT . "/assets/projects/$s.png")): ?>
                        <img src="<?= asset("projects/$s.png") ?>" alt="" width="72" height="72" loading="lazy" style="view-transition-name:p-<?= $s ?>">
                    <?php else: ?>
                        <span class="pbars"><?= bars(1) ?></span>
                    <?php endif; ?>
                </span>
                <span class="plevel" title="<?= e($t['level_text'][$p['level']]) ?>"><?= bars($p['level']) ?><?= e($t['levels'][$p['level']]) ?></span>
            </div>
            <div class="pj-body">
                <p class="pj-kind"><?= e(empty($p['apps']) ? $t['cat_one'][$p['cat']] : 'Suite') ?></p>
                <h3><a href="<?= e($p['page'] ?? $base . "projects/$s/") ?>"><?= pname($p['name']) ?></a></h3>
                <p class="pj-tag"><?= e($p[$lang][0]) ?></p>
                <?php if (!empty($p['apps'])): ?>
                    <ul class="pj-apps" aria-label="<?= e($p['name']) ?>">
                        <?php foreach ($p['apps'] as $a): ?><li><img src="/<?= $a ?>/icons/favicon.svg" alt="" width="26" height="26" loading="lazy" title="<?= e('Sav' . ucfirst(substr($a, 3))) ?>"></li><?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
            <div class="pj-foot">
                <ul class="pj-facts">
                    <?php foreach (array_keys($facts) as $f): ?>
                        <li title="<?= e($t['f_' . $f]) ?>"><?= icon($factIcon[$f]) ?><span><?= e($t['c_' . $f]) ?></span></li>
                    <?php endforeach; ?>
                </ul>
                <?php if ($url !== ''): ?>
                    <sav-button class="go" size="sm" appearance="soft" href="<?= e($url) ?>"
                                label="<?= e(($p['cat'] === 'games' ? $t['play'] : $t['open']) . ': ' . $p['name']) ?>"><?= e($p['cat'] === 'games' ? $t['play'] : $t['open']) ?></sav-button>
                <?php else: ?>
                    <span class="soon"><?= e($t['soon']) ?></span>
                <?php endif; ?>
            </div>
        </div>
    </sav-card>
</li>
