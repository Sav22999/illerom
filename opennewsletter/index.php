<?php
/** OpenNewsletter is now SavNewsletters (only if .htaccess is not read: see .htaccess). */
$q = (string)($_SERVER['QUERY_STRING'] ?? '');
header('Location: /savnewsletters/' . ($q !== '' ? '?' . $q : ''), true, 308);
