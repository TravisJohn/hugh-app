#!/usr/bin/env node
'use strict';

/**
 * build-hosted.js — prepares the app-hosted architecture page.
 * -----------------------------------------------------------------------------
 * Run from the app's predev/prebuild. Two jobs:
 *   1. Scan the repo → lib/architecture/data.generated.json (imported by the
 *      gated /api/architecture/{data,chat} routes, so it's bundled at build).
 *   2. Copy the dashboard UI (dashboard.html + ghost.png) into
 *      public/admin-architecture/ so /admin/architecture can iframe it.
 *
 * Single source of truth for the UI stays the tool's dashboard.html — the public
 * copy is generated, never hand-edited. Uses only Node built-ins (no install of
 * the tool's deps needed), so it runs cleanly on Vercel's build.
 */

const fs = require('fs');
const path = require('path');
const { runScan, PROJECT_ROOT } = require('./architecture-scan');

const TOOL_DIR = path.resolve(__dirname, '..');
const dataOut = path.join(PROJECT_ROOT, 'lib', 'architecture', 'data.generated.json');
const publicDir = path.join(PROJECT_ROOT, 'public', 'admin-architecture');

fs.mkdirSync(publicDir, { recursive: true });

console.log('[build-hosted] scanning repo…');
const data = runScan(dataOut); // also creates lib/architecture/ if missing

for (const file of ['dashboard.html', 'ghost.png']) {
  fs.copyFileSync(path.join(TOOL_DIR, file), path.join(publicDir, file));
}

console.log(
  `[build-hosted] ${data.components.length} files scanned → ${path.relative(PROJECT_ROOT, dataOut)}; ` +
  `UI copied → public/admin-architecture/`
);
