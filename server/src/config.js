const path = require('path');
const crypto = require('crypto');

const SERVER_ROOT = path.join(__dirname, '..');
const PROJECT_ROOT = path.join(SERVER_ROOT, '..');

require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });

const DEFAULT_JWT_SECRET = 'votre-cle-super-secrete-changez-en-production';
const MIN_JWT_SECRET_LENGTH = 32;

// Les chemins relatifs de DB_PATH sont résolus depuis la racine du projet,
// quel que soit le dossier depuis lequel on lance node.
function resolveDbPath(value) {
    if (value === ':memory:') return value;
    const configured = value || './server/bereafs.db';
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
}

function resolveJwtSecret(secret, isProduction) {
    const isWeak = !secret || secret === DEFAULT_JWT_SECRET || secret.length < MIN_JWT_SECRET_LENGTH;
    if (!isWeak) return secret;
    if (isProduction) {
        throw new Error(`JWT_SECRET manquant ou faible (${MIN_JWT_SECRET_LENGTH} caractères minimum) en production.`);
    }
    // En dev : secret aléatoire par processus plutôt qu'une valeur connue publiquement.
    return { generated: crypto.randomBytes(48).toString('hex') };
}

function parseTrustProxy(value) {
    if (value === undefined || value === '') return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    const asNumber = Number(value);
    return Number.isInteger(asNumber) ? asNumber : value;
}

function loadConfig(env = process.env) {
    const nodeEnv = env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production';
    const jwt = resolveJwtSecret(env.JWT_SECRET, isProduction);

    return Object.freeze({
        nodeEnv,
        isProduction,
        isTest: nodeEnv === 'test',
        port: Number(env.PORT) || 3000,
        dbPath: resolveDbPath(env.DB_PATH),
        jwtSecret: typeof jwt === 'string' ? jwt : jwt.generated,
        jwtSecretGenerated: typeof jwt !== 'string',
        jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
        bcryptRounds: Number(env.BCRYPT_ROUNDS) || 12,
        corsOrigin: env.CORS_ORIGIN || '*',
        trustProxy: parseTrustProxy(env.TRUST_PROXY),
        uploadRoot: env.UPLOAD_DIR ? path.resolve(PROJECT_ROOT, env.UPLOAD_DIR) : path.join(SERVER_ROOT, 'uploads'),
        clientDir: path.join(PROJECT_ROOT, 'client'),
        maxFileSize: 2 * 1024 * 1024 * 1024,
        rateLimit: {
            windowMs: 15 * 60 * 1000,
            globalMax: Number(env.RATE_LIMIT_MAX) || 300,
            authMax: Number(env.AUTH_RATE_LIMIT_MAX) || 20
        },
        logLevel: env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info')
    });
}

module.exports = { loadConfig, resolveDbPath, DEFAULT_JWT_SECRET };
