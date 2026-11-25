</main>
<footer class="foot">
    <div class="wrap foot-in">
        <p class="foot-who"><?= bars() ?><span><?= e($t['foot']) ?> <a href="<?= e($site['personal']) ?>">Saverio Morelli</a></span>
        </p>
        <ul class="foot-links">
            <li><a href="<?= $base ?>about/"><?= e($t['nav_about']) ?></a></li>
            <li><a href="<?= $base ?>status/"><?= e($t['st_title']) ?></a></li>
            <li><a href="<?= $base ?>privacy/"><?= e($t['privacy_title']) ?></a></li>
            <li><a href="<?= e($site['repo']) ?>"><?= e($t['foot_code']) ?></a></li>
            <li><a href="<?= e($site['contact']) ?>"><?= e($t['foot_contact']) ?></a></li>
        </ul>
    </div>
</footer>
</body>
</html>
