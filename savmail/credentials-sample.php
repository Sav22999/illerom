<?php
/**
 * SavMail — optional credentials.php (git-ignored, blocked from the browser). SavMail uses the database, the accounts and
 * the settings of SavSchedules (../savschedules/credentials.php): this file is needed only for what is SavMail's own.
 * Every variable is optional; what is not set here comes from SavSchedules.
 */

// Sign in with SavAccount: the service of SavSchedules works if this address is added to its redirect addresses
//   https://www.illerom.eu/savmail/api/?r=auth.sav.callback
// otherwise create a confidential service for SavMail on savaccount.eu ("Manage services") and put it here:
// $savaccount_client_id = "";
// $savaccount_client_secret = "";

// Outlook, Hotmail, Live and Microsoft 365 accept only "Sign in with Microsoft" (see lib/oauth.php): an app registered on
// entra.microsoft.com, redirect address https://www.illerom.eu/savmail/api/?r=ml.oauth.callback
// $microsoft_client_id = "";
// $microsoft_client_secret = "";

// Only for tests on a computer: mail servers on this machine or the local network, any port, also without TLS. Never online.
// $savmail_private_hosts = false;

// $mail_config = null;   // SMTP of the platform's own emails (confirming the address…), as in SavSchedules
// $debug = false;
