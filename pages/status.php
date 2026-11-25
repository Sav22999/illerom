<?php
$list = services($projects, require ROOT . '/data/services.php', $site);
$groups = [];
foreach ($list as $s) $groups[$s['project']][] = $s;
?>
<section class="wrap sthead">
    <h1><?= e($t['st_h1']) ?></h1>
    <p class="lede"><?= e($t['st_lede']) ?></p>
</section>
<section class="wrap stbody" id="status" data-api="/api/status/" data-checking="<?= e($t['st_checking']) ?>" data-up="<?= e($t['st_up']) ?>" data-degraded="<?= e($t['st_degraded']) ?>" data-down="<?= e($t['st_down']) ?>" data-unknown="<?= e($t['st_unknown']) ?>"
         data-all="<?= e($t['st_all']) ?>" data-some="<?= e($t['st_some']) ?>" data-fail="<?= e($t['st_fail']) ?>" data-at="<?= e($t['st_at']) ?>" data-texts="<?= e(json_encode($t['st_texts'], JSON_UNESCAPED_UNICODE)) ?>">
    <div class="stsum" data-status="unknown">
        <i class="dot" aria-hidden="true"></i>
        <div role="status"><h2 id="st-title"><?= e($t['st_checking']) ?></h2><p id="st-time"></p></div>
        <sav-button id="st-refresh" appearance="outline" size="sm"><?= e($t['st_refresh']) ?></sav-button>
    </div>
    <div class="stgrid">
<?php foreach ($groups as $slug => $items): $p = $projects[$slug] ?? null; ?>
        <article class="stcard" id="<?= $slug ?>" data-project="<?= $slug ?>">
            <header>
                <img src="<?= $p ? asset("projects/$slug.png") : '/favicon.svg' ?>" alt="" width="32" height="32" loading="lazy">
                <h3><a href="<?= $p ? $base . "projects/$slug/" : $base ?>"><?= e($p['name'] ?? 'Illerom') ?></a></h3>
            </header>
            <ul>
<?php foreach ($items as $s): ?>
                <li data-id="<?= e($s['id']) ?>" data-status="unknown"<?= $s['type'] === 'web' ? ' data-url="' . e($s['url']) . '"' : '' ?>><i class="dot" aria-hidden="true"></i><span class="stn"><?= e($s[$lang]) ?></span><span class="std"></span><b class="stl"></b></li>
<?php endforeach; ?>
            </ul>
        </article>
<?php endforeach; ?>
    </div>
    <div class="stapi">
        <h2><?= e($t['st_api_h']) ?></h2>
        <p><?= e($t['st_api_p']) ?></p>
        <ul class="codes">
            <li><code>GET <?= e($site['url']) ?>/api/status/</code><span><?= e($t['st_api_all']) ?></span></li>
            <li><code>GET <?= e($site['url']) ?>/api/status/?project=chess</code><span><?= e($t['st_api_one']) ?></span></li>
        </ul>
        <pre><code>{
  "ok": true,
  "status": "up",
  "checkedAt": "2026-11-24T22:00:00Z",
  "ttl": 60,
  "projects": {
    "chess": {
      "name": "Chess",
      "url": "https://www.illerom.eu/chess/",
      "status": "up",
      "services": [
        { "id": "chess-db", "name": "Online matches", "type": "game", "status": "up", "detail": "Connected", "ms": 42 }
      ]
    }
  }
}</code></pre>
        <p class="note"><?= e($t['st_api_note']) ?></p>
    </div>
</section>
