const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { SCHEMA } = require('./schema');

function openRaw(dbPath) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    return new Promise((resolve, reject) => {
        const raw = new sqlite3.Database(dbPath, (err) => (err ? reject(err) : resolve(raw)));
    });
}

/**
 * Ouvre la base, applique les PRAGMA et le schéma, et renvoie une API à promesses.
 * @param {string} dbPath
 */
async function openDatabase(dbPath) {
    const raw = await openRaw(dbPath);

    const get = (sql, params = []) => new Promise((resolve, reject) => {
        raw.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
    const all = (sql, params = []) => new Promise((resolve, reject) => {
        raw.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
    const run = (sql, params = []) => new Promise((resolve, reject) => {
        raw.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
    const close = () => new Promise((resolve, reject) => {
        raw.close((err) => (err ? reject(err) : resolve()));
    });

    // Une seule connexion SQLite : on sérialise les transactions pour
    // qu'elles ne s'entremêlent pas entre requêtes concurrentes.
    let queue = Promise.resolve();
    const transaction = (work) => {
        const result = queue.then(async () => {
            await run('BEGIN IMMEDIATE');
            try {
                const value = await work();
                await run('COMMIT');
                return value;
            } catch (err) {
                await run('ROLLBACK').catch(() => {});
                throw err;
            }
        });
        queue = result.catch(() => {});
        return result;
    };

    await run('PRAGMA foreign_keys = ON');
    await run('PRAGMA busy_timeout = 5000');
    if (dbPath !== ':memory:') await run('PRAGMA journal_mode = WAL');
    for (const statement of SCHEMA) {
        await run(statement);
    }

    return { get, all, run, close, transaction };
}

module.exports = { openDatabase };
