<?php
/**
 * The name before SavNewsletters: the cron jobs already set on the server keep working. Same script, same lock (two jobs,
 * the old and the new one, never send the same messages twice): see savnewsletters-reminders.php.
 */
require __DIR__ . '/savnewsletters-reminders.php';
