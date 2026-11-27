<?php /** The common terms of use of the portal, its projects and SavOffice (data/strings.php: terms). */ ?>
<section class="wrap prose">
    <h1><?= e($t['terms_h1']) ?></h1>
    <?php foreach ($t['terms'] as [$h, $x]): ?>
        <h2><?= e($h) ?></h2>
        <p><?= e($x) ?></p>
    <?php endforeach; ?>
    <p><a href="<?= e($site['contact']) ?>"><?= e($t['help_contact']) ?></a> · <a href="<?= $base ?>privacy/"><?= e($t['privacy_title']) ?></a></p>
    <p class="note"><?= e($t['terms_updated']) ?></p>
</section>
