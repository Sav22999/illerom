<?php
/**
 * SavAwards — the certificate (A4 landscape) and the badge, drawn as SVG on the server, in the Tilt style of the app:
 * a leaning blue tile with the laurel, the star and the place; the text on the right; the year of the edition as a huge
 * outline that leans like the tile and starts behind it (the year is on the tile too). Always in English, so that they can be shown anywhere; the page
 * around the certificate follows the language of the reader. System fonts only: nothing is loaded from other sites.
 * Two kinds, same drawing in two colours: the technical vote of SavAwards (blue) and the community vote (emerald).
 * The other designs that were proposed are in tools/certificate-proposals/.
 */

declare(strict_types=1);

const CERT_SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const CERT_MONO = "ui-monospace,Menlo,Consolas,monospace";
const CERT_BLUE = '#2347C9';
/** The two kinds of award, same drawing, own colours: the technical vote of SavAwards (blue) and the vote of the community (emerald). */
const CERT_KINDS = [
    'jury' => ['from' => '#3B62E6', 'to' => '#14287A', 'accent' => '#2347C9', 'outline' => '#DCE3F7', 'vote' => 'TECHNICAL VOTE · BY SAVAWARDS', 'why' => 'Chosen after a hands-on analysis on stated devices.',
        'score' => 'SAVAWARDS SCORE', 'scoreNote' => 'out of 10, at the time of the award', 'scoreLine' => 'SavAwards score at the time of the award: %s / 10', 'badge' => 'SAVAWARDS %d'],
    'public' => ['from' => '#16B48C', 'to' => '#0A5443', 'accent' => '#0B7F62', 'outline' => '#CFEEE4', 'vote' => 'COMMUNITY VOTE', 'why' => 'Chosen by the votes of the SavAwards community.',
        'score' => 'COMMUNITY RATING', 'scoreNote' => 'out of 10, members’ average at the time', 'scoreLine' => 'Community rating at the time of the award: %s / 10', 'badge' => 'COMMUNITY VOTE · %d'],
];

function cert_kind(array $c): array
{
    return CERT_KINDS[($c['kind'] ?? 'jury') === 'public' ? 'public' : 'jury'];
}
const CERT_INK = '#121833';
const CERT_MUTED = '#5F6880';
const CERT_GOLD = '#D9A21B';
const CERT_AUTHOR = 'A project developed by Saverio Morelli, with no affiliation, sponsorship or payment from the companies it reviews.';
const CERT_DISCLAIMER = 'An independent recognition based on the manual analysis of SavAwards. Not sponsored by, affiliated with or endorsed by the product’s owner. No legal value.';

function svg_t(string $s): string
{
    return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function svg_text(float $x, float $y, string $s, string $attrs): string
{
    return '<text x="' . round($x, 1) . '" y="' . round($y, 1) . '" ' . $attrs . '>' . svg_t($s) . '</text>';
}

function svg_star(float $cx, float $cy, float $r, string $fill): string
{
    $p = [];
    for ($i = 0; $i < 10; $i++) {
        $a = M_PI / 2 + $i * M_PI / 5;
        $rr = $i % 2 ? $r * .42 : $r;
        $p[] = round($cx + cos($a) * $rr, 1) . ',' . round($cy - sin($a) * $rr, 1);
    }
    return '<polygon points="' . implode(' ', $p) . '" fill="' . $fill . '"/>';
}

/** A laurel branch around a medallion: leaves from the bottom up the left side, mirrored for the right one. */
function laurel(float $cx, float $cy, float $r, string $fill, bool $right, int $leaves = 9): string
{
    $out = '';
    for ($i = 0; $i < $leaves; $i++) {
        $deg = 252 - $i * (118 / max(1, $leaves - 1)); // 252° (just left of the bottom) up to 134° (upper left)
        $a = deg2rad($deg);
        $x = $cx + cos($a) * $r;
        $y = $cy - sin($a) * $r;
        $rot = 180 - $deg - 22; // along the arc, leaning outwards
        $size = 1 - $i * .035;  // smaller towards the tips
        if ($right) {
            $x = 2 * $cx - $x;
            $rot = -$rot;
        }
        $out .= sprintf('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" transform="rotate(%.1f %.1f %.1f)" fill="%s"/>', $x, $y, $r * .1 * $size, $r * .24 * $size, $rot, $x, $y, $fill);
    }
    return $out;
}

function wreath(float $cx, float $cy, float $r, string $fill, int $leaves = 9): string
{
    return laurel($cx, $cy, $r, $fill, false, $leaves) . laurel($cx, $cy, $r, $fill, true, $leaves);
}

/** The app icon (icons/favicon.svg), anywhere and at any size; $id keeps its gradients apart. */
function app_icon(float $x, float $y, float $size, string $id): string
{
    return '<g transform="translate(' . $x . ' ' . $y . ') scale(' . round($size / 64, 4) . ')"><defs>'
        . '<linearGradient id="' . $id . 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b62e6"/><stop offset="1" stop-color="#14287a"/></linearGradient>'
        . '<linearGradient id="' . $id . 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#d49a12"/></linearGradient></defs>'
        . '<rect x="5" y="5" width="54" height="54" rx="15" fill="url(#' . $id . 'b)" transform="rotate(-6 32 32)"/>'
        . svg_star(32, 23.5, 10.5, 'url(#' . $id . 'g)') . wreath(32, 28, 16, 'url(#' . $id . 'g)', 4)
        . '<rect x="18" y="47" width="28" height="4.4" rx="2.2" fill="#fff" fill-opacity=".28"/><rect x="18" y="47" width="22" height="4.4" rx="2.2" fill="#fff"/></g>';
}

/** Words cut into lines of at most $max characters. */
function svg_wrap(string $s, int $max, int $lines = 2): array
{
    $out = [];
    $line = '';
    foreach (preg_split('/\s+/', trim($s)) ?: [] as $w) {
        if ($line !== '' && mb_strlen($line . ' ' . $w) > $max) {
            $out[] = $line;
            $line = $w;
        } else $line = $line === '' ? $w : "$line $w";
    }
    if ($line !== '') $out[] = $line;
    if (count($out) > $lines) $out = array_merge(array_slice($out, 0, $lines - 1), [mb_strimwidth(implode(' ', array_slice($out, $lines - 1)), 0, $max, '…')]);
    return $out;
}

function certificate_svg(array $c): string
{
    $W = 1123;
    $H = 794;
    $L = 500; // left edge of the text
    $place = (int)$c['place'];
    $year = (string)(int)$c['year'];
    $title = $place === 1 ? 'Certificate of Excellence' : 'Certificate of Distinction';
    $placeName = strtoupper(place_name($place, 'en'));
    $product = (string)$c['product_name'];
    $award = (string)($c['award_en'] ?: $c['award_it']);
    $date = gmdate('j F Y', strtotime($c['issued_at'] . ' UTC'));
    $code = cert_display($c['code']);
    $url = preg_replace('~^https?://~', '', app_url()) . 'c/' . $code;
    $sans = 'font-family="' . CERT_SANS . '"';
    $K = cert_kind($c);
    $accent = $K['accent'];

    $s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . $W . ' ' . $H . '" width="' . $W . '" height="' . $H . '" role="img" aria-label="' . svg_t("$title · $product · $placeName · $award · {$K['vote']} · SavAwards $year") . '">';
    $s .= '<defs><linearGradient id="cb-' . ($c['kind'] ?? 'jury') . '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' . $K['from'] . '"/><stop offset="1" stop-color="' . $K['to'] . '"/></linearGradient>'
        . '<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#D49A12"/></linearGradient></defs>';
    $s .= '<rect width="' . $W . '" height="' . $H . '" fill="#FFFFFF"/>';
    // the year: drawn first, so that the tile covers its start
    $s .= '<g transform="rotate(-5 ' . ($W - 30) . ' 630)">' . svg_text($W - 22, 630, $year, 'text-anchor="end" ' . $sans . ' font-size="370" font-weight="900" letter-spacing="-18" fill="none" stroke="' . $K['outline'] . '" stroke-width="2.4"') . '</g>';
    // the tile: laurel, star, name of the awards, place
    $s .= '<g transform="rotate(-5 230 400)"><rect x="40" y="70" width="380" height="660" rx="44" fill="url(#cb-' . ($c['kind'] ?? 'jury') . ')"/></g>';
    $s .= '<g transform="translate(225 300)">' . wreath(0, 0, 96, 'url(#cg)', 10) . svg_star(0, -6, 52, 'url(#cg)') . '</g>';
    $s .= svg_text(225, 470, $year, 'text-anchor="middle" ' . $sans . ' font-size="88" font-weight="900" letter-spacing="-4" fill="#FFFFFF"');
    $s .= svg_text(225, 510, 'SAVAWARDS', 'text-anchor="middle" ' . $sans . ' font-size="18" letter-spacing="8" font-weight="800" fill="#FFE08A"');
    $s .= svg_text(225, 540, $K['vote'], 'text-anchor="middle" ' . $sans . ' font-size="' . (mb_strlen($K['vote']) > 18 ? 11 : 13) . '" letter-spacing="2.5" font-weight="700" fill="#FFFFFF" fill-opacity=".82"');
    $pw = max(180, mb_strlen($placeName) * 17 + 44);
    $s .= '<g transform="rotate(-4 225 600)"><rect x="' . (225 - $pw / 2) . '" y="572" width="' . $pw . '" height="56" rx="16" fill="#FFFFFF"/>'
        . svg_text(225, 609, $placeName, 'text-anchor="middle" ' . $sans . ' font-size="20" letter-spacing="4" font-weight="900" fill="' . $accent . '"') . '</g>';

    // the text on the right: the product as large as it fits (two lines when very long), then the award
    $s .= app_icon($L, 92, 46, 'ci') . svg_text($L + 56, 124, 'SavAwards', $sans . ' font-size="28" font-weight="800" letter-spacing="-.8" fill="' . CERT_INK . '"');
    $s .= svg_text($L, 214, $title, $sans . ' font-size="22" font-weight="700" fill="' . $accent . '"');
    $n = mb_strlen($product);
    if ($n <= 24) [$lines, $size] = [[$product], $n > 18 ? 48 : ($n > 13 ? 58 : 66)];
    else {
        $lines = svg_wrap($product, 22, 2);
        $size = 44;
        if (mb_strlen(implode(' ', $lines)) < $n) [$lines, $size] = [svg_wrap($product, 30, 3), 34]; // very long: three smaller lines
    }
    $y = 214 + $size + 18;
    foreach ($lines as $i => $line) $s .= svg_text($L, $y + $i * ($size + 4), $line, $sans . ' font-size="' . $size . '" font-weight="900" letter-spacing="' . round(-$size / 26, 1) . '" fill="' . CERT_INK . '"');
    $y += (count($lines) - 1) * ($size + 4) + 24;
    $s .= '<g transform="rotate(-2 ' . $L . ' ' . $y . ')"><rect x="' . $L . '" y="' . ($y - 6) . '" width="190" height="10" rx="5" fill="' . CERT_GOLD . '"/></g>';
    $awardLines = svg_wrap($award, 32, 2);
    $as = count($awardLines) > 1 ? 26 : 30;
    if (mb_strlen(implode(' ', $awardLines)) < mb_strlen($award)) [$awardLines, $as] = [svg_wrap($award, 44, 3), 21];
    $y += 50 + ($as - 26);
    foreach ($awardLines as $i => $line) $s .= svg_text($L, $y + $i * ($as + 6), $line, $sans . ' font-size="' . $as . '" font-weight="700" fill="' . CERT_INK . '"');
    $y += (count($awardLines) - 1) * ($as + 6) + 30;
    $s .= svg_text($L, $y, $K['why'], $sans . ' font-size="16" fill="' . CERT_MUTED . '"');

    // the score as a leaning square ring, as in the app; a line of text when the names above take the room
    if ($c['score'] !== null) {
        $score = (float)$c['score'];
        $ry = max(520, $y + 78);
        if ($ry <= 556) {
            $s .= '<g transform="translate(' . ($L + 46) . ' ' . $ry . ') rotate(-6)"><rect x="-40" y="-40" width="80" height="80" rx="18" fill="#FFFFFF" stroke="#E6E9F2" stroke-width="9"/>'
                . '<rect x="-40" y="-40" width="80" height="80" rx="18" fill="none" stroke="' . $accent . '" stroke-width="9" pathLength="100" stroke-dasharray="' . round($score * 10, 1) . ' 100" stroke-linecap="round"/></g>'
                . svg_text($L + 46, $ry + 9, number_format($score, 1), 'text-anchor="middle" ' . $sans . ' font-size="24" font-weight="900" fill="' . CERT_INK . '"')
                . svg_text($L + 108, $ry - 6, $K['score'], $sans . ' font-size="11" letter-spacing="2" font-weight="700" fill="' . CERT_MUTED . '"')
                . svg_text($L + 108, $ry + 18, $K['scoreNote'], $sans . ' font-size="14" fill="' . CERT_INK . '"');
        } else {
            $s .= svg_text($L, $y + 34, sprintf($K['scoreLine'], number_format($score, 1)), $sans . ' font-size="16" font-weight="700" fill="' . $accent . '"');
        }
    }
    // date, code, where to verify, disclaimer
    $s .= '<line x1="' . $L . '" x2="' . ($W - 70) . '" y1="610" y2="610" stroke="#E6E9F2" stroke-width="2"/>';
    foreach ([[$L, 'ISSUED ON', $date, CERT_SANS], [$L + 270, 'CERTIFICATE ID', $code, CERT_MONO]] as [$x, $label, $value, $font]) {
        $s .= svg_text($x, 646, $label, $sans . ' font-size="11" letter-spacing="2" fill="' . CERT_MUTED . '"')
            . svg_text($x, 672, $value, 'font-family="' . $font . '" font-size="18" font-weight="700" fill="' . CERT_INK . '"');
    }
    $s .= svg_text($L, 712, 'Verify at ' . $url, $sans . ' font-size="12" fill="' . CERT_MUTED . '"');
    $s .= svg_text($W - 70, 740, CERT_AUTHOR, 'text-anchor="end" ' . $sans . ' font-size="10.5" font-weight="700" fill="' . CERT_MUTED . '"');
    $s .= svg_text($W - 70, 756, CERT_DISCLAIMER, 'text-anchor="end" ' . $sans . ' font-size="9.5" fill="#8A91A6"');

    if (!empty($c['revoked_at'])) {
        $s .= '<g transform="rotate(-12 ' . ($W / 2) . ' ' . ($H / 2) . ')"><rect x="' . ($W / 2 - 250) . '" y="' . ($H / 2 - 56) . '" width="500" height="112" rx="24" fill="#FFFFFF" fill-opacity=".82" stroke="#C0262D" stroke-width="7"/>'
            . svg_text($W / 2, $H / 2 + 26, 'REVOKED', 'text-anchor="middle" ' . $sans . ' font-size="74" font-weight="900" letter-spacing="10" fill="#C0262D"') . '</g>';
    }
    return $s . '</svg>';
}

/** The badge winners can put on their site, linking to the certificate: a small leaning tile and the award. */
function badge_svg(array $c): string
{
    $revoked = !empty($c['revoked_at']);
    $top = $revoked ? 'REVOKED' : strtoupper(place_name((int)$c['place'], 'en'));
    $award = (string)($c['award_en'] ?: $c['award_it']);
    if (mb_strlen($award) > 30) $award = mb_substr($award, 0, 29) . '…';
    $W = 300;
    $H = 84;
    $sans = 'font-family="' . CERT_SANS . '"';
    $K = cert_kind($c);
    $tile = $revoked ? '#7A8094' : 'url(#bt-' . ($c['kind'] ?? 'jury') . ')';
    $gold = $revoked ? '#D5D9E3' : 'url(#bg)';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . $W . ' ' . $H . '" width="' . $W . '" height="' . $H . '" role="img" aria-label="' . svg_t("SavAwards {$c['year']} · $top · $award · {$c['product_name']}") . '">'
        . '<defs><linearGradient id="bt-' . ($c['kind'] ?? 'jury') . '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' . $K['from'] . '"/><stop offset="1" stop-color="' . $K['to'] . '"/></linearGradient>'
        . '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#D49A12"/></linearGradient></defs>'
        . '<rect x="1" y="1" width="' . ($W - 2) . '" height="' . ($H - 2) . '" rx="16" fill="#FFFFFF" stroke="' . ($revoked ? '#DCE3F7' : $K['outline']) . '" stroke-width="2"/>'
        . '<g transform="rotate(-6 44 42)"><rect x="12" y="10" width="64" height="64" rx="16" fill="' . $tile . '"/></g>'
        . '<g transform="translate(44 44)">' . wreath(0, 0, 22, $gold, 6) . svg_star(0, -2, 12, $gold) . '</g>'
        . svg_text(92, 26, sprintf($K['badge'], (int)$c['year']) . ' · ' . $top, $sans . ' font-size="9.5" letter-spacing="1.2" font-weight="800" fill="' . ($revoked ? '#C0262D' : $K['accent']) . '"')
        . svg_text(92, 47, $award, $sans . ' font-size="14" font-weight="800" fill="' . CERT_INK . '"')
        . svg_text(92, 66, mb_strimwidth((string)$c['product_name'], 0, 22, '…') . ' · ' . cert_display($c['code']), $sans . ' font-size="11" fill="' . CERT_MUTED . '"')
        . '</svg>';
}
