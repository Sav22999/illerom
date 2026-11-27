<?php
/**
 * SavSplits — optional credentials.php (git-ignored, blocked from the browser). SavSplits uses the database, the accounts
 * and the settings of SavSchedules (../savschedules/credentials.php): this file is needed only to change some of them
 * for SavSplits. Every variable is optional; what is not set here comes from SavSchedules.
 */

// Sign in with SavAccount: the service of SavSchedules works if this address is added to its redirect addresses
//   https://www.illerom.eu/savsplits/api/?r=auth.sav.callback
// otherwise create a confidential service for SavSplits on savaccount.eu ("Manage services") and put it here:
// $savaccount_client_id = "";
// $savaccount_client_secret = "";

// $mail_config = null;   // SMTP, as in SavSchedules (only the emails of the account)
// $split_storage_dir = "";   // where the photos of the expenses are kept (default: savsplits/storage, blocked from the browser); best outside the web root
// $debug = false;
