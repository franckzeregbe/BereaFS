const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startTestServer, PASSWORD } = require('./helpers');

describe('Authentification', () => {
    let t;
    before(async () => { t = await startTestServer(); });
    after(() => t.close());

    const validRegistration = { name: 'Awa Traoré', email: 'Awa@Example.com', password: 'Secret123', phone: '+225 07', country: 'CI' };

    it('health répond ok avec la version', async () => {
        const res = await t.request('GET', '/api/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'ok');
        assert.match(res.body.version, /^\d+\.\d+\.\d+$/);
    });

    it('inscrit un étudiant et normalise l’email', async () => {
        const res = await t.request('POST', '/api/auth/register', { body: validRegistration });
        assert.equal(res.status, 201);
        assert.equal(res.body.user.email, 'awa@example.com');
        assert.equal(res.body.user.role, 'etudiant');
        assert.equal(res.body.user.avatar, 'AT');
        assert.ok(res.body.token);
    });

    it('refuse un email déjà utilisé', async () => {
        const res = await t.request('POST', '/api/auth/register', { body: validRegistration });
        assert.equal(res.status, 409);
    });

    it('refuse un mot de passe faible, un pays invalide et des types incorrects', async () => {
        const weak = await t.request('POST', '/api/auth/register', { body: { ...validRegistration, email: 'a@b.co', password: 'faible' } });
        assert.equal(weak.status, 400);
        const country = await t.request('POST', '/api/auth/register', { body: { ...validRegistration, email: 'c@b.co', country: 'Mali' } });
        assert.equal(country.status, 400);
        const wrongType = await t.request('POST', '/api/auth/register', { body: { ...validRegistration, email: 'd@b.co', name: { $ne: 1 } } });
        assert.equal(wrongType.status, 400);
    });

    it('renvoie 400 (et non 500) sur un JSON malformé', async () => {
        const malformed = await fetch(`${t.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
        assert.equal(malformed.status, 400);
    });

    it('connecte avec les bons identifiants et refuse les mauvais', async () => {
        const ok = await t.request('POST', '/api/auth/login', { body: { email: 'awa@example.com', password: 'Secret123' } });
        assert.equal(ok.status, 200);
        const bad = await t.request('POST', '/api/auth/login', { body: { email: 'awa@example.com', password: 'Mauvais123' } });
        assert.equal(bad.status, 401);
        const unknown = await t.request('POST', '/api/auth/login', { body: { email: 'personne@example.com', password: 'Secret123' } });
        assert.equal(unknown.status, 401);
    });

    it('protège /me et rejette un token signé avec un autre secret', async () => {
        assert.equal((await t.request('GET', '/api/auth/me')).status, 401);
        const forged = jwt.sign({ userId: 1, role: 'admin' }, 'autre-secret');
        assert.equal((await t.request('GET', '/api/auth/me', { token: forged })).status, 401);
    });

    it('révoque immédiatement l’accès d’un compte désactivé', async () => {
        const user = await t.createUser({ email: 'desactive@example.com' });
        assert.equal((await t.request('GET', '/api/auth/me', { token: user.token })).status, 200);
        await t.db.run('UPDATE users SET is_active = 0 WHERE id = ?', [user.id]);
        assert.equal((await t.request('GET', '/api/auth/me', { token: user.token })).status, 401);
    });

    it('utilise le rôle en base, pas celui du token', async () => {
        const user = await t.createUser({ email: 'promu@example.com', role: 'enseignant' });
        await t.db.run(`UPDATE users SET role = 'etudiant' WHERE id = ?`, [user.id]);
        const res = await t.request('GET', '/api/admin/students', { token: user.token });
        assert.equal(res.status, 403);
    });

    it('met à jour le profil ; un mauvais mot de passe actuel renvoie 400 (pas de déconnexion)', async () => {
        const user = await t.createUser({ email: 'profil@example.com' });
        const updated = await t.request('PUT', '/api/auth/profile', { token: user.token, body: { name: 'Koffi Mensah', country: 'GH' } });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.user.name, 'Koffi Mensah');
        assert.equal(updated.body.user.avatar, 'KM');

        const wrong = await t.request('PUT', '/api/auth/profile', { token: user.token, body: { currentPassword: 'Faux12345', newPassword: 'Nouveau123' } });
        assert.equal(wrong.status, 400);

        const changed = await t.request('PUT', '/api/auth/profile', { token: user.token, body: { currentPassword: PASSWORD, newPassword: 'Nouveau123' } });
        assert.equal(changed.status, 200);
        const relogin = await t.request('POST', '/api/auth/login', { body: { email: 'profil@example.com', password: 'Nouveau123' } });
        assert.equal(relogin.status, 200);
    });

    it('renvoie un 404 JSON pour une route API inconnue', async () => {
        const res = await t.request('GET', '/api/inexistant');
        assert.equal(res.status, 404);
        assert.equal(res.body.success, false);
    });
});
