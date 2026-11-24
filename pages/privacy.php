<section class="wrap prose">
    <h1><?= e($t['privacy_h1']) ?></h1>
<?php foreach ($t['privacy'] as [$h, $x]): ?>
    <h2><?= e($h) ?></h2>
    <p><?= e($x) ?></p>
<?php endforeach; ?>
    <p><a href="<?= e($site['contact']) ?>"><?= e($t['help_contact']) ?></a></p>
    <p class="note"><?= e($t['updated']) ?></p>
</section>
