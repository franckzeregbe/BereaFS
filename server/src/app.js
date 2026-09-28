const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { version } = require('../package.json');
const { createAuth } = require('./middleware/auth');
const { apiNotFound, createErrorHandler } = require('./middleware/errors');
const { createUploaders } = require('./services/media');
const { asyncHandler } = require('./utils/http');
const { createAuthRouter } = require('./routes/auth');
const { createCoursesRouter } = require('./routes/courses');
const { createQuizzesRouter } = require('./routes/quizzes');
const { createStatsRouter } = require('./routes/stats');
const { createMediaRouter } = require('./routes/media');

const TEXT_CONTENT_TYPE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg\+xml)/i;

// Ajoute charset=utf-8 aux réponses textuelles qui n'en déclarent pas (jamais aux vidéos/images binaires).
function forceUtf8(req, res, next) {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
        if (/^content-type$/i.test(name) && typeof value === 'string'
            && TEXT_CONTENT_TYPE.test(value) && !/charset/i.test(value)) {
            return setHeader(name, `${value}; charset=utf-8`);
        }
        return setHeader(name, value);
    };
    next();
}

function requestLogger(logger) {
    return (req, res, next) => {
        const started = process.hrtime.bigint();
        res.on('finish', () => {
            const ms = Number(process.hrtime.bigint() - started) / 1e6;
            logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
        });
        next();
    };
}

function securityHeaders(config) {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                // L'interface existante utilise des gestionnaires onclick/onsubmit.
                // À remplacer progressivement par des écouteurs externes avant un déploiement public.
                scriptSrcAttr: ["'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                mediaSrc: ["'self'", 'blob:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameSrc: ["'none'"],
                // Uniquement en production : en HTTP local (ex. test sur mobile via IP LAN) cela casserait le chargement.
                upgradeInsecureRequests: config.isProduction ? [] : null
            }
        },
        crossOriginEmbedderPolicy: false
    });
}

function mountStatic(app, config) {
    const client = (file) => path.join(config.clientDir, file);

    // sw.js et manifest.json DOIVENT être servis avant express.static
    // (sinon le navigateur met le service worker en cache 1 jour et bloque ses mises à jour).
    app.get('/client/sw.js', (req, res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate').type('application/javascript').sendFile(client('sw.js'));
    });
    app.get('/client/manifest.json', (req, res) => {
        res.set('Cache-Control', 'no-cache').type('application/manifest+json').sendFile(client('manifest.json'));
    });

    app.use('/client', express.static(config.clientDir, { maxAge: '1d', etag: true }));
    app.use('/uploads', express.static(config.uploadRoot, { maxAge: '1d', etag: true, dotfiles: 'deny' }));

    app.get('/', (req, res) => res.sendFile(client('index.html')));
    app.get('/academie', (req, res) => res.sendFile(client('academie.html')));
    // La page est publique ; ce sont les appels API qu'elle fait qui exigent le rôle enseignant/admin.
    app.get('/admin', (req, res) => res.sendFile(client('admin.html')));
}

/**
 * Construit l'application Express. Aucune écoute réseau ici : voir server.js.
 * @param {{ config: object, db: object, logger: object }} deps
 */
function createApp({ config, db, logger }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);

    if (!config.isTest) app.use(requestLogger(logger));
    app.use(forceUtf8);
    app.use(securityHeaders(config));
    app.use(cors({
        origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim()),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Range']
    }));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    const { windowMs, globalMax, authMax } = config.rateLimit;
    // Le streaming vidéo émet une requête par segment d'1 Mo : il est exclu de la limite globale.
    const isMediaRead = (req) => req.method === 'GET' && /^\/api\/(stream|thumbnail|info)\//.test(req.originalUrl);
    app.use('/api/', rateLimit({ windowMs, max: globalMax, standardHeaders: true, legacyHeaders: false, skip: isMediaRead }));
    const authLimiter = rateLimit({
        windowMs, max: authMax, standardHeaders: true, legacyHeaders: false,
        message: { success: false, error: 'Trop de tentatives. Veuillez réessayer plus tard.' }
    });

    app.use(compression({ filter: (req, res) => !isMediaRead(req) && compression.filter(req, res) }));
    mountStatic(app, config);

    const auth = createAuth({ config, db });
    const deps = { config, db, auth };

    app.get('/api/health', asyncHandler(async (req, res) => {
        await db.get('SELECT 1');
        res.json({ success: true, status: 'ok', version, uptime: process.uptime() });
    }));
    app.use('/api/auth', createAuthRouter({ ...deps, authLimiter }));
    app.use('/api', createCoursesRouter(deps));
    app.use('/api', createQuizzesRouter(deps));
    app.use('/api', createStatsRouter(deps));
    app.use('/api', createMediaRouter({ ...deps, uploaders: createUploaders(config) }));

    app.use('/api', apiNotFound);
    app.use(createErrorHandler(logger));
    return app;
}

module.exports = { createApp };
