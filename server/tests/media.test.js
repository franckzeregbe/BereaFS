const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');
const { parseRange } = require('../src/services/media');

const VIDEO_BYTES = Buffer.alloc(3 * 1024 * 1024, 7);

function form(name, filename, type, content = 'data') {
    const fd = new FormData();
    fd.append(name, new Blob([content], { type }), filename);
    return fd;
}

describe('parseRange', () => {
    it('gère les plages ouvertes, fermées et suffixes', () => {
        assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
        assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
        assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
    });
    it('rejette les plages invalides', () => {
        assert.equal(parseRange('bytes=1000-', 1000), null);
        assert.equal(parseRange('bytes=-', 1000), null);
        assert.equal(parseRange('items=0-1', 1000), null);
        assert.equal(parseRange('bytes=50-10', 1000), null);
    });
});

describe('Médias', () => {
    let t;
    let teacher;
    let student;
    let videoDir;

    before(async () => {
        t = await startTestServer({ RATE_LIMIT_MAX: '10' });
        teacher = await t.createUser({ email: 'prof@media.com', role: 'enseignant' });
        student = await t.createUser({ email: 'eleve@media.com' });
        videoDir = path.join(t.uploadDir, 'videos');
        fs.writeFileSync(path.join(videoDir, 'video.mp4'), VIDEO_BYTES);
        fs.writeFileSync(path.join(videoDir, 'video-2.mp4'), VIDEO_BYTES);
    });
    after(() => t.close());

    it('streame avec les en-têtes Range corrects', async () => {
        const res = await t.request('GET', '/api/stream/video', { headers: { Range: 'bytes=0-' } });
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('content-type'), 'video/mp4');
        assert.equal(res.headers.get('content-range'), `bytes 0-${1024 * 1024 - 1}/${VIDEO_BYTES.length}`);

        const full = await fetch(`${t.baseUrl}/api/stream/video`);
        assert.equal(full.status, 200);
        assert.equal((await full.arrayBuffer()).byteLength, VIDEO_BYTES.length);

        const bad = await t.request('GET', '/api/stream/video', { headers: { Range: `bytes=${VIDEO_BYTES.length}-` } });
        assert.equal(bad.status, 416);
    });

    it('le streaming n’est pas bloqué par la limite de débit globale', async () => {
        for (let i = 0; i < 10; i += 1) {
            const res = await t.request('GET', '/api/stream/video', { headers: { Range: 'bytes=0-10' } });
            assert.equal(res.status, 206);
        }
    });

    it('rejette les identifiants avec traversée de chemin', async () => {
        const res = await t.request('GET', '/api/stream/..%2F..%2Fserver');
        assert.equal(res.status, 400);
    });

    it('supprime uniquement la vidéo exacte (pas celles au même préfixe)', async () => {
        const res = await t.request('DELETE', '/api/videos/video', { token: teacher.token });
        assert.equal(res.status, 200);
        assert.ok(!fs.existsSync(path.join(videoDir, 'video.mp4')));
        assert.ok(fs.existsSync(path.join(videoDir, 'video-2.mp4')), 'video-2.mp4 ne doit pas être supprimée');
    });

    it('un étudiant ne peut ni uploader ni supprimer', async () => {
        const upload = await t.request('POST', '/api/admin/upload', { token: student.token, body: form('media', 'a.mp4', 'video/mp4') });
        assert.equal(upload.status, 403);
        const del = await t.request('DELETE', '/api/videos/video-2', { token: student.token });
        assert.equal(del.status, 403);
    });

    it('accepte une vidéo valide et la range dans videos/', async () => {
        const res = await t.request('POST', '/api/admin/upload', { token: teacher.token, body: form('media', 'cours.mp4', 'video/mp4') });
        assert.equal(res.status, 200);
        assert.match(res.body.url, /^\/uploads\/videos\/[\w-]+\.mp4$/);
    });

    it('refuse un fichier HTML déguisé en image (XSS stockée)', async () => {
        const res = await t.request('POST', '/api/admin/upload', {
            token: teacher.token, body: form('media', 'piege.html', 'image/png', '<script>alert(1)</script>')
        });
        assert.equal(res.status, 400);
        const leftovers = fs.readdirSync(t.uploadDir, { recursive: true }).filter((f) => String(f).endsWith('.html'));
        assert.deepEqual(leftovers, []);
    });

    it('sert la page /admin sans en-tête Authorization', async () => {
        const res = await t.request('GET', '/admin');
        assert.equal(res.status, 200);
        assert.match(res.text, /Gestion Vidéos/);
    });
});
