/*
 * SavOffice for Mac, Windows and Linux — who this process is. The same code runs as the Toolbox (SavOffice.app) or as one app of the suite
 * (SavDocuments.app…, made by bundles.js: a clone of SavOffice.app with its own name, icon and identifier, so that the
 * Dock, ⌘Tab and the menu bar show it as an app of its own). An app knows its slug from the key SavOfficeApp of its
 * Info.plist on macOS, from --savoffice-app=<slug> on Windows and Linux (its shortcut) and when started by hand.
 *
 *   APP      the slug of the app, or null for the Toolbox
 *   HOME     the folder shared by all: settings, installed files (apps/), the session (session.json), the profiles
 *   PROFILE  the browser profile of this process (Chromium allows one process per profile): HOME for the Toolbox,
 *            HOME/Profiles/<slug> for an app
 *   ORIGIN   the site of the apps
 * Tests: SAVOFFICE_USERDATA and SAVOFFICE_ORIGIN (or the keys SavOfficeHome / SavOfficeOrigin that bundles.js writes in the
 * Info.plist of the apps when the Toolbox runs with them).
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let plist = '';
try { plist = fs.readFileSync(path.resolve(process.execPath, '../../Info.plist'), 'utf8'); } catch { /* not in a bundle */ }
const key = (k) => (plist.match(new RegExp('<key>' + k + '</key>\\s*<string>([^<]*)</string>')) || [])[1] || null;
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || null;

const APP = (key('SavOfficeApp') || arg('savoffice-app') || '').replace(/[^a-z]/g, '') || null;
// tests: the folder and the site from the environment, or (apps made by a test Toolbox) from the Info.plist on macOS or
// the arguments of their shortcut on Windows and Linux
const HOME = process.env.SAVOFFICE_USERDATA || key('SavOfficeHome') || arg('savoffice-home') || path.join(app.getPath('appData'), 'SavOffice');
const ORIGIN = (process.env.SAVOFFICE_ORIGIN || key('SavOfficeOrigin') || arg('savoffice-origin') || 'https://www.illerom.eu').replace(/\/+$/, '');
const PROFILE = APP ? path.join(HOME, 'Profiles', APP) : HOME;
const TOOLBOX_ID = 'eu.illerom.savoffice'; // (a test Toolbox runs from its own copy: see bundles.js for the apps it makes)

const testing = !!(process.env.SAVOFFICE_USERDATA || key('SavOfficeHome') || arg('savoffice-home'));
// automatic tests (tools/smoke.js): the apps a test Toolbox opens know it from its environment (Windows, Linux) or from their
// Info.plist (macOS: an app opened by "open" does not get the environment of whoever opens it)
const ci = testing && !!(process.env.SAVOFFICE_CI || key('SavOfficeCI'));

module.exports = { APP, HOME, ORIGIN, PROFILE, TOOLBOX_ID, testing, ci };
