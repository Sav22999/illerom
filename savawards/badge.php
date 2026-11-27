<?php
/** SavAwards — the badge of a certificate: badge/<CODE>.svg (rewritten by .htaccess) or badge.php?c=<CODE>. */

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/catalog.php';
require __DIR__ . '/lib/certsvg.php';

$cert = null;
try {
    if (credentials()) $cert = cert_find((string)($_GET['c'] ?? ''));
} catch (Throwable $e) {
    error_log('SavAwards badge: ' . $e->getMessage());
}
if (!$cert) {
    http_response_code(404);
    exit;
}
header('Content-Type: image/svg+xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'");
header('Access-Control-Allow-Origin: *');
echo badge_svg($cert);
