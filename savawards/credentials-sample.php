<?php
/**
 * SavAwards — copy as credentials.php (git-ignored, blocked from the browser) and fill it in.
 * The tables are created by the API at its first request (prefix below). The local tests read another file through the
 * SAVAWARDS_CREDENTIALS environment variable.
 */

// MySQL 5.7+ / MariaDB 10.3+
$localhost_db = 'localhost';
$username_db = '';
$password_db = '';
$database_name = '';
$table_prefix = 'aw_';

// Who becomes master administrator (certificates, administrators) once their address is confirmed
$master_emails = [''];

// Sign in with SavAccount (optional): create a confidential service on savaccount.eu ("Manage services") with the
// redirect address https://www.illerom.eu/savawards/api/?r=auth.sav.callback
$savaccount_client_id = '';
$savaccount_client_secret = '';

// SMTP for the emails (confirming the address, new password, answers of the staff). null = the settings of the site
// (/.mail-config.php); false = no email at all. Same keys as there: smtp_host, smtp_port, smtp_encryption (ssl|tls),
// smtp_user, smtp_password, from_email, from_name, reply_to.
$mail_config = null;

$debug = false;
