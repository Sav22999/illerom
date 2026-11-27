<?php
/**
 * SavReads — optional credentials.php (git-ignored, blocked from the browser). SavReads uses the database, the accounts
 * and the settings of SavSchedules (../savschedules/credentials.php): this file is needed only to change some of them.
 * Every variable is optional; what is not set here comes from SavSchedules.
 */

// How old a feed may be before it is read again when someone opens the app (minutes; tools/refresh.php reads them from cron too)
// $refresh_minutes = 30;

// Sign in with SavAccount: the service of SavSchedules works if this address is added to its redirect addresses
//   https://www.illerom.eu/savreads/api/?r=auth.sav.callback
// otherwise create a confidential service for SavReads on savaccount.eu ("Manage services") and put it here:
// $savaccount_client_id = "";
// $savaccount_client_secret = "";

// $mail_config = null;   // SMTP, as in SavSchedules
// $debug = false;
