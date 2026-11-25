<?php
/**
 * SavPresentations — template of credentials.php (git-ignored, blocked from the browser).
 * Copy this file to credentials.php and fill it in: the tables are created at the first visit.
 */

$localhost_db = "localhost";
$username_db = "";
$password_db = "";
$database_name = "";

$table_prefix = "sp_";

// Master admins: their account email, once confirmed. They open the Admin panel.
$master_emails = [];

// Sign in with Google (optional): OAuth client ID of type "Web application"
$google_client_id = "";

// Sign in with SavAccount (optional): a confidential service created on savaccount.eu, "Manage services", with
//   redirect address  https://www.illerom.eu/savpresentations/api/?r=auth.sav.callback
$savaccount_client_id = "";
$savaccount_client_secret = "";

// SMTP. null = the site's own settings (/.mail-config.php); false = no email at all (local tests: links go to the PHP log)
$mail_config = null;
// $mail_config = [
//     'smtp_host' => 'smtp.example.com', 'smtp_port' => 465, 'smtp_encryption' => 'ssl',
//     'smtp_user' => 'noreply@example.com', 'smtp_password' => '...',
//     'from_email' => 'noreply@example.com', 'from_name' => 'SavPresentations',
// ];

// Search of free pictures and videos: Openverse and Wikimedia Commons need no key. With a (free) key also Pexels and Pixabay.
$pexels_key = "";
$pixabay_key = "";
// How the server introduces itself to the portals above (Wikimedia asks for a name and a contact page)
$http_user_agent = "";

// Pictures and videos: total space of each person in MB (a single picture: 15 MB at most, a video: 150 MB), and the folder ("" = storage/ here; better outside the site, if the hosting allows it)
$quota_mb = 500;
$storage_dir = "";

$debug = false;
