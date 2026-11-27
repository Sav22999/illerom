<?php
/**
 * SavDrive — template of credentials.php (git-ignored, blocked from the browser).
 * NOT NEEDED: without its own credentials.php SavDrive uses ../savdocuments/credentials.php (the same database, SavAccount,
 * master admins and email, always with its own tables dr_), as SavBooks does. Copy this file only to give it its own.
 * With SavAccount, add https://www.illerom.eu/savdrive/api/?r=auth.sav.callback to the redirect addresses of the service.
 * The tables are created by the API at its first answer.
 */

$localhost_db = "localhost";
$username_db = "";
$password_db = "";
$database_name = "";

$table_prefix = "dr_";

// Where the files are kept: a folder the web server can write, better OUTSIDE the web root (e.g. /home/site/savdrive-files).
// Empty = savdrive/storage/ (its .htaccess refuses every request, but a folder outside the site is safer).
$storage_dir = "";

// Master admins (account emails, once confirmed): from the admin panel of the app they choose the space of every account
// (500 MB unless changed), activate and deactivate accounts, and whether new accounts are activated at once
$master_emails = [];


// Sign in with SavAccount (optional): a confidential service created on savaccount.eu, "Manage services", with
//   redirect address  https://www.illerom.eu/savdrive/api/?r=auth.sav.callback
$savaccount_client_id = "";
$savaccount_client_secret = "";

// SMTP for confirmations and activations; null uses the settings of the site (/.mail-config.php), false switches email off
$mail_config = null;
// $mail_config = [
//     'smtp_host' => 'smtp.example.com', 'smtp_port' => 465, 'smtp_encryption' => 'ssl',
//     'smtp_user' => 'noreply@example.com', 'smtp_password' => '...',
//     'from_email' => 'noreply@example.com', 'from_name' => 'SavDrive',
// ];

$debug = false;
