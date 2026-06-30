#!/usr/bin/env node
'use strict';

/**
 * watch.js
 * -----------------------------------------------------------------------------
 * Live mode for the architecture dashboard. Watches the Hugh source roots with
 * chokidar and re-runs the static scan (rewriting architecture-data.json) on any
 * add / change / unlink. Scans are debounced so a burst of saves coalesces into
 * a single rescan.
 *
 * The dashboard polls architecture-data.json every 5s and re-renders only the
 * parts that changed — this process just keeps the JSON fresh.
 *
 * Usage: node scripts/watch.js   (or: npm run watch)
 */

const path = require('path');
const chokidar = require('chokidar');
const { runScan, PROJECT_ROOT, SOURCE_ROOTS } = require('./architecture-scan');

const DEBOUNCE_MS = 300;
const WATCH_EXTS = ['ts', 'tsx', 'js', 'jsx', 'mjs'];

function scanNow(reason) {
  try {
    const data = runScan();
    const stamp = new Date().toLocaleTimeString();
    console.log(
      `[watch ${stamp}] rescanned (${reason}) -> ${data.components.length} files, ${data.edges.length} edges`
    );
  } catch (err) {
    console.error(`[watch] scan failed: ${err.message}`);
  }
}

const watchPaths = SOURCE_ROOTS.map((root) => path.join(PROJECT_ROOT, root));

const watcher = chokidar.watch(watchPaths, {
  ignored: (p) => p.includes('node_modules') || /(^|[\\/])\../.test(path.basename(p)),
  ignoreInitial: true,
  persistent: true,
});

let timer = null;
let pending = new Set();

function schedule(event, filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!WATCH_EXTS.includes(ext)) return;
  pending.add(`${event}:${path.basename(filePath)}`);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const reason = [...pending].slice(0, 3).join(', ') + (pending.size > 3 ? ` +${pending.size - 3}` : '');
    pending = new Set();
    timer = null;
    scanNow(reason);
  }, DEBOUNCE_MS);
}

watcher
  .on('add', (p) => schedule('add', p))
  .on('change', (p) => schedule('change', p))
  .on('unlink', (p) => schedule('unlink', p))
  .on('ready', () => {
    console.log(`[watch] watching ${SOURCE_ROOTS.join(', ')} (${WATCH_EXTS.join('/')})`);
    scanNow('initial');
  })
  .on('error', (err) => console.error(`[watch] error: ${err.message}`));

process.on('SIGINT', () => {
  console.log('\n[watch] stopping.');
  watcher.close().then(() => process.exit(0));
});
