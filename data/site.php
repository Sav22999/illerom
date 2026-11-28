<?php
return [
    'url' => 'https://www.illerom.eu',
    'personal' => 'https://www.saveriomorelli.com/',
    'contact' => 'https://www.saveriomorelli.com/contact-me/',
    'repo' => 'https://github.com/Sav22999/illerom',
    // where the source of the projects lives: the folder name of each project is added at the end
    'source' => 'https://github.com/Sav22999/illerom/tree/main/',
    // the "read it backwards" button next to the name: hidden for now
    'flip' => false,
    // SavOffice for the computer (desktop/): the files of the latest release on GitHub (made by GitHub Actions, see
    // desktop/README.md): SavOffice-arm64.dmg, SavOffice-x64.dmg, SavOffice-Setup-x64.exe, SavOffice-x64.deb, SavOffice-x64.rpm.
    // /savoffice/ offers the one of the visitor's system (Mac, Windows, Linux), nothing on phones and tablets
    'savoffice_desktop' => 'https://github.com/Sav22999/illerom/releases/latest/download/',
    // the bigger projects, which have a home of their own
    'big' => [
        ['Notefox', 'https://www.notefox.eu/', 'websites-notes', ['it' => 'Note su qualsiasi sito web', 'en' => 'Notes on any website']],
        ['Sav PDF Viewer', 'https://www.savpdfviewer.com/', 'sav-pdf-viewer-pro', ['it' => 'Lettore PDF per Android', 'en' => 'PDF reader for Android']],
        ['SavAccount', 'https://www.savaccount.eu/', 'savaccount', ['it' => 'Un solo account per tutti i servizi', 'en' => 'One account for every service']],
        ['SavComponents', 'https://savcomponents.com/', 'savcomponents', ['it' => 'Componenti web pronti all’uso', 'en' => 'Ready-to-use web components']],
    ],
];
