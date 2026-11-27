<?php
/**
 * SavAwards — the tables, and the first criteria and categories (only on a new installation; afterwards they are edited
 * from the staff area). Created by the API at its first request.
 */

declare(strict_types=1);

function install_schema(PDO $db, string $p, int $from = 0): void
{
    $T = fn(string $n) => '`' . $p . $n . '`';
    $E = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $sql = [
        "CREATE TABLE IF NOT EXISTS {$T('meta')} (`k` VARCHAR(64) NOT NULL PRIMARY KEY, `v` TEXT NULL) $E",
        "CREATE TABLE IF NOT EXISTS {$T('users')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(80) NOT NULL,
            `email` VARCHAR(190) NOT NULL,
            `password_hash` VARCHAR(255) NOT NULL DEFAULT '',
            `google_sub` VARCHAR(64) NULL,
            `sav_sub` VARCHAR(190) CHARACTER SET ascii COLLATE ascii_bin NULL,
            `role` TINYINT UNSIGNED NOT NULL DEFAULT 1,
            `mod_all` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'a moderator of every product',
            `status` VARCHAR(10) NOT NULL DEFAULT 'active',
            `email_verified_at` DATETIME NULL,
            `ui_lang` VARCHAR(5) NOT NULL DEFAULT 'en',
            `created_at` DATETIME NOT NULL,
            `last_login_at` DATETIME NULL,
            UNIQUE KEY `uq_email` (`email`), UNIQUE KEY `uq_google` (`google_sub`), UNIQUE KEY `uq_sav` (`sav_sub`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('auth_tokens')} (
            `token_hash` CHAR(64) NOT NULL PRIMARY KEY, `user_id` INT UNSIGNED NOT NULL, `csrf_token` CHAR(48) NOT NULL,
            `created_at` DATETIME NOT NULL, `last_seen_at` DATETIME NOT NULL, `expires_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`), CONSTRAINT `fk_{$p}tok_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('email_tokens')} (
            `token_hash` CHAR(64) NOT NULL PRIMARY KEY, `user_id` INT UNSIGNED NOT NULL, `purpose` VARCHAR(10) NOT NULL,
            `created_at` DATETIME NOT NULL, `expires_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`), CONSTRAINT `fk_{$p}etok_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('attempts')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `kind` VARCHAR(20) NOT NULL, `ip` VARCHAR(45) NOT NULL, `created_at` DATETIME NOT NULL,
            KEY `ix_kind_ip` (`kind`, `ip`, `created_at`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('categories')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `slug` VARCHAR(60) NOT NULL, `name_it` VARCHAR(80) NOT NULL, `name_en` VARCHAR(80) NOT NULL,
            `icon` VARCHAR(40) NOT NULL DEFAULT 'box', `sort` INT NOT NULL DEFAULT 0, UNIQUE KEY `uq_slug` (`slug`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('criteria')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `slug` VARCHAR(60) NOT NULL,
            `name_it` VARCHAR(80) NOT NULL, `name_en` VARCHAR(80) NOT NULL, `desc_it` TEXT NULL, `desc_en` TEXT NULL,
            `icon` VARCHAR(40) NOT NULL DEFAULT 'circle-check', `sort` INT NOT NULL DEFAULT 0, `active` TINYINT(1) NOT NULL DEFAULT 1, UNIQUE KEY `uq_slug` (`slug`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('products')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `slug` VARCHAR(90) NOT NULL, `name` VARCHAR(90) NOT NULL, `category_id` INT UNSIGNED NULL,
            `tagline_it` VARCHAR(200) NOT NULL DEFAULT '', `tagline_en` VARCHAR(200) NOT NULL DEFAULT '',
            `review_it` TEXT NULL, `review_en` TEXT NULL,
            `pros_it` TEXT NULL, `pros_en` TEXT NULL, `cons_it` TEXT NULL, `cons_en` TEXT NULL,
            `website` VARCHAR(300) NOT NULL DEFAULT '', `source_url` VARCHAR(300) NOT NULL DEFAULT '', `licence` VARCHAR(60) NOT NULL DEFAULT '',
            `open_source` TINYINT(1) NOT NULL DEFAULT 0, `pricing` VARCHAR(10) NOT NULL DEFAULT 'free',
            `country` CHAR(2) NOT NULL DEFAULT '', `self_host` TINYINT(1) NOT NULL DEFAULT 0,
            `platforms` VARCHAR(120) NOT NULL DEFAULT '', `alternatives_to` VARCHAR(500) NOT NULL DEFAULT '',
            `features` VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'green, e2ee, no_ads, no_tracking',
            `tested_on` TEXT NULL COMMENT 'one device per line: device · system · version of the app',
            `tested_version` VARCHAR(60) NOT NULL DEFAULT '', `tested_at` DATE NULL,
            `logo_mime` VARCHAR(20) NULL, `logo` MEDIUMTEXT NULL COMMENT 'base64',
            `status` VARCHAR(10) NOT NULL DEFAULT 'draft', `score` DECIMAL(4,2) NULL,
            `created_by` INT UNSIGNED NULL, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, `reviewed_at` DATETIME NULL,
            UNIQUE KEY `uq_slug` (`slug`), KEY `ix_cat` (`category_id`), KEY `ix_status` (`status`, `score`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('shots')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `product_id` INT UNSIGNED NOT NULL, `mime` VARCHAR(20) NOT NULL, `data` MEDIUMTEXT NOT NULL COMMENT 'base64',
            `width` SMALLINT UNSIGNED NOT NULL DEFAULT 0, `height` SMALLINT UNSIGNED NOT NULL DEFAULT 0, `caption` VARCHAR(160) NOT NULL DEFAULT '', `sort` INT NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL, KEY `ix_prod` (`product_id`, `sort`),
            CONSTRAINT `fk_{$p}shot_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('scores')} (
            `product_id` INT UNSIGNED NOT NULL, `criterion_id` INT UNSIGNED NOT NULL, `score` DECIMAL(3,1) NULL,
            `note_it` TEXT NULL, `note_en` TEXT NULL, PRIMARY KEY (`product_id`, `criterion_id`),
            CONSTRAINT `fk_{$p}sc_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}sc_crit` FOREIGN KEY (`criterion_id`) REFERENCES {$T('criteria')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('score_history')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `product_id` INT UNSIGNED NOT NULL, `criterion_id` INT UNSIGNED NULL,
            `old_score` DECIMAL(4,2) NULL, `new_score` DECIMAL(4,2) NULL, `user_id` INT UNSIGNED NULL, `created_at` DATETIME NOT NULL,
            KEY `ix_prod` (`product_id`, `created_at`),
            CONSTRAINT `fk_{$p}sh_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('mod_scopes')} (
            `user_id` INT UNSIGNED NOT NULL, `product_id` INT UNSIGNED NOT NULL, PRIMARY KEY (`user_id`, `product_id`),
            CONSTRAINT `fk_{$p}ms_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}ms_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('audit')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `user_id` INT UNSIGNED NULL, `action` VARCHAR(40) NOT NULL,
            `target_type` VARCHAR(20) NOT NULL, `target_id` INT UNSIGNED NOT NULL DEFAULT 0, `detail` TEXT NULL, `created_at` DATETIME NOT NULL,
            KEY `ix_target` (`target_type`, `target_id`), KEY `ix_when` (`created_at`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('reviews')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `product_id` INT UNSIGNED NOT NULL, `user_id` INT UNSIGNED NOT NULL,
            `rating` TINYINT UNSIGNED NOT NULL, `title` VARCHAR(120) NOT NULL DEFAULT '', `body` TEXT NULL, `used_on` VARCHAR(120) NOT NULL DEFAULT '',
            `status` VARCHAR(10) NOT NULL DEFAULT 'visible', `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_one` (`product_id`, `user_id`),
            CONSTRAINT `fk_{$p}rv_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}rv_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('review_votes')} (
            `review_id` INT UNSIGNED NOT NULL, `user_id` INT UNSIGNED NOT NULL, PRIMARY KEY (`review_id`, `user_id`),
            CONSTRAINT `fk_{$p}rvv_rev` FOREIGN KEY (`review_id`) REFERENCES {$T('reviews')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}rvv_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('comments')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `product_id` INT UNSIGNED NOT NULL, `user_id` INT UNSIGNED NOT NULL,
            `body` TEXT NOT NULL, `status` VARCHAR(10) NOT NULL DEFAULT 'visible', `created_at` DATETIME NOT NULL,
            KEY `ix_prod` (`product_id`, `created_at`),
            CONSTRAINT `fk_{$p}cm_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}cm_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('favorites')} (
            `user_id` INT UNSIGNED NOT NULL, `product_id` INT UNSIGNED NOT NULL, `created_at` DATETIME NOT NULL, PRIMARY KEY (`user_id`, `product_id`),
            CONSTRAINT `fk_{$p}fv_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}fv_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('edit_requests')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `product_id` INT UNSIGNED NOT NULL, `user_id` INT UNSIGNED NULL,
            `field` VARCHAR(30) NOT NULL, `proposal` TEXT NOT NULL, `reason` TEXT NULL, `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
            `reply` TEXT NULL, `handled_by` INT UNSIGNED NULL, `created_at` DATETIME NOT NULL, `handled_at` DATETIME NULL,
            KEY `ix_status` (`status`, `product_id`),
            CONSTRAINT `fk_{$p}er_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('suggestions')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `user_id` INT UNSIGNED NULL, `name` VARCHAR(90) NOT NULL,
            `website` VARCHAR(300) NOT NULL DEFAULT '', `alternative_to` VARCHAR(200) NOT NULL DEFAULT '', `reason` TEXT NULL,
            `status` VARCHAR(10) NOT NULL DEFAULT 'pending', `reply` TEXT NULL, `product_id` INT UNSIGNED NULL, `handled_by` INT UNSIGNED NULL,
            `created_at` DATETIME NOT NULL, `handled_at` DATETIME NULL, KEY `ix_status` (`status`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('reports')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `kind` VARCHAR(10) NOT NULL, `target_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NOT NULL, `reason` VARCHAR(500) NOT NULL DEFAULT '', `status` VARCHAR(10) NOT NULL DEFAULT 'open',
            `handled_by` INT UNSIGNED NULL, `created_at` DATETIME NOT NULL, `handled_at` DATETIME NULL,
            UNIQUE KEY `uq_one` (`kind`, `target_id`, `user_id`), KEY `ix_status` (`status`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('editions')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `year` SMALLINT UNSIGNED NOT NULL,
            `title_it` VARCHAR(120) NOT NULL DEFAULT '', `title_en` VARCHAR(120) NOT NULL DEFAULT '', `intro_it` TEXT NULL, `intro_en` TEXT NULL,
            `status` VARCHAR(10) NOT NULL DEFAULT 'draft' COMMENT 'draft | nominees | voting | published', `vote_until` DATETIME NULL, `published_at` DATETIME NULL,
            UNIQUE KEY `uq_year` (`year`)
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('award_categories')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `edition_id` INT UNSIGNED NOT NULL, `slug` VARCHAR(60) NOT NULL,
            `name_it` VARCHAR(120) NOT NULL, `name_en` VARCHAR(120) NOT NULL, `desc_it` TEXT NULL, `desc_en` TEXT NULL,
            `kind` VARCHAR(10) NOT NULL DEFAULT 'jury' COMMENT 'jury | public', `sort` INT NOT NULL DEFAULT 0,
            UNIQUE KEY `uq_slug` (`edition_id`, `slug`),
            CONSTRAINT `fk_{$p}ac_ed` FOREIGN KEY (`edition_id`) REFERENCES {$T('editions')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('nominees')} (
            `category_id` INT UNSIGNED NOT NULL, `product_id` INT UNSIGNED NOT NULL, `place` TINYINT UNSIGNED NULL COMMENT '1 winner, 2 and 3 runners-up',
            `motivation_it` TEXT NULL, `motivation_en` TEXT NULL, PRIMARY KEY (`category_id`, `product_id`),
            CONSTRAINT `fk_{$p}nm_cat` FOREIGN KEY (`category_id`) REFERENCES {$T('award_categories')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}nm_prod` FOREIGN KEY (`product_id`) REFERENCES {$T('products')} (`id`) ON DELETE CASCADE
        ) $E",
        "CREATE TABLE IF NOT EXISTS {$T('votes')} (
            `category_id` INT UNSIGNED NOT NULL, `user_id` INT UNSIGNED NOT NULL, `product_id` INT UNSIGNED NOT NULL, `created_at` DATETIME NOT NULL,
            PRIMARY KEY (`category_id`, `user_id`),
            CONSTRAINT `fk_{$p}vt_cat` FOREIGN KEY (`category_id`) REFERENCES {$T('award_categories')} (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}vt_user` FOREIGN KEY (`user_id`) REFERENCES {$T('users')} (`id`) ON DELETE CASCADE
        ) $E",
        // A certificate keeps a copy of what it says: it stays readable even if the product or the category change later
        "CREATE TABLE IF NOT EXISTS {$T('certificates')} (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, `code` VARCHAR(24) NOT NULL,
            `category_id` INT UNSIGNED NULL, `product_id` INT UNSIGNED NULL, `place` TINYINT UNSIGNED NOT NULL DEFAULT 1,
            `year` SMALLINT UNSIGNED NOT NULL, `product_name` VARCHAR(90) NOT NULL, `product_slug` VARCHAR(90) NOT NULL,
            `award_it` VARCHAR(120) NOT NULL, `award_en` VARCHAR(120) NOT NULL, `score` DECIMAL(4,2) NULL,
            `kind` VARCHAR(10) NOT NULL DEFAULT 'jury' COMMENT 'jury: technical vote by SavAwards; public: community vote',
            `issued_by` INT UNSIGNED NULL, `issued_at` DATETIME NOT NULL, `revoked_at` DATETIME NULL, `revoke_reason` VARCHAR(300) NULL,
            UNIQUE KEY `uq_code` (`code`), UNIQUE KEY `uq_award` (`category_id`, `product_id`)
        ) $E",
    ];
    foreach ($sql as $s) $db->exec($s);

    // 1 -> 2: the badges of a product, and whether a certificate is for the technical or the community vote
    if ($from >= 1 && $from < 2) {
        $has = fn(string $table, string $col) => (bool)$db->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '$p$table' AND column_name = '$col'")->fetchColumn();
        if (!$has('products', 'features')) $db->exec("ALTER TABLE {$T('products')} ADD COLUMN `features` VARCHAR(200) NOT NULL DEFAULT '' AFTER `alternatives_to`");
        if (!$has('certificates', 'kind')) $db->exec("ALTER TABLE {$T('certificates')} ADD COLUMN `kind` VARCHAR(10) NOT NULL DEFAULT 'jury' AFTER `score`");
        $db->exec("UPDATE {$T('certificates')} c JOIN {$T('award_categories')} ac ON ac.id = c.category_id SET c.kind = ac.kind");
    }

    if ($from < 1) seed_catalogue($db, $T);
    $db->prepare("INSERT INTO {$T('meta')} (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)SCHEMA_VERSION]);
    // identity.php (SavAccount) finds its column already here
    $db->exec("INSERT INTO {$T('meta')} (k, v) VALUES ('identity_cols', '1') ON DUPLICATE KEY UPDATE v = v");
}

/** The parameters every product is scored on (0–10), and the categories of the catalogue. */
function seed_catalogue(PDO $db, callable $T): void
{
    if ((int)$db->query("SELECT COUNT(*) FROM {$T('criteria')}")->fetchColumn() === 0) {
        $criteria = [
            ['privacy', 'Privacy', 'Privacy', 'shield-check',
                'Quali dati raccoglie, perché e per quanto li tiene; tracciatori, profilazione, pubblicità; chiarezza dell’informativa.',
                'What data it collects, why and for how long; trackers, profiling, advertising; how clear the privacy notice is.'],
            ['security', 'Sicurezza', 'Security', 'lock',
                'Cifratura in transito e a riposo, crittografia end-to-end, autenticazione a due fattori, audit indipendenti, gestione delle vulnerabilità.',
                'Encryption in transit and at rest, end-to-end encryption, two-factor authentication, independent audits, vulnerability handling.'],
            ['openness', 'Apertura', 'Openness', 'code',
                'Codice sorgente pubblico, licenza libera, sviluppo trasparente, possibilità di contribuire.',
                'Public source code, free licence, transparent development, ability to contribute.'],
            ['sovereignty', 'Sovranità europea', 'European sovereignty', 'map-pin',
                'Sede e giurisdizione dell’azienda, dove sono i server, dipendenza da fornitori extra-UE, conformità al GDPR.',
                'Where the company is based and its jurisdiction, where the servers are, reliance on non-EU providers, GDPR compliance.'],
            ['usability', 'Facilità d’uso', 'Ease of use', 'mouse-pointer-click',
                'Primo avvio, chiarezza dell’interfaccia, curva di apprendimento, coerenza tra le piattaforme.',
                'First run, clarity of the interface, learning curve, consistency across platforms.'],
            ['features', 'Funzionalità', 'Features', 'layout-grid',
                'Quanto copre di ciò che offre l’alternativa più diffusa, e cosa aggiunge.',
                'How much of what the mainstream alternative offers it covers, and what it adds.'],
            ['performance', 'Prestazioni', 'Performance', 'gauge',
                'Velocità, consumo di memoria e batteria, affidabilità e disponibilità del servizio.',
                'Speed, memory and battery use, reliability and uptime of the service.'],
            ['interop', 'Interoperabilità', 'Interoperability', 'arrow-left-right',
                'Formati aperti, esportazione completa dei dati, standard (IMAP, CalDAV, WebDAV…), facilità di migrazione.',
                'Open formats, full data export, standards (IMAP, CalDAV, WebDAV…), how easy it is to migrate.'],
            ['accessibility', 'Accessibilità', 'Accessibility', 'accessibility',
                'Uso con lettori di schermo e tastiera, contrasto, dimensione del testo, conformità WCAG.',
                'Use with screen readers and keyboard, contrast, text size, WCAG compliance.'],
            ['support', 'Supporto e documentazione', 'Support & docs', 'life-buoy',
                'Guide, documentazione, community, tempi e qualità dell’assistenza, lingue disponibili.',
                'Guides, documentation, community, speed and quality of support, languages available.'],
            ['value', 'Rapporto qualità/prezzo', 'Value for money', 'coins',
                'Cosa offre il piano gratuito, prezzo dei piani a pagamento, trasparenza dei costi.',
                'What the free plan offers, price of the paid plans, transparency of costs.'],
            ['sustainability', 'Sostenibilità', 'Sustainability', 'sprout',
                'Modello economico, governance, storia del progetto, continuità nel tempo, impatto ambientale dichiarato.',
                'Business model, governance, history of the project, continuity over time, stated environmental impact.'],
        ];
        $st = $db->prepare("INSERT INTO {$T('criteria')} (slug, name_it, name_en, icon, desc_it, desc_en, sort) VALUES (?,?,?,?,?,?,?)");
        foreach ($criteria as $i => $c) $st->execute([$c[0], $c[1], $c[2], $c[3], $c[4], $c[5], $i * 10]);
    }
    if ((int)$db->query("SELECT COUNT(*) FROM {$T('categories')}")->fetchColumn() === 0) {
        $cats = [
            ['email', 'Email', 'Email', 'mail'], ['messaging', 'Messaggistica', 'Messaging', 'message-circle'],
            ['office', 'Ufficio', 'Office', 'file-text'], ['cloud', 'Cloud e file', 'Cloud & files', 'cloud'],
            ['browser', 'Browser', 'Browsers', 'globe'], ['search', 'Motori di ricerca', 'Search engines', 'search'],
            ['maps', 'Mappe', 'Maps', 'map'], ['passwords', 'Password', 'Passwords', 'key-round'],
            ['vpn', 'VPN e rete', 'VPN & network', 'shield'], ['calendar', 'Calendario e attività', 'Calendar & tasks', 'calendar'],
            ['video', 'Videochiamate', 'Video calls', 'video'], ['social', 'Social', 'Social', 'users'],
            ['ai', 'Intelligenza artificiale', 'Artificial intelligence', 'sparkles'], ['os', 'Sistemi operativi', 'Operating systems', 'monitor'],
            ['dev', 'Sviluppo', 'Development', 'terminal'], ['productivity', 'Note e produttività', 'Notes & productivity', 'list-checks'],
            ['design', 'Grafica, foto e video', 'Design & editing', 'image'], ['media', 'Musica e video', 'Music & video', 'play'], ['other', 'Altro', 'Other', 'box'],
        ];
        $st = $db->prepare("INSERT INTO {$T('categories')} (slug, name_it, name_en, icon, sort) VALUES (?,?,?,?,?)");
        foreach ($cats as $i => $c) $st->execute([$c[0], $c[1], $c[2], $c[3], $i * 10]);
    }
}
