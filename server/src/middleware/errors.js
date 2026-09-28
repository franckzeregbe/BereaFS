const multer = require('multer');
const { HttpError } = require('../utils/http');

const apiNotFound = (req, res) => {
    res.status(404).json({ success: false, error: 'Route introuvable.' });
};

// Ne jamais exposer les erreurs internes au client ; tout est journalisé côté serveur.
const createErrorHandler = (logger) => (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof HttpError) {
        return res.status(err.status).json({ success: false, error: err.message });
    }
    if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux. Max : 2 Go' : 'Erreur upload.';
        return res.status(400).json({ success: false, error: message });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, error: 'JSON invalide.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, error: 'Requête trop volumineuse.' });
    }

    logger.error(`${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
};

module.exports = { apiNotFound, createErrorHandler };
