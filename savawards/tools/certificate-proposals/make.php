<?php
/**
 * Proposals for the SavAwards certificate: four designs drawn with the same sample data.
 *   php savawards/tools/certificate-proposals/make.php   -> a.svg … d.svg and index.html next to this file
 * Chosen: E (Tilt with the outlined year of D, the year on the tile too), now in lib/certsvg.php (certificate_svg()).
 */

declare(strict_types=1);

$here = __DIR__;
$C = ['product' => 'Mailbox Libre', 'award' => 'Best European email', 'place' => 'Winner', 'year' => 2026, 'score' => 8.0,
    'code' => 'SA-2026-RMQ9-40HH', 'date' => '26 November 2026', 'url' => 'www.illerom.eu/savawards/c/SA-2026-RMQ9-40HH'];
const W = 1123;
const H = 794;
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,Menlo,Consolas,monospace";
const DISC = 'An independent recognition based on the manual analysis of SavAwards. Not sponsored by, affiliated with or endorsed by the product’s owner. No legal value.';

function x(string $s): string { return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
function txt(float $x, float $y, string $s, string $attrs): string { return '<text x="' . $x . '" y="' . $y . '" ' . $attrs . '>' . x($s) . '</text>'; }
function star(float $cx, float $cy, float $r, string $fill): string
{
    $p = [];
    for ($i = 0; $i < 10; $i++) { $a = M_PI / 2 + $i * M_PI / 5; $rr = $i % 2 ? $r * .42 : $r; $p[] = round($cx + cos($a) * $rr, 1) . ',' . round($cy - sin($a) * $rr, 1); }
    return '<polygon points="' . implode(' ', $p) . '" fill="' . $fill . '"/>';
}
/** Leaves from the bottom up one side of a circle, mirrored for the other. */
function wreath(float $cx, float $cy, float $r, string $fill, int $n = 9, float $from = 252, float $span = 118, float $leaf = 1): string
{
    $o = '';
    foreach ([false, true] as $right) for ($i = 0; $i < $n; $i++) {
        $deg = $from - $i * ($span / max(1, $n - 1));
        $a = deg2rad($deg);
        $px = $cx + cos($a) * $r; $py = $cy - sin($a) * $r; $rot = 180 - $deg - 22; $s = 1 - $i * .035;
        if ($right) { $px = 2 * $cx - $px; $rot = -$rot; }
        $o .= sprintf('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" transform="rotate(%.1f %.1f %.1f)" fill="%s"/>', $px, $py, $r * .1 * $s * $leaf, $r * .24 * $s * $leaf, $rot, $px, $py, $fill);
    }
    return $o;
}
/** A seal with a notched edge (as in Fucina), a star inside. */
function seal(float $cx, float $cy, float $r, string $gold, string $inner, string $mark): string
{
    $p = [];
    for ($i = 0; $i < 64; $i++) { $a = $i * M_PI / 32; $rr = $i % 2 ? $r * .9 : $r; $p[] = round($cx + cos($a) * $rr, 1) . ',' . round($cy + sin($a) * $rr, 1); }
    return '<polygon points="' . implode(' ', $p) . '" fill="' . $gold . '"/><circle cx="' . $cx . '" cy="' . $cy . '" r="' . ($r * .7) . '" fill="' . $inner . '"/>'
        . '<circle cx="' . $cx . '" cy="' . $cy . '" r="' . ($r * .62) . '" fill="none" stroke="' . $mark . '" stroke-width="1.2" opacity=".7"/>' . star($cx, $cy, $r * .34, $mark);
}
/** The app icon (icons/favicon.svg), at any place and size. */
function icon(float $x, float $y, float $size, string $id): string
{
    $s = $size / 64;
    return '<g transform="translate(' . $x . ' ' . $y . ') scale(' . $s . ')"><defs><linearGradient id="' . $id . 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b62e6"/><stop offset="1" stop-color="#14287a"/></linearGradient>'
        . '<linearGradient id="' . $id . 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#d49a12"/></linearGradient></defs>'
        . '<rect x="5" y="5" width="54" height="54" rx="15" fill="url(#' . $id . 'b)" transform="rotate(-6 32 32)"/>' . star(32, 23.5, 10.5, 'url(#' . $id . 'g)') . wreath(32, 28, 16, 'url(#' . $id . 'g)', 4, 250, 85)
        . '<rect x="18" y="47" width="28" height="4.4" rx="2.2" fill="#fff" fill-opacity=".28"/><rect x="18" y="47" width="22" height="4.4" rx="2.2" fill="#fff"/></g>';
}
function svg(string $body, string $label): string
{
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . W . ' ' . H . '" width="' . W . '" height="' . H . '" role="img" aria-label="' . x($label) . '">' . $body . '</svg>';
}

// ---------------------------------------------------------------- A · Classic (after Fucina)
function variant_a(array $c): string
{
    $gold = '#B8902F'; $navy = '#141B4D'; $cx = W / 2;
    $s = '<defs><radialGradient id="pa" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#FFFDF7"/><stop offset="1" stop-color="#F3EAD6"/></radialGradient>'
        . '<linearGradient id="ga" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2D684"/><stop offset=".5" stop-color="#C99A2E"/><stop offset="1" stop-color="#E8C66A"/></linearGradient></defs>';
    $s .= '<rect width="' . W . '" height="' . H . '" fill="url(#pa)"/>';
    $s .= '<rect x="26" y="26" width="' . (W - 52) . '" height="' . (H - 52) . '" fill="none" stroke="' . $gold . '" stroke-width="4"/>';
    $s .= '<rect x="34" y="34" width="' . (W - 68) . '" height="' . (H - 68) . '" fill="none" stroke="' . $gold . '" stroke-width="1"/>';
    foreach ([[46, 46, 1, 1], [W - 46, 46, -1, 1], [46, H - 46, 1, -1], [W - 46, H - 46, -1, -1]] as [$px, $py, $dx, $dy])
        $s .= '<path d="M' . $px . ' ' . ($py + 44 * $dy) . 'V' . $py . 'H' . ($px + 44 * $dx) . '" fill="none" stroke="' . $gold . '" stroke-width="1.5"/>'
            . '<path d="M' . ($px + 22 * $dx) . ' ' . ($py + 12 * $dy) . 'l' . (-10 * $dx) . ' ' . (10 * $dy) . 'l' . (10 * $dx) . ' ' . (10 * $dy) . '" fill="none" stroke="' . $gold . '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    // logo and name, as in Fucina
    $s .= icon($cx - 150, 62, 74, 'ia') . txt($cx - 66, 116, 'SavAwards', 'font-family="' . SANS . '" font-size="54" font-weight="800" letter-spacing="-1.5" fill="' . $navy . '"');
    $s .= txt($cx, 196, 'CERTIFICATE OF EXCELLENCE', 'text-anchor="middle" font-family="' . SANS . '" font-size="17" letter-spacing="7" font-weight="700" fill="' . $gold . '"');
    $s .= txt($cx, 236, 'This certificate is proudly presented to', 'text-anchor="middle" font-family="' . SERIF . '" font-style="italic" font-size="20" fill="#5E5A6E"');
    $s .= txt($cx, 330, $c['product'], 'text-anchor="middle" font-family="' . SERIF . '" font-weight="700" font-size="80" fill="' . $navy . '"');
    $s .= '<line x1="' . ($cx - 250) . '" x2="' . ($cx + 250) . '" y1="360" y2="360" stroke="' . $gold . '" stroke-width="1.5"/>';
    $s .= txt($cx, 404, $c['place'] . ' · SavAwards ' . $c['year'], 'text-anchor="middle" font-family="' . SANS . '" font-size="16" letter-spacing="3" font-weight="700" fill="' . $gold . '"');
    $s .= txt($cx, 446, $c['award'], 'text-anchor="middle" font-family="' . SERIF . '" font-size="32" fill="' . $navy . '"');
    $s .= txt($cx, 484, 'Overall score at the time of the award: ' . number_format($c['score'], 1) . ' / 10', 'text-anchor="middle" font-family="' . SANS . '" font-size="14" fill="#5E5A6E"');
    // signature lines with date and code, seal in the middle
    $s .= seal($cx, 612, 78, 'url(#ga)', $navy, '#F2D684');
    foreach ([[$cx - 330, $c['date'], 'Issued on'], [$cx + 330, $c['code'], 'Certificate ID']] as [$lx, $v, $l]) {
        $s .= txt($lx, 630, $v, 'text-anchor="middle" font-family="' . ($l === 'Certificate ID' ? MONO : SANS) . '" font-size="19" font-weight="700" fill="' . $navy . '"');
        $s .= '<line x1="' . ($lx - 150) . '" x2="' . ($lx + 150) . '" y1="646" y2="646" stroke="' . $navy . '" stroke-width="1"/>';
        $s .= txt($lx, 670, strtoupper($l), 'text-anchor="middle" font-family="' . SANS . '" font-size="11" letter-spacing="2.5" fill="#6E6A7E"');
    }
    $s .= txt($cx, 722, 'Verify at ' . $c['url'], 'text-anchor="middle" font-family="' . SANS . '" font-size="12" fill="#6E6A7E"');
    $s .= txt($cx, 742, DISC, 'text-anchor="middle" font-family="' . SANS . '" font-size="10" fill="#8A8698"');
    return svg($s, 'A');
}

// ---------------------------------------------------------------- B · Tilt (the style of the app)
function variant_b(array $c): string
{
    $blue = '#2347C9'; $ink = '#121833'; $gold = '#D9A21B';
    $s = '<defs><linearGradient id="bb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B62E6"/><stop offset="1" stop-color="#14287A"/></linearGradient>'
        . '<linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#D49A12"/></linearGradient></defs>';
    $s .= '<rect width="' . W . '" height="' . H . '" fill="#FFFFFF"/>';
    // a big leaning blue tile on the left, with the wreath and the year
    $s .= '<g transform="rotate(-5 230 400)"><rect x="40" y="70" width="380" height="660" rx="44" fill="url(#bb)"/></g>';
    $s .= '<g transform="translate(225 300)">' . wreath(0, 0, 96, 'url(#bg2)', 10) . star(0, -6, 52, 'url(#bg2)') . '</g>';
    $s .= txt(225, 470, (string)$c['year'], 'text-anchor="middle" font-family="' . SANS . '" font-size="88" font-weight="900" letter-spacing="-4" fill="#FFFFFF"');
    $s .= txt(225, 510, 'SAVAWARDS', 'text-anchor="middle" font-family="' . SANS . '" font-size="18" letter-spacing="8" font-weight="800" fill="#FFE08A"');
    $s .= '<g transform="rotate(-4 225 600)"><rect x="135" y="572" width="180" height="56" rx="16" fill="#FFFFFF"/>'
        . txt(225, 609, strtoupper($c['place']), 'text-anchor="middle" font-family="' . SANS . '" font-size="20" letter-spacing="4" font-weight="900" fill="' . $blue . '"') . '</g>';
    // the text on the right
    $L = 500;
    $s .= icon($L, 92, 46, 'ib') . txt($L + 56, 124, 'SavAwards', 'font-family="' . SANS . '" font-size="28" font-weight="800" letter-spacing="-.8" fill="' . $ink . '"');
    $s .= txt($L, 220, 'Certificate of Excellence', 'font-family="' . SANS . '" font-size="22" font-weight="700" fill="' . $blue . '"');
    $s .= txt($L, 300, $c['product'], 'font-family="' . SANS . '" font-size="66" font-weight="900" letter-spacing="-2.5" fill="' . $ink . '"');
    $s .= '<g transform="rotate(-2 ' . $L . ' 330)"><rect x="' . $L . '" y="322" width="190" height="10" rx="5" fill="' . $gold . '"/></g>';
    $s .= txt($L, 392, $c['award'], 'font-family="' . SANS . '" font-size="30" font-weight="700" fill="' . $ink . '"');
    $s .= txt($L, 426, 'Chosen after a hands-on analysis on stated devices.', 'font-family="' . SANS . '" font-size="16" fill="#5F6880"');
    // score as a leaning square ring (Tilt)
    $sc = $c['score'] / 10;
    $s .= '<g transform="translate(' . ($L + 46) . ' 520) rotate(-6)"><rect x="-40" y="-40" width="80" height="80" rx="18" fill="none" stroke="#E6E9F2" stroke-width="9"/>'
        . '<rect x="-40" y="-40" width="80" height="80" rx="18" fill="none" stroke="' . $blue . '" stroke-width="9" pathLength="100" stroke-dasharray="' . ($sc * 100) . ' 100" stroke-linecap="round"/></g>'
        . txt($L + 46, 529, number_format($c['score'], 1), 'text-anchor="middle" font-family="' . SANS . '" font-size="24" font-weight="900" fill="' . $ink . '"');
    $s .= txt($L + 108, 514, 'SAVAWARDS SCORE', 'font-family="' . SANS . '" font-size="11" letter-spacing="2" font-weight="700" fill="#5F6880"') . txt($L + 108, 538, 'out of 10, at the time of the award', 'font-family="' . SANS . '" font-size="14" fill="' . $ink . '"');
    $s .= '<line x1="' . $L . '" x2="' . (W - 70) . '" y1="610" y2="610" stroke="#E6E9F2" stroke-width="2"/>';
    foreach ([[$L, 'ISSUED ON', $c['date'], SANS], [$L + 270, 'CERTIFICATE ID', $c['code'], MONO]] as [$lx, $l, $v, $f])
        $s .= txt($lx, 646, $l, 'font-family="' . SANS . '" font-size="11" letter-spacing="2" fill="#5F6880"') . txt($lx, 672, $v, 'font-family="' . $f . '" font-size="18" font-weight="700" fill="' . $ink . '"');
    $s .= txt($L, 712, 'Verify at ' . $c['url'], 'font-family="' . SANS . '" font-size="12" fill="#5F6880"');
    $s .= txt(W - 70, 752, DISC, 'text-anchor="end" font-family="' . SANS . '" font-size="9.5" fill="#8A91A6"');
    return svg($s, 'B');
}

// ---------------------------------------------------------------- E · Tilt with the year of D: a huge outlined year, leaning
// like the tile, that starts behind it and comes out on the right. $tileYear: the year stays on the tile too.
function variant_e(array $c, bool $tileYear = true): string
{
    $blue = '#2347C9'; $ink = '#121833'; $gold = '#D9A21B';
    $s = '<defs><linearGradient id="eb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B62E6"/><stop offset="1" stop-color="#14287A"/></linearGradient>'
        . '<linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#D49A12"/></linearGradient></defs>';
    $s .= '<rect width="' . W . '" height="' . H . '" fill="#FFFFFF"/>';
    // the year, drawn first: the tile covers its start
    $s .= '<g transform="rotate(-5 ' . (W - 30) . ' 630)">' . txt(W - 22, 630, (string)$c['year'], 'text-anchor="end" font-family="' . SANS . '" font-size="370" font-weight="900" letter-spacing="-18" fill="none" stroke="#DCE3F7" stroke-width="2.4"') . '</g>';
    $s .= '<g transform="rotate(-5 230 400)"><rect x="40" y="70" width="380" height="660" rx="44" fill="url(#eb)"/></g>';
    $wy = $tileYear ? 300 : 330;
    $s .= '<g transform="translate(225 ' . $wy . ')">' . wreath(0, 0, 96, 'url(#eg)', 10) . star(0, -6, 52, 'url(#eg)') . '</g>';
    if ($tileYear) $s .= txt(225, 470, (string)$c['year'], 'text-anchor="middle" font-family="' . SANS . '" font-size="88" font-weight="900" letter-spacing="-4" fill="#FFFFFF"');
    $s .= txt(225, $tileYear ? 510 : 490, 'SAVAWARDS', 'text-anchor="middle" font-family="' . SANS . '" font-size="' . ($tileYear ? 18 : 22) . '" letter-spacing="8" font-weight="800" fill="#FFE08A"');
    $s .= '<g transform="rotate(-4 225 600)"><rect x="135" y="572" width="180" height="56" rx="16" fill="#FFFFFF"/>'
        . txt(225, 609, strtoupper($c['place']), 'text-anchor="middle" font-family="' . SANS . '" font-size="20" letter-spacing="4" font-weight="900" fill="' . $blue . '"') . '</g>';
    $L = 500;
    $s .= icon($L, 92, 46, 'ie') . txt($L + 56, 124, 'SavAwards', 'font-family="' . SANS . '" font-size="28" font-weight="800" letter-spacing="-.8" fill="' . $ink . '"');
    $s .= txt($L, 220, 'Certificate of Excellence', 'font-family="' . SANS . '" font-size="22" font-weight="700" fill="' . $blue . '"');
    $s .= txt($L, 300, $c['product'], 'font-family="' . SANS . '" font-size="66" font-weight="900" letter-spacing="-2.5" fill="' . $ink . '"');
    $s .= '<g transform="rotate(-2 ' . $L . ' 330)"><rect x="' . $L . '" y="322" width="190" height="10" rx="5" fill="' . $gold . '"/></g>';
    $s .= txt($L, 392, $c['award'], 'font-family="' . SANS . '" font-size="30" font-weight="700" fill="' . $ink . '"');
    $s .= txt($L, 426, 'Chosen after a hands-on analysis on stated devices.', 'font-family="' . SANS . '" font-size="16" fill="#5F6880"');
    $sc = $c['score'] / 10;
    $s .= '<g transform="translate(' . ($L + 46) . ' 520) rotate(-6)"><rect x="-40" y="-40" width="80" height="80" rx="18" fill="#FFFFFF" stroke="#E6E9F2" stroke-width="9"/>'
        . '<rect x="-40" y="-40" width="80" height="80" rx="18" fill="none" stroke="' . $blue . '" stroke-width="9" pathLength="100" stroke-dasharray="' . ($sc * 100) . ' 100" stroke-linecap="round"/></g>'
        . txt($L + 46, 529, number_format($c['score'], 1), 'text-anchor="middle" font-family="' . SANS . '" font-size="24" font-weight="900" fill="' . $ink . '"');
    $s .= txt($L + 108, 514, 'SAVAWARDS SCORE', 'font-family="' . SANS . '" font-size="11" letter-spacing="2" font-weight="700" fill="#5F6880"') . txt($L + 108, 538, 'out of 10, at the time of the award', 'font-family="' . SANS . '" font-size="14" fill="' . $ink . '"');
    $s .= '<line x1="' . $L . '" x2="' . (W - 70) . '" y1="610" y2="610" stroke="#E6E9F2" stroke-width="2"/>';
    foreach ([[$L, 'ISSUED ON', $c['date'], SANS], [$L + 270, 'CERTIFICATE ID', $c['code'], MONO]] as [$lx, $l, $v, $f])
        $s .= txt($lx, 646, $l, 'font-family="' . SANS . '" font-size="11" letter-spacing="2" fill="#5F6880"') . txt($lx, 672, $v, 'font-family="' . $f . '" font-size="18" font-weight="700" fill="' . $ink . '"');
    $s .= txt($L, 712, 'Verify at ' . $c['url'], 'font-family="' . SANS . '" font-size="12" fill="#5F6880"');
    $s .= txt(W - 70, 752, DISC, 'text-anchor="end" font-family="' . SANS . '" font-size="9.5" fill="#8A91A6"');
    return svg($s, 'E');
}
function variant_f(array $c): string { return variant_e($c, false); }

// ---------------------------------------------------------------- C · Night and gold
function variant_c(array $c): string
{
    $cx = W / 2; $gold = '#E2BC5A';
    $s = '<defs><radialGradient id="nc" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#1E2A6B"/><stop offset="1" stop-color="#0A0F2E"/></radialGradient>'
        . '<linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset=".45" stop-color="#D9A93A"/><stop offset="1" stop-color="#F6D77E"/></linearGradient>'
        . '<pattern id="dc" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r=".9" fill="#2B3A85"/></pattern></defs>';
    $s .= '<rect width="' . W . '" height="' . H . '" fill="url(#nc)"/><rect width="' . W . '" height="' . H . '" fill="url(#dc)"/>';
    // art deco frame: double line with stepped corners
    foreach ([30, 40] as $k => $m) {
        $st = 14 + $k * 6;
        $s .= '<path d="M' . ($m + $st) . ' ' . $m . 'H' . (W - $m - $st) . 'L' . (W - $m) . ' ' . ($m + $st) . 'V' . (H - $m - $st) . 'L' . (W - $m - $st) . ' ' . (H - $m) . 'H' . ($m + $st) . 'L' . $m . ' ' . (H - $m - $st) . 'V' . ($m + $st) . 'Z" fill="none" stroke="url(#gc)" stroke-width="' . ($k ? 1 : 2.5) . '"/>';
    }
    $s .= icon($cx - 26, 60, 52, 'ic');
    $s .= txt($cx, 150, 'SAVAWARDS · ' . $c['year'], 'text-anchor="middle" font-family="' . SANS . '" font-size="15" letter-spacing="8" font-weight="700" fill="url(#gc)"');
    // the wreath around the product name
    $s .= '<g opacity=".95">' . wreath($cx, 330, 330, 'url(#gc)', 12, 222, 66, .42) . '</g>';
    $s .= txt($cx, 236, $c['place'], 'text-anchor="middle" font-family="' . SERIF . '" font-style="italic" font-size="34" fill="#F4E4B5"');
    $s .= txt($cx, 340, $c['product'], 'text-anchor="middle" font-family="' . SERIF . '" font-weight="700" font-size="70" fill="url(#gc)"');
    $s .= star($cx - 120, 384, 7, $gold) . star($cx, 384, 9, $gold) . star($cx + 120, 384, 7, $gold);
    $s .= '<line x1="' . ($cx - 104) . '" x2="' . ($cx - 18) . '" y1="384" y2="384" stroke="' . $gold . '"/><line x1="' . ($cx + 18) . '" x2="' . ($cx + 104) . '" y1="384" y2="384" stroke="' . $gold . '"/>';
    $s .= txt($cx, 440, $c['award'], 'text-anchor="middle" font-family="' . SERIF . '" font-size="32" fill="#FFFFFF"');
    $s .= txt($cx, 476, 'Overall score ' . number_format($c['score'], 1) . ' / 10 · independent review', 'text-anchor="middle" font-family="' . SANS . '" font-size="14" letter-spacing="1" fill="#AEB8E6"');
    foreach ([[$cx - 300, 'ISSUED ON', $c['date'], SANS], [$cx + 300, 'CERTIFICATE ID', $c['code'], MONO]] as [$lx, $l, $v, $f])
        $s .= txt($lx, 600, $l, 'text-anchor="middle" font-family="' . SANS . '" font-size="11" letter-spacing="3" fill="#AEB8E6"') . txt($lx, 628, $v, 'text-anchor="middle" font-family="' . $f . '" font-size="19" font-weight="700" fill="#FFFFFF"');
    $s .= seal($cx, 612, 62, 'url(#gc)', '#0E1540', '#FFE9A8');
    $s .= txt($cx, 712, 'Verify at ' . $c['url'], 'text-anchor="middle" font-family="' . SANS . '" font-size="12" fill="#AEB8E6"');
    $s .= txt($cx, 734, DISC, 'text-anchor="middle" font-family="' . SANS . '" font-size="10" fill="#7F89BD"');
    return svg($s, 'C');
}

// ---------------------------------------------------------------- D · Editorial
function variant_d(array $c): string
{
    $ink = '#15171F'; $blue = '#2347C9'; $gold = '#C9961F';
    $s = '<rect width="' . W . '" height="' . H . '" fill="#FBFAF6"/>';
    // the year as a huge outline in the background
    $s .= txt(W - 40, 560, (string)$c['year'], 'text-anchor="end" font-family="' . SANS . '" font-size="330" font-weight="900" letter-spacing="-18" fill="none" stroke="#E9E4D6" stroke-width="2"');
    // a gold ribbon hanging from the top right
    $s .= '<path d="M' . (W - 190) . ' 0h84v170l-42-30-42 30z" fill="' . $gold . '"/>' . star(W - 148, 92, 22, '#FFF4CF');
    // text on the left
    $L = 90;
    $s .= icon($L, 72, 48, 'id') . txt($L + 60, 106, 'SavAwards', 'font-family="' . SANS . '" font-size="28" font-weight="800" letter-spacing="-.8" fill="' . $ink . '"');
    $s .= '<line x1="' . $L . '" x2="' . ($L + 640) . '" y1="152" y2="152" stroke="' . $ink . '" stroke-width="2"/>';
    $s .= txt($L, 186, 'CERTIFICATE · ' . strtoupper($c['place']) . ' · EDITION ' . $c['year'], 'font-family="' . SANS . '" font-size="13" letter-spacing="3.5" font-weight="700" fill="' . $blue . '"');
    $s .= txt($L, 300, $c['product'], 'font-family="' . SERIF . '" font-size="96" letter-spacing="-2" fill="' . $ink . '"');
    $s .= txt($L, 362, $c['award'], 'font-family="' . SERIF . '" font-style="italic" font-size="38" fill="' . $ink . '"');
    $s .= txt($L, 410, 'Awarded after an independent, hands-on analysis: scored on public criteria, on stated devices.', 'font-family="' . SANS . '" font-size="16" fill="#5B5E6B"');
    // three columns of facts
    $s .= '<line x1="' . $L . '" x2="' . (W - 90) . '" y1="560" y2="560" stroke="' . $ink . '" stroke-width="1"/>';
    foreach ([[$L, 'SCORE', number_format($c['score'], 1) . ' / 10', SANS], [$L + 260, 'ISSUED ON', $c['date'], SANS], [$L + 560, 'CERTIFICATE ID', $c['code'], MONO]] as [$lx, $l, $v, $f])
        $s .= txt($lx, 596, $l, 'font-family="' . SANS . '" font-size="11" letter-spacing="2.5" fill="#5B5E6B"') . txt($lx, 628, $v, 'font-family="' . $f . '" font-size="22" font-weight="700" fill="' . $ink . '"');
    $s .= txt($L, 690, 'Verify at ' . $c['url'], 'font-family="' . SANS . '" font-size="13" fill="' . $blue . '"');
    $s .= '<line x1="' . $L . '" x2="' . (W - 90) . '" y1="716" y2="716" stroke="#DDD8C8" stroke-width="1"/>';
    $s .= txt($L, 740, DISC, 'font-family="' . SANS . '" font-size="10" fill="#8B8E9A"');
    return svg($s, 'D');
}

$names = ['a' => 'A · Classico (come Fucina)', 'b' => 'B · Tilt (lo stile dell’app)', 'c' => 'C · Notte e oro', 'd' => 'D · Editoriale', 'e' => 'E · Tilt con l’anno di D', 'f' => 'F · Tilt con l’anno di D (solo fuori dal riquadro)'];
$html = '<!doctype html><meta charset="utf-8"><title>SavAwards · proposte di certificato</title><style>body{margin:0;padding:24px;background:#d9dce6;font:15px system-ui;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}figcaption{font-weight:700;margin:0 0 8px}img{width:100%;height:auto;display:block;box-shadow:0 10px 30px rgb(0 0 0 / .25)}</style>';
foreach ($names as $k => $label) {
    file_put_contents("$here/$k.svg", '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . ('variant_' . $k)($C));
    $html .= "<figure><figcaption>" . x($label) . "</figcaption><img src=\"$k.svg\" alt=\"\"></figure>";
}
file_put_contents("$here/index.html", $html);
echo "ok\n";
