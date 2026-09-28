const { loadConfig } = require('./src/config');
const { createLogger } = require('./src/logger');
const { openDatabase } = require('./src/db');
const { createApp } = require('./src/app');
const { version } = require('./package.json');

const SHUTDOWN_TIMEOUT_MS = 10000;

async function main() {
    let config;
    try {
        config = loadConfig();
    } catch (err) {
        console.error(`FATAL: ${err.message}`);
        process.exit(1);
    }
    const logger = createLogger(config.logLevel);

    if (config.jwtSecretGenerated) {
        logger.warn('JWT_SECRET absent ou faible : secret aléatoire généré (les sessions ne survivront pas au redémarrage). Définissez JWT_SECRET dans server/.env.');
    }
    if (config.isProduction && config.corsOrigin === '*') {
        logger.warn('CORS_ORIGIN=* en production : restreignez-le au domaine de la plateforme.');
    }

    const db = await openDatabase(config.dbPath);
    logger.info(`SQLite : ${config.dbPath}`);

    const app = createApp({ config, db, logger });
    const server = app.listen(config.port, () => {
        logger.info(`BereaFS v${version} (${config.nodeEnv}) démarré`);
        logger.info(`  Académie   http://localhost:${config.port}/academie`);
        logger.info(`  Plateforme http://localhost:${config.port}/client`);
        logger.info(`  Admin      http://localhost:${config.port}/admin`);
    });

    const shutdown = (signal) => {
        logger.info(`${signal} reçu, arrêt en cours...`);
        const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
        force.unref();
        server.close(async () => {
            await db.close().catch((err) => logger.error('Fermeture SQLite', err));
            process.exit(0);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (err) => logger.error('Promesse rejetée non gérée', err));
}

main().catch((err) => {
    console.error('FATAL: échec du démarrage', err);
    process.exit(1);
});
