<?php
/**
 * SavSchedules — template of credentials.php (git-ignored, blocked from the browser): copy it to credentials.php and fill it in.
 * The tables are created by the API at its first answer.
 */

$localhost_db = "localhost";
$username_db = "";
$password_db = "";
$database_name = "";

$table_prefix = "sch_";

// Master admins (account emails, once confirmed): they see every account and schedule, and can block them
$master_emails = [];


// Sign in with SavAccount (optional): a confidential service created on savaccount.eu, "Manage services", with
//   redirect address  https://www.illerom.eu/savschedules/api/?r=auth.sav.callback
$savaccount_client_id = "";
$savaccount_client_secret = "";

// SMTP for confirmations and notifications; null uses the settings of the site (/.mail-config.php), false switches email off
$mail_config = null;
// $mail_config = [
//     'smtp_host' => 'smtp.example.com', 'smtp_port' => 465, 'smtp_encryption' => 'ssl',
//     'smtp_user' => 'noreply@example.com', 'smtp_password' => '...',
//     'from_email' => 'noreply@example.com', 'from_name' => 'SavSchedules',
// ];

$debug = false;
