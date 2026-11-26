<?php
/**
 * SavWhiteboard — optional credentials.php (git-ignored, blocked from the browser). SavWhiteboard uses the database, the
 * accounts and the settings of SavSchedules (../savschedules/credentials.php): this file is needed only to change some
 * of them for the boards. Every variable is optional; what is not set here comes from SavSchedules.
 */

// Sign in with SavAccount: the service of SavSchedules works if this address is added to its redirect addresses
//   https://www.illerom.eu/savwhiteboard/api/?r=auth.sav.callback
// otherwise create a confidential service for SavWhiteboard on savaccount.eu ("Manage services") and put it here:
// $savaccount_client_id = "";
// $savaccount_client_secret = "";

// Pictures (as in SavPresentations): where the files are kept (default: savwhiteboard/storage, blocked by .htaccess),
// the space of each account, the name the server gives itself to the portals, and the keys of Pexels and Pixabay
// (optional: without them the search uses Openverse and Wikimedia Commons)
// $storage_dir = '';
// $quota_mb = 500;
// $http_user_agent = '';
// $pexels_key = '';
// $pixabay_key = '';

// $mail_config = null;   // SMTP, as in SavSchedules
// $debug = false;
