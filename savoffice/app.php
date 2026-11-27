<?php
/**
 * SavOffice — the page of one app, included by index.php (which has already chosen $app and loaded the data): what it
 * is, what it can do, its screenshots on a phone, a tablet and a computer, the facts, and the apps it works with.
 */
if (!isset($app, $apps[$app])) return;
[$color, $desk, $phone, $eit, $een] = $apps[$app];
$P = $projects[$app];
$p = $P[$lang];
$keep = $q !== '' ? '?lang=' . $lang : '';
$open = $P['url'];
$src = $P['source'] === '' ? '' : (preg_match('#^https?://#', $P['source']) ? $P['source'] : 'https://github.com/Sav22999/illerom/tree/main/' . $P['source']);
$devices = array_filter([
    'm' => [$L('Telefono', 'Phone'), '', (int)$P['shots'], 562, 1000],
    't' => [$L('Tablet', 'Tablet'), 't', (int)($P['tablet'] ?? 0), 1180, 820],
    'd' => [$L('Computer', 'Computer'), 'd', (int)($P['desk'] ?? 0), 1440, 900],
], fn($d) => $d[2] > 0);
$order = array_keys($apps);
$i = array_search($app, $order, true);
$prev = $order[($i + count($order) - 1) % count($order)];
$next = $order[($i + 1) % count($order)];
?>
<div class="wrap detail" style="--c:<?= $color ?>">
    <nav class="crumbs" aria-label="<?= $L('Sei qui', 'You are here') ?>"><a href="/savoffice/<?= $keep ?>"><span class="sav">Sav</span><b>Office</b></a><span aria-hidden="true">/</span><span><?= $h($P['name']) ?></span></nav>

    <section class="dhero">
        <div>
            <div class="name big"><?= $ico($app, 72) ?><div><h1><?= $name($app) ?></h1><small><?= $h($p[0]) ?></small></div></div>
            <p class="lead"><?= $h(preg_replace(['/\s*(Fa parte di SavOffice|Part of SavOffice)[^.]*\.?\s*$/u', '/,? (e|and) (fa parte di|is part of) SavOffice/u', '/ (e|and) (fa parte di|is part of) SavOffice\./u'], ['', '', '.'], $p[1])) ?></p>
            <div class="ctas">
                <sav-button size="lg" href="<?= $h($open) ?>" style="--sav-color-primary:<?= $color ?>; --sav-color-on-primary:#fff"><?= $L('Apri', 'Open') ?> <?= $h($P['name']) ?></sav-button>
                <?php if ($src): ?><sav-button size="lg" appearance="outline" variant="neutral" href="<?= $h($src) ?>" icon="code"><?= $L('Codice sorgente', 'Source code') ?></sav-button><?php endif; ?>
            </div>
            <?= $invite($app) ?>
            <ul class="pills"><li><?= $h($strings['levels'][$P['level']]) ?></li><li><?= $L('Gratis', 'Free') ?></li><li>Open source</li><?php if ($P['offline']): ?><li><?= $L('Anche offline', 'Works offline') ?></li><?php endif; ?></ul>
        </div>
        <div class="shots">
            <?php if ($has($app, $desk)): ?><div class="desk"><sav-image zoom eager src="<?= $shot($app, $desk) ?>" alt="<?= $h($P['name'] . ($it ? ' su un computer' : ' on a computer')) ?>" ratio="1440:900"></sav-image></div>
            <?php else: ?><div class="desk noshot" aria-hidden="true"><?= $ico($app, 128) ?></div><?php endif; ?>
            <?php if ($has($app, $phone)): ?><div class="phone"><sav-image zoom eager src="<?= $shot($app, $phone) ?>" alt="<?= $h($P['name'] . ($it ? ' su un telefono' : ' on a phone')) ?>" ratio="562:1000"></sav-image></div><?php endif; ?>
        </div>
    </section>

    <div class="dbody">
        <div>
            <section aria-labelledby="feat-h">
                <h2 id="feat-h"><?= $L('Cosa puoi fare', 'What you can do') ?></h2>
                <ul class="feat big"><?php foreach ($p[2] as $f): ?><li><?= $h($f) ?></li><?php endforeach; ?></ul>
                <p class="edge"><b><?= $L('In più', 'The extra') ?></b><span><?= $L($eit, $een) ?></span></p>
            </section>

            <?php if ($devices): ?>
                <section class="gallery" aria-labelledby="shots-h">
                    <h2 id="shots-h"><?= $L('Com’è fatta', 'What it looks like') ?></h2>
                    <?php foreach ($devices as $k => [$label, $prefix, $n, $w, $hh]): ?>
                        <h3><?= $label ?></h3>
                        <ul class="strip-<?= $k ?>" tabindex="0" aria-label="<?= $h($P['name'] . ': ' . $label) ?>">
                            <?php for ($j = 1; $j <= $n; $j++): $img = $shot($app, "$prefix$j.jpg"); ?>
                                <?php $alt = $P['name'] . ' · ' . $label . ' ' . $j; ?>
                                <li><sav-image zoom src="<?= $img ?>" alt="<?= $h($alt) ?>" ratio="<?= $w ?>:<?= $hh ?>"></sav-image><noscript><img src="<?= $img ?>" alt="<?= $h($alt) ?>" width="<?= $w ?>" height="<?= $hh ?>" loading="lazy"></noscript></li>
                            <?php endfor; ?>
                        </ul>
                    <?php endforeach; ?>
                </section>
            <?php endif; ?>

            <?php if (!empty($works[$app])): ?>
                <section aria-labelledby="works-h">
                    <h2 id="works-h"><?= $L('Funziona con', 'Works with') ?></h2>
                    <ul class="flows">
                        <?php foreach ($works[$app] as [$o, $wit, $wen]): ?>
                            <li><a class="ic" href="/savoffice/<?= $o ?>/<?= $keep ?>"><?= $ico($o, 30) ?></a><span><b><?= $name($o) ?></b> — <?= $L($wit, $wen) ?></span></li>
                        <?php endforeach; ?>
                    </ul>
                </section>
            <?php endif; ?>
        </div>

        <aside class="facts" aria-labelledby="facts-h">
            <h2 id="facts-h"><?= $L('In breve', 'In short') ?></h2>
            <dl>
                <div><dt><?= $L('Stato', 'Status') ?></dt><dd><?= $h($strings['levels'][$P['level']]) ?><small><?= $h($strings['level_text'][$P['level']]) ?></small></dd></div>
                <div><dt><?= $L('Dove', 'Where') ?></dt><dd><?= $L('Nel browser, su computer, tablet e telefono; si installa come app', 'In the browser, on a computer, tablet or phone; it installs as an app') ?></dd></div>
                <div><dt>Account</dt><dd><?= $h($strings['account'][$P['account']]) ?></dd></div>
                <div><dt>Offline</dt><dd><?= $h($P['offline'] ? $strings['yes_offline'] : $strings['no_offline']) ?></dd></div>
                <div><dt><?= $L('Lingue', 'Languages') ?></dt><dd><?= $h(ucfirst(implode(', ', array_map(fn($l) => $strings['lang_names'][$l], $P['langs'])))) ?></dd></div>
                <div><dt><?= $L('File', 'Files') ?></dt><dd><div class="fmt"><?php foreach ($files[$app] as $f): ?><sav-tag size="sm"<?= str_starts_with($f, '.sav') ? ' variant="primary"' : '' ?>><?= $h($f) ?></sav-tag><?php endforeach; ?></div></dd></div>
                <div><dt>Privacy</dt><dd><a href="<?= $h($open . $P['privacy']) ?>"><?= $L('Informativa dell’app', 'Privacy notice of the app') ?></a></dd></div>
                <div><dt><?= $L('Servizi', 'Services') ?></dt><dd><a href="https://www.illerom.eu/<?= $lang ?>/status/#<?= $app ?>"><?= $L('Vedi lo stato', 'See the status') ?></a></dd></div>
                <div><dt><?= $L('Codice', 'Code') ?></dt><dd><?php if ($src): ?><a href="<?= $h($src) ?>">Open source</a><?php else: ?>Open source<?php endif; ?></dd></div>
            </dl>
        </aside>
    </div>

    <nav class="pager" aria-label="<?= $L('Le altre app', 'The other apps') ?>">
        <a href="/savoffice/<?= $prev ?>/<?= $keep ?>"><span>← <?= $L('Precedente', 'Previous') ?></span><?= $ico($prev, 32) ?><b><?= $h($projects[$prev]['name']) ?></b></a>
        <a href="/savoffice/<?= $keep ?>#apps" class="all"><?= $L('Tutte le app', 'All the apps') ?></a>
        <a href="/savoffice/<?= $next ?>/<?= $keep ?>" class="next"><span><?= $L('Successiva', 'Next') ?> →</span><?= $ico($next, 32) ?><b><?= $h($projects[$next]['name']) ?></b></a>
    </nav>
</div>
