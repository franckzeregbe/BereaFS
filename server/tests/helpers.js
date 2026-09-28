const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/config');
const { createLogger } = require('../src/logger');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

const PASSWORD = 'Motdepasse1';

/** Démarre une instance isolée (SQLite en mémoire + dossier d'upload temporaire). */
async function startTestServer(envOverrides = {}) {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bereafs-test-'));
    const config = loadConfig({
        NODE_ENV: 'test',
        DB_PATH: ':memory:',
        JWT_SECRET: 'test-secret-'.padEnd(48, 'x'),
        BCRYPT_ROUNDS: '4',
        UPLOAD_DIR: uploadDir,
        ...envOverrides
    });
    const db = await openDatabase(config.dbPath);
    const app = createApp({ config, db, logger: createLogger('silent') });
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function request(method, url, { token, body, headers = {} } = {}) {
        const isForm = body instanceof FormData;
        const res = await fetch(baseUrl + url, {
            method,
            headers: {
                ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers
            },
            body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = undefined; }
        return { status: res.status, headers: res.headers, body: json, text };
    }

    async function createUser({ email, role = 'etudiant', name = 'Test User', isActive = 1 }) {
        const hash = await bcrypt.hash(PASSWORD, 4);
        const { lastID } = await db.run(
            'INSERT INTO users (name, email, password, phone, country, role, avatar, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, hash, '+225 00', 'CI', role, 'TU', isActive]
        );
        const login = await request('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
        return { id: lastID, token: login.body && login.body.token };
    }

    async function close() {
        await new Promise((resolve) => server.close(resolve));
        await db.close();
        fs.rmSync(uploadDir, { recursive: true, force: true });
    }

    return { baseUrl, db, config, uploadDir, request, createUser, close };
}

module.exports = { startTestServer, PASSWORD };
