// #302: serves the built website (the dist folder) with security headers.
// Azure used "pm2 serve --spa", which sends none of them. This file only uses
// Node itself (no npm packages), so the zip of dist keeps working as it is,
// without an npm install. Vite copies it from public/ into dist/ on every build.
//
// Start it with: node server.cjs (the startup command of the web app in
// Azure, see docs/deployment.md). Variables:
// - PORT: given by Azure; 8080 when it is not set.
// - API_URL: the address of the API, the same as VITE_API_URL of the build.
//   The browser may only call that origin. Without it, any https:// address
//   is allowed and a warning is written in the log.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
};

// What the pages may load. The fonts come from Google, the map tiles from
// OpenStreetMap and the zone pins are data: images; scripts and styles are
// only the files of the build. No page may show this site inside a frame.
function contentSecurityPolicy(apiUrl) {
    let api = 'https:';
    try {
        if (apiUrl) api = new URL(apiUrl).origin;
    } catch {
        // A wrong API_URL keeps "https:", the same as when it is not set
    }
    return [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https://tile.openstreetmap.org",
        `connect-src 'self' ${api}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join('; ');
}

function securityHeaders(apiUrl) {
    return {
        'Content-Security-Policy': contentSecurityPolicy(apiUrl),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Strict-Transport-Security': 'max-age=31536000',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    };
}

function createServer({ root = __dirname, apiUrl = process.env.API_URL } = {}) {
    const headers = securityHeaders(apiUrl);
    const index = path.join(root, 'index.html');

    function send(req, res, status, file, size, cacheControl) {
        res.writeHead(status, {
            ...headers,
            'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Content-Length': size,
            'Cache-Control': cacheControl,
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    }

    function fail(res, status, text, extra = {}) {
        res.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra });
        res.end(text);
    }

    return http.createServer((req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return fail(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
        }

        let pathname;
        try {
            pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        } catch {
            return fail(res, 400, 'Bad request');
        }

        // Only files inside the folder of the build, and never this file or a
        // hidden one (for example .env)
        const file = path.join(root, pathname);
        const relative = path.relative(root, file);
        const blocked = relative.startsWith('..') || path.isAbsolute(relative) || relative === 'server.cjs'
            || relative.split(path.sep).some((part) => part.startsWith('.'));
        if (blocked) return fail(res, 404, 'Not found');

        fs.stat(file, (error, stats) => {
            if (!error && stats.isFile()) {
                // The files in assets/ have a hash in their name, so they never change
                const cache = relative.startsWith(`assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
                return send(req, res, 200, file, stats.size, cache);
            }
            // A missing file (for example a script of an older build) is a 404,
            // so the page shows its own error instead of getting index.html
            if (path.extname(pathname)) return fail(res, 404, 'Not found');
            // Any other address is a route of the app (single-page app)
            fs.stat(index, (indexError, indexStats) => {
                if (indexError) return fail(res, 500, 'The website is not built');
                send(req, res, 200, index, indexStats.size, 'no-cache');
            });
        });
    });
}

// It starts when it is run with "node server.cjs", and also with pm2 (which
// loads the file in its own way, so require.main is not this file there). The
// tests only import createServer.
if (require.main === module || process.env.pm_id !== undefined) {
    const port = Number(process.env.PORT) || 8080;
    if (!process.env.API_URL) {
        console.warn('API_URL is not set: the pages may call any https:// address');
    }
    createServer().listen(port, () => console.log(`PARKEA website on port ${port}`));
}

module.exports = { createServer, contentSecurityPolicy };
