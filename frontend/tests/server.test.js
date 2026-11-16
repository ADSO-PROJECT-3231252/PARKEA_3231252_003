/**
 * @jest-environment node
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createServer, contentSecurityPolicy } from '../public/server.cjs';

// #302: the server of the built website (public/server.cjs, copied into dist).
// Each test starts it on a free port over a small fake build, with a secret
// file next to it that must never be served.
let folder;
let root;
let server;
let base;

beforeAll(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'parkea-'));
    root = path.join(folder, 'dist');
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'secret.txt'), 'outside the build');
    fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>PARKEA</title><div id="root"></div>');
    fs.writeFileSync(path.join(root, 'assets', 'index-abc123.js'), 'console.log("app");');
    fs.writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *');
    fs.writeFileSync(path.join(root, 'server.cjs'), '// the server itself');
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
    fs.writeFileSync(path.join(root, 'assets', '.secret'), 'SECRET=2');
});

afterAll(() => {
    fs.rmSync(folder, { recursive: true, force: true });
});

async function start(apiUrl) {
    server = createServer({ root, apiUrl });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
}

// fetch (and any full URL) cleans the address before sending it, so the
// attacks use http.get with the path apart, which sends it exactly as it is.
// They hide "/.." behind an encoded slash (%2f), which a URL does not clean
function rawGet(address) {
    return new Promise((resolve, reject) => {
        const { hostname, port } = new URL(base);
        // A server that stopped answering fails the test instead of hanging it
        http.get({ hostname, port, path: address, timeout: 2000 }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
        }).on('timeout', function onTimeout() {
            this.destroy(new Error(`no answer for ${address}`));
        }).on('error', reject);
    });
}

afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
});

describe('The server of the website (#302)', () => {
    test('every answer has the security headers', async () => {
        // Arrange
        await start('https://parkea-api.example.net/api');

        // Act
        const responses = await Promise.all(['/', '/assets/index-abc123.js', '/assets/missing.js'].map((p) => fetch(base + p)));

        // Assert
        for (const res of responses) {
            expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
            expect(res.headers.get('x-frame-options')).toBe('DENY');
            expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
            expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000');
            expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
            expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=(), payment=()');
        }
    });

    test('the routes of the app answer index.html, so a page can be reloaded', async () => {
        // Arrange
        await start();

        // Act
        const res = await fetch(`${base}/reservations/0c95d0fb-6caa-434d-bcc1-a335ede5ab00?from=list`);

        // Assert
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(res.headers.get('cache-control')).toBe('no-cache');
        expect(await res.text()).toContain('<div id="root"></div>');
    });

    test('the files of the build keep their type, and the ones in assets/ are cached for a year', async () => {
        // Arrange
        await start();

        // Act
        const script = await fetch(`${base}/assets/index-abc123.js`);
        const robots = await fetch(`${base}/robots.txt`);

        // Assert
        expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
        expect(script.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(robots.headers.get('content-type')).toBe('text/plain; charset=utf-8');
        expect(robots.headers.get('cache-control')).toBe('no-cache');
    });

    test('a missing file answers 404, not index.html', async () => {
        // Arrange
        await start();

        // Act
        const res = await fetch(`${base}/assets/index-old999.js`);

        // Assert
        expect(res.status).toBe(404);
        expect(await res.text()).not.toContain('<div id="root">');
    });

    test.each([
        ['/server.cjs', 'the server itself'],
        ['/.env', 'a hidden file'],
        ['/assets/.secret', 'a hidden file inside a folder'],
        ['/..%2fsecret.txt', 'a file outside the build, with an encoded slash'],
        ['/%2e%2e%2fsecret.txt', 'a file outside the build, with encoded dots and slash'],
        ['/assets%2f..%2f..%2fsecret.txt', 'a file outside the build, through assets/'],
    ])('%s (%s) answers 404', async (address) => {
        // Arrange
        await start();

        // Act
        const status = await rawGet(address);

        // Assert
        expect(status).toBe(404);
    });

    test('a null byte (%00) answers 400 and the server keeps working', async () => {
        // Arrange
        await start();

        // Act
        const status = await rawGet('/index%00.html');
        const next = await fetch(`${base}/`);

        // Assert
        expect(status).toBe(400);
        expect(next.status).toBe(200);
    });

    test('an address that cannot be decoded answers 400', async () => {
        // Arrange
        await start();

        // Act
        const res = await fetch(`${base}/%E0%A4%A`);

        // Assert
        expect(res.status).toBe(400);
    });

    test('only GET and HEAD are allowed, and HEAD has no body', async () => {
        // Arrange
        await start();

        // Act
        const post = await fetch(`${base}/`, { method: 'POST' });
        const head = await fetch(`${base}/zones`, { method: 'HEAD' });

        // Assert
        expect(post.status).toBe(405);
        expect(post.headers.get('allow')).toBe('GET, HEAD');
        expect(head.status).toBe(200);
        expect(await head.text()).toBe('');
    });
});

describe('The Content-Security-Policy (#302)', () => {
    test('scripts and styles only come from the build, and the fonts, map and API are allowed', () => {
        // Act
        const policy = contentSecurityPolicy('https://parkea-api.example.net/api');

        // Assert: the whole policy, so a directive cannot be lost or widened
        expect(policy).toBe([
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https://tile.openstreetmap.org",
            "connect-src 'self' https://parkea-api.example.net",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ].join('; '));
    });

    test.each([
        [undefined, 'it is not set'],
        ['not a url', 'it is not an address'],
    ])('without a valid API_URL (%s: %s) the pages may call any https:// address', (apiUrl) => {
        expect(contentSecurityPolicy(apiUrl)).toContain("connect-src 'self' https:;");
    });
});
