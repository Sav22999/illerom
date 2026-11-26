<?php /** Illerom Bars: the typeface born from the mark. Try it, see the alphabet, where it comes from, take it. */
$tf = typeface();
$letters = array_values(array_filter(array_keys($tf['glyphs']), fn($k) => strlen($k) === 1));
// letters drawn the same way, found from the bars themselves
$twins = [];
foreach ($letters as $c) $twins[json_encode($tf['glyphs'][$c])][] = $c;
$twins = array_values(array_filter($twins, fn($g) => count($g) > 1));
$signs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ',', ':', ';', '-', '’', '!', '?', '/', 'à', 'è', 'é', 'ì', 'ò', 'ù'];
$css = "@font-face {\n  font-family: \"Illerom Bars\";\n  src: url(illerom-bars.woff) format(\"woff\");\n  font-display: swap;\n}\n@font-face {\n  font-family: \"Illerom Bars Mono\";\n  src: url(illerom-bars-mono.woff) format(\"woff\");\n  font-display: swap;\n}\n.crooked {\n  font-family: \"Illerom Bars\";\n}\n/* every letter in a cell of its own */\n.crooked-mono {\n  font-family: \"Illerom Bars Mono\";\n}\n/* LEAN: 0 upright, 100 leaned (default) */\n.upright {\n  font-variation-settings: \"LEAN\" 0;\n}";
?>
<section class="ahero thero">
    <div class="wrap">
        <h1><?= preg_replace('/\*(.+?)\*/u', '<span class="askew">$1</span>', e($t['tf_h1'])) ?></h1>
        <p class="lede"><?= e($t['tf_lede']) ?></p>
    </div>
</section>

<section class="wrap ttry" aria-labelledby="try-h">
    <h2 id="try-h" class="sr"><?= e($t['tf_try_h']) ?></h2>
    <div class="try">
        <div class="try-note note-y">
            <p class="tf-text" id="preview" aria-label="<?= e($t['tf_preview']) ?>"
               aria-live="polite"><?= e($t['tf_sample']) ?></p>
        </div>
        <div class="try-ctl">
            <sav-textarea id="tt" label="<?= e($t['tf_try_label']) ?>" value="<?= e($t['tf_sample']) ?>" rows="2"
                          resize="auto" maxlength="160" spellcheck="false" autocomplete="off"></sav-textarea>
            <sav-range id="lean" label="<?= e($t['tf_lean']) ?>" min="0" max="100" value="100"
                       labels="<?= e($t['tf_lean_labels']) ?>"></sav-range>
            <div class="try-row">
                <sav-switch id="mono" help="<?= e($t['tf_mono_help']) ?>"><?= e($t['tf_mono']) ?></sav-switch>
                <sav-button id="replay" class="replay" appearance="outline" size="sm"><?= e($t['tf_play']) ?></sav-button>
            </div>
        </div>
    </div>
</section>

<section class="wrap talpha" aria-labelledby="alpha-h">
    <h2 id="alpha-h"><?= e($t['tf_alpha_h']) ?></h2>
    <p class="note"><?= e($t['tf_alpha_p']) ?></p>
    <ul class="alpha">
        <?php foreach (array_merge($letters, $signs) as $c): $wide = !in_array($c, $letters, true); ?>
            <li>
                <button class="ch<?= $wide ? ' sign' : '' ?>" type="button" aria-pressed="false">
                    <span class="tf-text ch-g" aria-hidden="true"><?= e($c) ?></span>
                    <span class="ch-l"><?= e($wide ? $c : mb_strtoupper($c) . ' ' . $c) ?></span>
                </button>
            </li>
        <?php endforeach; ?>
    </ul>
</section>

<section class="wrap trules" aria-labelledby="rules-h">
    <h2 id="rules-h"><?= e($t['tf_rules_h']) ?></h2>
    <ol class="steps">
        <?php foreach ($t['tf_rules'] as $i => [$h, $x]): ?>
            <li>
                <sav-card>
                    <div class="step">
                        <span class="step-g" aria-hidden="true"><?= match ($i) {
                                0 => '<svg class="glyph" viewBox="-4 -4 85 108"><path class="grid" d="M0 0v100M15 0v100M31 0v100M46 0v100M62 0v100M77 0v100M0 0h77M0 50h77M0 100h77"/><rect x="0" y="0" width="15" height="100"/><rect x="31" y="50" width="15" height="50"/></svg>',
                                1 => glyph_svg($tf['glyphs']['r']) . glyph_svg($tf['glyphs']['e']),
                                default => glyph_svg($tf['glyphs']['m']),
                            } ?></span>
                        <h3><?= e($h) ?></h3>
                        <p><?= e($x) ?></p>
                    </div>
                </sav-card>
            </li>
        <?php endforeach; ?>
    </ol>
</section>

<section class="wrap ttwins" aria-labelledby="twins-h">
    <h2 id="twins-h"><?= e($t['tf_twins_h']) ?></h2>
    <p><?= e($t['tf_twins_p']) ?></p>
    <ul class="twins">
        <?php foreach ($twins as $group): ?>
            <li>
                <sav-card>
                    <div class="twin">
                        <?= glyph_svg($tf['glyphs'][$group[0]]) ?>
                        <b><?= e(implode(' ', $group)) ?></b>
                    </div>
                </sav-card>
            </li>
        <?php endforeach; ?>
    </ul>
</section>

<section class="wrap tget" aria-labelledby="get-h">
    <div>
        <h2 id="get-h"><?= e($t['tf_get_h']) ?></h2>
        <p><?= e($t['tf_get_p']) ?></p>
        <div class="actions">
            <sav-button href="<?= asset('fonts/illerom-bars.zip') ?>" download="illerom-bars.zip"><?= e($t['tf_zip']) ?></sav-button>
        </div>
        <?php foreach (['illerom-bars' => 'Illerom Bars', 'illerom-bars-mono' => 'Illerom Bars Mono'] as $base => $family): ?>
            <h3 class="formats-h"><?= e($family) ?></h3>
            <ul class="formats">
                <?php foreach ([["$base.otf", 'OTF', 'tf_otf'], ["$base-upright.otf", 'OTF', 'tf_otf_up'], ["$base.ttf", 'TTF', 'tf_ttf'], ["$base.woff", 'WOFF', 'tf_woff']] as [$f, $kind, $k]): ?>
                    <li><sav-button appearance="outline" size="sm" href="<?= asset("fonts/$f") ?>" download="<?= $f ?>"><b><?= $kind ?></b>
                            <?= e($t[$k]) ?><span slot="suffix" class="kb"><?= round(filesize(ROOT . "/assets/fonts/$f") / 1024, 1) ?> KB</span></sav-button></li>
                <?php endforeach; ?>
            </ul>
        <?php endforeach; ?>
    </div>
    <div class="tget-code">
        <sav-code-block id="css" language="css" filename="style.css" no-copy><?= e($css) ?></sav-code-block>
        <sav-copy-button from="css" size="sm" copy-label="<?= e($t['tf_copy']) ?>"
                         success-label="<?= e($t['tf_copied']) ?>"><?= e($t['tf_copy']) ?></sav-copy-button>
    </div>
</section>
