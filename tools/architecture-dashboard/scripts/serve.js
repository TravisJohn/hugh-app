#!/usr/bin/env node
'use strict';

/**
 * serve.js
 * -----------------------------------------------------------------------------
 * Local server for the architecture dashboard. Serves the static dashboard and
 * a few read-only/admin endpoints (all localhost, single-user dev tool):
 *
 *   GET  /                      -> dashboard.html
 *   GET  /<file>                -> static assets in this tool dir
 *   GET  /api/config            -> { adminUrl, assistant:{configured,model} }
 *   GET  /api/source?path=...   -> raw source of a repo file (for the code panel)
 *   POST /api/assistant         -> { messages } => OpenAI-backed admin assistant
 *
 * Browsers block fetch() on file:// pages, so the dashboard must be served over
 * HTTP. Uses only Node built-ins + global fetch (Node 18+) — no extra deps.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleAssistant, assistantStatus } = require('./assistant');

const ROOT = path.resolve(__dirname, '..');           // tools/architecture-dashboard
const PROJECT_ROOT = path.resolve(ROOT, '..', '..');  // repo root
const PORT = Number(process.env.PORT) || 4317;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.sql', '.md']);

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5 * 1024 * 1024) reject(new Error('body too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// --- GET /api/source?path=repo/relative/file -------------------------------
function isSensitive(rel) {
  const base = rel.replace(/\\/g, '/').toLowerCase().split('/').pop();
  return base.startsWith('.env') || /\.(pem|key|p12|pfx|crt|cer)$/.test(base) ||
    ['.npmrc', '.netrc', 'id_rsa', 'id_ed25519', 'credentials', '.pgpass'].includes(base) ||
    rel.replace(/\\/g, '/').toLowerCase().split('/').includes('.git');
}

function serveSource(res, query) {
  const rel = query.get('path') || '';
  const abs = path.resolve(PROJECT_ROOT, rel);
  if (!abs.startsWith(PROJECT_ROOT)) return sendJson(res, 403, { error: 'forbidden' });
  if (isSensitive(rel)) return sendJson(res, 403, { error: 'blocked (possible secrets)' });
  if (!SOURCE_EXTS.has(path.extname(abs))) return sendJson(res, 400, { error: 'unsupported file type' });
  fs.readFile(abs, 'utf8', (err, body) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    sendJson(res, 200, { path: rel, ext: path.extname(abs).slice(1), code: body.slice(0, 200000) });
  });
}

// --- static files -----------------------------------------------------------
function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'dashboard.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(filePath, (err, body) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);

  try {
    if (p === '/api/config') {
      const s = assistantStatus();
      return sendJson(res, 200, { adminUrl: s.adminUrl, assistant: { configured: s.configured, model: s.model } });
    }
    if (p === '/api/source' && req.method === 'GET') {
      return serveSource(res, url.searchParams);
    }
    if (p === '/api/assistant' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!Array.isArray(body.messages)) return sendJson(res, 400, { error: 'messages[] required' });
      const result = await handleAssistant({ messages: body.messages });
      return sendJson(res, 200, result);
    }
    if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'no such endpoint' });

    // Serve the app's public assets (e.g. the Hugh ghost mascot) read-only.
    if (p.startsWith('/public/')) {
      const abs = path.join(PROJECT_ROOT, p.replace(/^\/+/, ''));
      if (!abs.startsWith(path.join(PROJECT_ROOT, 'public'))) { res.writeHead(403).end('Forbidden'); return; }
      return fs.readFile(abs, (err, body) => {
        if (err) { res.writeHead(404).end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
        res.end(body);
      });
    }

    return serveStatic(res, p);
  } catch (err) {
    return sendJson(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  const s = assistantStatus();
  console.log(`[serve] dashboard at http://localhost:${PORT}`);
  console.log(`[serve] assistant: ${s.configured ? 'ready (' + s.model + ')' : 'NOT configured — add OPENAI_API_KEY to .env.local'}`);
  console.log(`[serve] admin iframe target: ${s.adminUrl}`);
});
