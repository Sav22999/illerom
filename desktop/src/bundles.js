/*
 * SavOffice for Mac, Windows and Linux — every installed app as an app of its own. The way depends on the system:
 *   bundles-mac.js    macOS: a clone of SavOffice.app with its own name, icon and identifier (~/Applications/SavOffice)
 *   bundles-other.js  Windows: a shortcut in the Start menu with its own AppUserModelID and icon (its own place in the
 *                     taskbar); Linux: a .desktop file with its own icon, window class and the files it opens
 * Same functions in both: supported, ensure, remove, exists, tidy, launch, openFiles, quit, running, markRunning,
 * markStopped, openToolbox, dir, setTypesProvider, ownExt.
 */
module.exports = process.platform === 'darwin' ? require('./bundles-mac') : require('./bundles-other');
