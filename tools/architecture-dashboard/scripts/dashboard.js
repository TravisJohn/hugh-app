#!/usr/bin/env node
'use strict';

/**
 * dashboard.js — one-command launcher.
 * -----------------------------------------------------------------------------
 * `npm run dashboard` does everything: an initial scan so data is ready
 * immediately, a chokidar watcher for live re-scans on save, the HTTP server,
 * and it opens your browser to the dashboard. Ctrl+C stops it.
 *
 * This is the everyday entry point — no need to remember separate scan/serve/
 * watch commands. Stays fully standalone; touches no app code.
 */

const { spawn } = require('child_process');
const { runScan } = require('./architecture-scan');

const PORT = process.env.PORT || 4317;
const url = `http://localhost:${PORT}`;

// 1) Scan once up front so architecture-data.json exists before the page loads.
console.log('[dashboard] initial scan…');
runScan();

// 2) Live watcher (re-scans on save) + HTTP server, in this same process.
require('./watch');
require('./serve');

// 3) Open the default browser (best-effort, cross-platform).
function openBrowser() {
  try {
    const [cmd, args] =
      process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
    console.log(`[dashboard] opened ${url}`);
  } catch {
    console.log(`[dashboard] open ${url} in your browser`);
  }
}
setTimeout(openBrowser, 700);
