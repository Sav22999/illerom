<?php
/** Small helpers: no database, no sessions, no cookies. */

function e(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

/** An asset with its version, so browsers can keep it for a long time. */
function asset(string $path): string
{
    $f = ROOT . '/assets/' . $path;
    return '/assets/' . $path . (is_file($f) ? '?v=' . filemtime($f) : '');
}

/** Where a project opens ('' = not yet). */
function app_url(string $slug, array $p): string
{
    return $p['url'];
}

function source_url(array $p, array $site): string
{
    if ($p['source'] === '') return '';
    return preg_match('#^https://#', $p['source']) ? $p['source'] : $site['source'] . $p['source'];
}

function is_external(string $url): bool { return (bool)preg_match('#^https?://#', $url); }

/** Line icons drawn in the page: nothing to download. */
function icon(string $name): string
{
    $d = [
        'search' => '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
        'x' => '<path d="M6 6l12 12M18 6L6 18"/>',
        'arrow' => '<path d="M5 12h14M13 6l6 6-6 6"/>',
        'back' => '<path d="M19 12H5M11 6l-6 6 6 6"/>',
        'out' => '<path d="M7 17L17 7M8 7h9v9"/>',
        'code' => '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/>',
        'phone' => '<rect x="7" y="2.5" width="10" height="19"/><path d="M11 18.5h2"/>',
        'lock' => '<rect x="5" y="10.5" width="14" height="10"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
        'nouser' => '<circle cx="11" cy="8" r="3.7"/><path d="M4 20c.6-4 3.4-6 7-6 1.3 0 2.5.3 3.5.8M16 17l5 5M21 17l-5 5"/>',
        'offline' => '<path d="M3 3l18 18M8.5 16.400a5 5 0 0 1 7 0M5 12.900a10 10 0 0 1 5.2-2.700M19 12.900a10 10 0 0 0-2-1.500M2 8.800a15 15 0 0 1 4.2-2.600M22 8.800A15 15 0 0 0 10.7 5M12 20h.01"/>',
        'sun' => '<circle cx="12" cy="12" r="4"/><path d="M12 2.500v2M12 19.500v2M2.5 12h2M19.5 12h2M5.3 5.300l1.4 1.400M17.3 17.300l1.4 1.400M5.3 18.700l1.4-1.400M17.3 6.700l1.4-1.4"/>',
        'moon' => '<path d="M20 14.500A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.500z"/>',
        'flip' => '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
        'check' => '<path d="M5 12.500l4.5 4.500L19 7.5"/>',
    ][$name] ?? '';
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' . $d . '</svg>';
}

/** The three bars of the mark; $on of them filled (the level of a project). */
function bars(int $on = 3): string
{
    $s = '<svg class="bars" viewBox="0 0 34 20" aria-hidden="true">';
    for ($i = 0; $i < 3; $i++) {
        $x = 1 + $i * 8;
        $s .= '<path class="' . ($i < $on ? 'on' : 'off') . '" d="M' . $x . ' 0h5l10 20h-5z"/>';
    }
    return $s . '</svg>';
}

/** The mark: a leaning tile with the three bars of the m. */
function mark(): string
{
    return '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect class="mk-back" x="8" y="8" width="48" height="48" transform="rotate(7 32 32)"/><rect class="mk-tile" x="8" y="8" width="48" height="48" transform="rotate(-7 32 32)"/><path class="mk-bars" d="M11.5 18.0h6.2l14.0 28h-6.2zM21.9 18.0h6.2l14.0 28h-6.2zM32.3 18.0h6.2l14.0 28h-6.2z"/></svg>';
}

/** The letters of the name as bars, on an upright grid (the group is then slanted). */
function wordmark(): string
{
    $g = [
        ['i', [[0, 0, 15, 100]]],
        ['l', [[31, 0, 15, 100]]],
        ['l', [[62, 0, 15, 100]]],
        ['e', [[104, 0, 48, 15], [104, 42.5, 48, 15], [104, 85, 48, 15]]],
        ['r', [[179, 0, 15, 100], [210, 50, 15, 50]]],
        ['o', [[252, 0, 48, 15], [252, 85, 48, 15]]],
        ['m', [[327, 0, 15, 100], [358, 0, 15, 100], [389, 0, 15, 100]]],
    ];
    $w = 404 + 50;
    $b = '';
    $n = 0;
    foreach ($g as [, $rects]) {
        foreach ($rects as [$x, $y, $rw, $rh]) {
            $b .= sprintf('<rect class="bar" style="--n:%d" x="%s" y="%s" width="%s" height="%s"/>', $n++, $x, $y, $rw, $rh);
        }
    }
    return '<svg class="wordmark" viewBox="0 0 ' . $w . ' 100" aria-hidden="true"><g class="wm-bars"><g class="wm-lean" transform="matrix(1 0 .5 1 0 0)">' . $b . '</g></g></svg>';
}
