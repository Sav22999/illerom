<?php
/**
 * SavForms — optional credentials.php (git-ignored, blocked from the browser). SavForms uses the database, the accounts
 * and the settings of SavSchedules (../savschedules/credentials.php): this file is needed only to change some of them
 * for SavForms. Every variable is optional; what is not set here comes from SavSchedules.
 */

// Sign in with SavAccount: the service of SavSchedules (SavOffice) works if this address is added to its redirect addresses
//   https://www.illerom.eu/savforms/api/?r=auth.sav.callback
// otherwise create a confidential service for SavForms on savaccount.eu ("Manage services") and put it here:
// $savaccount_client_id = "";
// $savaccount_client_secret = "";

// $mail_config = null;   // SMTP, as in SavSchedules (also used for the emails "a new answer arrived")
// $debug = false;
