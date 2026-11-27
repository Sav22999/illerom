<?php
/**
 * SavContacts — optional credentials.php (git-ignored, blocked from the browser). SavContacts uses the database, the
 * accounts and the settings of SavSchedules (../savschedules/credentials.php): this file is needed only to change some of
 * them for SavContacts. Every variable is optional; what is not set here comes from SavSchedules.
 */

// Sign in with SavAccount: the service of SavSchedules works if this address is added to its redirect addresses
//   https://www.illerom.eu/savcontacts/api/?r=auth.sav.callback
// otherwise create a confidential service for SavContacts on savaccount.eu ("Manage services") and put it here:
// $savaccount_client_id = "";
// $savaccount_client_secret = "";

// $mail_config = null;   // SMTP, as in SavSchedules (only the emails of the account)
// $debug = false;
