<?php
/**
 * SavPodcasts — optional credentials.php (git-ignored, blocked from the browser). SavPodcasts uses the database, the
 * accounts and the settings of SavSchedules (../savschedules/credentials.php): this file is needed only to change some
 * of them, or to search Podcast Index. Every variable is optional; what is not set here comes from SavSchedules.
 */

// Searching podcasts: without keys the open catalogue of fyyd.de is used (no key needed). With the free keys of Podcast
// Index (https://api.podcastindex.org/signup) its catalogue is used instead: bigger, also open and non-profit.
// $podcastindex_key = "";
// $podcastindex_secret = "";

// How old a feed may be before it is read again when someone opens it (minutes; tools/refresh.php reads them from cron too)
// $refresh_minutes = 30;

// Sign in with SavAccount: the service of SavSchedules works if this address is added to its redirect addresses
//   https://www.illerom.eu/savpodcasts/api/?r=auth.sav.callback
// otherwise create a confidential service for SavPodcasts on savaccount.eu ("Manage services") and put it here:
// $savaccount_client_id = "";
// $savaccount_client_secret = "";

// $mail_config = null;   // SMTP, as in SavSchedules
// $debug = false;
