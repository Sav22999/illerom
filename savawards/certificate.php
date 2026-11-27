<?php
/**
 * SavAwards — a certificate, public: c/<CODE>/<product> (rewritten by .htaccess) or certificate.php?c=<CODE>.
 * Anyone can open it and check that it is real and still valid; a revoked certificate says so, with when and why.
 * &format=svg downloads the drawing. Without a code: a form to verify one.
 */

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/catalog.php';
require __DIR__ . '/lib/certsvg.php';

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");

$raw = (string)($_GET['c'] ?? '');
$cert = null;
try {
    if ($raw !== '' && credentials()) $cert = cert_find($raw);
} catch (Throwable $e) {
    error_log('SavAwards certificate: ' . $e->getMessage());
}

if ($cert && ($_GET['format'] ?? '') === 'svg') {
    header('Content-Type: image/svg+xml; charset=utf-8');
    header('Content-Disposition: attachment; filename="savawards-' . cert_display($cert['code']) . '.svg"');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . certificate_svg($cert);
    exit;
}

$l = lang();
$it = $l === 'it';
$base = app_base_path();
$T = $it ? [
    'title' => 'Certificato', 'valid' => 'Certificato valido', 'validText' => 'Questo certificato è stato emesso da SavAwards ed è valido. Verificato il {date}.',
    'revoked' => 'Certificato revocato', 'revokedText' => 'Revocato il {date}. Motivo: {reason}',
    'none' => 'Certificato non trovato', 'noneText' => 'Nessun certificato corrisponde a questo codice. Controlla di averlo scritto bene.',
    'verify' => 'Verifica un certificato', 'verifyText' => 'Scrivi il codice identificativo che trovi sul certificato (per esempio SA-2026-K7M3-Q9TX).',
    'code' => 'Codice del certificato', 'check' => 'Verifica', 'print' => 'Stampa o salva in PDF', 'svg' => 'Scarica SVG', 'copy' => 'Copia il link', 'copied' => 'Link copiato',
    'product' => 'Scheda del prodotto', 'edition' => 'Edizione {year}', 'embed' => 'Badge per il tuo sito', 'embedText' => 'Incolla questo codice nel sito del prodotto: il badge porta a questa pagina, dove chiunque può verificarlo.',
    'disclaimer' => 'Progetto sviluppato da Saverio Morelli senza alcuna affiliazione, sponsorizzazione o compenso da parte delle aziende recensite. SavAwards è un riconoscimento indipendente basato sull’analisi manuale di SavAwards: non è sponsorizzato, affiliato o approvato dal titolare del prodotto e non ha valore legale. I marchi appartengono ai rispettivi proprietari.',
    'home' => 'Vai a SavAwards', 'issued' => 'Emesso il', 'id' => 'Codice', 'award' => 'Riconoscimento', 'place' => 'Posizione', 'jury' => 'Voto tecnico · by SavAwards', 'public' => 'Voto della community',
] : [
    'title' => 'Certificate', 'valid' => 'Valid certificate', 'validText' => 'This certificate was issued by SavAwards and is valid. Checked on {date}.',
    'revoked' => 'Revoked certificate', 'revokedText' => 'Revoked on {date}. Reason: {reason}',
    'none' => 'Certificate not found', 'noneText' => 'No certificate matches this code. Check that it is written correctly.',
    'verify' => 'Verify a certificate', 'verifyText' => 'Enter the identifier printed on the certificate (for example SA-2026-K7M3-Q9TX).',
    'code' => 'Certificate code', 'check' => 'Verify', 'print' => 'Print or save as PDF', 'svg' => 'Download SVG', 'copy' => 'Copy the link', 'copied' => 'Link copied',
    'product' => 'Product page', 'edition' => '{year} edition', 'embed' => 'Badge for your website', 'embedText' => 'Paste this code on the product’s website: the badge leads to this page, where anyone can verify it.',
    'disclaimer' => 'A project developed by Saverio Morelli, with no affiliation, sponsorship or payment from the companies it reviews. SavAwards is an independent recognition based on the manual analysis of SavAwards: it is not sponsored by, affiliated with or endorsed by the product’s owner and has no legal value. Trademarks belong to their respective owners.',
    'home' => 'Go to SavAwards', 'issued' => 'Issued on', 'id' => 'Code', 'award' => 'Award', 'place' => 'Place', 'jury' => 'Technical vote · by SavAwards', 'public' => 'Community vote',
];
$fmt = fn(string $utc) => $it ? date('d/m/Y', strtotime($utc . ' UTC')) : date('j M Y', strtotime($utc . ' UTC'));
if ($raw !== '' && !$cert) http_response_code(404);
$code = $cert ? cert_display($cert['code']) : '';
$url = $cert ? cert_url($cert) : '';
$badge = $cert ? app_url() . 'badge/' . $code . '.svg' : '';
$embed = $cert ? '<a href="' . $url . '"><img src="' . $badge . '" width="300" height="84" alt="SavAwards ' . (int)$cert['year'] . ' · ' . place_name((int)$cert['place'], 'en') . ' · ' . ($cert['award_en'] ?: $cert['award_it']) . (($cert['kind'] ?? '') === 'public' ? ' · Community vote' : ' · Technical vote') . '"></a>' : '';
$pageTitle = $cert ? $cert['product_name'] . ' · ' . pick($cert['award_it'], $cert['award_en']) . ' · SavAwards ' . $cert['year'] : ($raw !== '' ? $T['none'] : $T['verify']) . ' · SavAwards';
?><!doctype html>
<html lang="<?= e($l) ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($pageTitle) ?></title>
    <?php if ($cert): ?>
        <meta name="description" content="<?= e(place_name((int)$cert['place'], $l) . ' · ' . pick($cert['award_it'], $cert['award_en']) . ' · ' . $code) ?>">
        <meta property="og:title" content="<?= e($pageTitle) ?>">
        <link rel="canonical" href="<?= e($url) ?>">
    <?php else: ?>
        <meta name="robots" content="noindex">
    <?php endif ?>
    <link rel="icon" href="<?= e($base) ?>icons/favicon.svg" type="image/svg+xml">
    <style>
        @page { size: A4 landscape; margin: 0; }
        * { box-sizing: border-box; }
        :root { color-scheme: light; }
        body { margin: 0; min-height: 100vh; background: #EEF1FA; color: #121833; font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        a { color: #2347C9; }
        .wrap { max-width: 1120px; margin: 0 auto; padding: 18px 16px 48px; display: grid; gap: 18px; }
        header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        header a.brand { display: inline-flex; align-items: center; gap: 10px; color: #121833; text-decoration: none; font-weight: 800; font-size: 1.2rem; letter-spacing: -.03em; }
        header a.brand b { color: #2347C9; }
        header a.brand img { transform: rotate(-4deg); }
        header .grow { flex: 1; }
        .status { display: flex; gap: 14px; align-items: flex-start; padding: 16px 18px; border-radius: 18px; background: #fff; border: 2px solid #DCE3F7; transform: rotate(-.4deg); }
        .status.ok { border-color: #8FD3B3; background: #F0FBF5; }
        .status.ok svg { stroke: #118557; }
        .status.bad { border-color: #F0A3A9; background: #FFF3F4; }
        .status.bad svg { stroke: #C0262D; }
        .status svg { flex: none; }
        .status h1 { margin: 0 0 2px; font-size: 1.2rem; }
        .status p { margin: 0; color: #4A5370; }
        .sheet { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 18px 50px rgb(20 40 122 / .18); }
        .sheet svg { display: block; width: 100%; height: auto; }
        .tools { display: flex; flex-wrap: wrap; gap: 10px; }
        .tools button, .tools a.btn { min-height: 44px; padding: 10px 16px; border: 2px solid #2347C9; border-radius: 12px; background: #2347C9; color: #fff; font-weight: 700; font-size: .95rem; font-family: inherit; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; transform: rotate(-1deg); transition: transform .15s; }
        .tools button:hover, .tools a.btn:hover { transform: rotate(0deg) translateY(-1px); }
        .tools .plain { background: #fff; color: #2347C9; }
        .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
        .facts div { background: #fff; border: 1px solid #DCE3F7; border-radius: 14px; padding: 12px 14px; }
        .facts small { display: block; color: #5F6880; font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; }
        .facts strong { font-size: 1.02rem; word-break: break-word; }
        .card { background: #fff; border: 1px solid #DCE3F7; border-radius: 18px; padding: 16px 18px; }
        .card h2 { margin: 0 0 6px; font-size: 1.05rem; }
        textarea { width: 100%; min-height: 92px; border-radius: 10px; border: 1px solid #DCE3F7; background: #F6F7FB; color: #121833; font: 13px/1.45 ui-monospace, Menlo, Consolas, monospace; padding: 10px; resize: vertical; }
        .badge-prev { margin: 10px 0; }
        form.verify { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        form.verify input { flex: 1 1 240px; min-height: 46px; padding: 10px 14px; border-radius: 12px; border: 2px solid #DCE3F7; background: #fff; color: #121833; font: 600 1.05rem ui-monospace, Menlo, Consolas, monospace; text-transform: uppercase; }
        form.verify input:focus { outline: 3px solid #9DB2F5; border-color: #2347C9; }
        .disc { font-size: .85rem; color: #5F6880; }
        @media print {
            body { background: none; }
            .wrap { padding: 0; max-width: none; display: block; }
            header, .status, .tools, .facts, .card, .disc { display: none !important; }
            .sheet { box-shadow: none; border-radius: 0; width: 297mm; height: 210mm; }
            .sheet svg { width: 297mm; height: 210mm; }
        }
    </style>
</head>
<body>
<div class="wrap">
    <header>
        <a class="brand" href="<?= e($base) ?>"><img src="<?= e($base) ?>icons/favicon.svg" width="34" height="34" alt=""> <span>Sav<b>Awards</b></span></a>
        <span class="grow"></span>
    </header>
    <?php if ($cert): $revoked = !empty($cert['revoked_at']); ?>
        <section class="status <?= $revoked ? 'bad' : 'ok' ?>" role="status">
            <?php if ($revoked): ?>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>
                <div><h1><?= e($T['revoked']) ?></h1><p><?= e(strtr($T['revokedText'], ['{date}' => $fmt($cert['revoked_at']), '{reason}' => (string)$cert['revoke_reason']])) ?></p></div>
            <?php else: ?>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                <div><h1><?= e($T['valid']) ?></h1><p><?= e(strtr($T['validText'], ['{date}' => $fmt(now_utc())])) ?></p></div>
            <?php endif ?>
        </section>
        <div class="sheet"><?= certificate_svg($cert) ?></div>
        <div class="facts">
            <div><small><?= e($T['id']) ?></small><strong><?= e($code) ?></strong></div>
            <div><small><?= e($T['award']) ?></small><strong><?= e(pick($cert['award_it'], $cert['award_en'])) ?></strong><br><span style="font-size:.85rem;color:<?= ($cert['kind'] ?? '') === 'public' ? '#0B7F62' : '#2347C9' ?>"><?= e($T[($cert['kind'] ?? '') === 'public' ? 'public' : 'jury']) ?></span></div>
            <div><small><?= e($T['place']) ?></small><strong><?= e(place_name((int)$cert['place'], $l)) ?> · <?= (int)$cert['year'] ?></strong></div>
            <div><small><?= e($T['issued']) ?></small><strong><?= e($fmt($cert['issued_at'])) ?></strong></div>
        </div>
        <div class="tools">
            <button type="button" onclick="print()"><?= e($T['print']) ?></button>
            <a class="btn plain" href="<?= e($base) ?>certificate.php?c=<?= e(rawurlencode($code)) ?>&amp;format=svg"><?= e($T['svg']) ?></a>
            <button type="button" class="plain" id="copy" data-url="<?= e($url) ?>" data-done="<?= e($T['copied']) ?>"><?= e($T['copy']) ?></button>
            <a class="btn plain" href="<?= e($base) ?>#/p/<?= e(rawurlencode($cert['product_slug'])) ?>"><?= e($T['product']) ?></a>
            <a class="btn plain" href="<?= e($base) ?>#/awards/<?= (int)$cert['year'] ?>"><?= e(strtr($T['edition'], ['{year}' => $cert['year']])) ?></a>
        </div>
        <?php if (!$revoked): ?>
            <section class="card">
                <h2><?= e($T['embed']) ?></h2>
                <p><?= e($T['embedText']) ?></p>
                <div class="badge-prev"><img src="<?= e($base) ?>badge.php?c=<?= e(rawurlencode($code)) ?>" width="300" height="84" alt=""></div>
                <textarea readonly onclick="this.select()" aria-label="<?= e($T['embed']) ?>"><?= e($embed) ?></textarea>
            </section>
        <?php endif ?>
    <?php else: ?>
        <?php if ($raw !== ''): ?>
            <section class="status bad" role="alert">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>
                <div><h1><?= e($T['none']) ?></h1><p><?= e($T['noneText']) ?></p></div>
            </section>
        <?php endif ?>
        <section class="card">
            <h2><?= e($T['verify']) ?></h2>
            <p><?= e($T['verifyText']) ?></p>
            <form class="verify" method="get" action="<?= e($base) ?>certificate.php">
                <input name="c" value="<?= e($raw) ?>" aria-label="<?= e($T['code']) ?>" placeholder="SA-2026-XXXX-XXXX" autocomplete="off" spellcheck="false" required>
                <input type="hidden" name="lang" value="<?= e($l) ?>">
                <div class="tools"><button type="submit"><?= e($T['check']) ?></button></div>
            </form>
        </section>
    <?php endif ?>
    <p class="disc"><?= e($T['disclaimer']) ?> <a href="<?= e($base) ?>#/independence"><?= $it ? 'Indipendenza e note legali' : 'Independence and legal notes' ?></a></p>
</div>
<script>
    document.getElementById('copy')?.addEventListener('click', (e) => {
        const b = e.currentTarget;
        navigator.clipboard?.writeText(b.dataset.url).then(() => { b.textContent = b.dataset.done; });
    });
</script>
</body>
</html>
