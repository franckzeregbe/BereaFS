const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { HttpError, asyncHandler } = require('../utils/http');
const { formatBytes } = require('../utils/validation');
const { findVideo, listVideos, parseRange, assertVideoId } = require('../services/media');

const THUMBNAIL_COLORS = ['1e3a5f', 'c05621', '059669', '7c3aed', 'd97706'];

function findVideoOr404(videoDir, videoId) {
    const video = findVideo(videoDir, videoId);
    if (!video) throw new HttpError(404, 'Vidéo non trouvée.');
    return video;
}

function streamVideo(req, res, video) {
    const fileSize = video.stat.size;
    const baseHeaders = { 'Content-Type': video.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
    const pipe = (options) => {
        const stream = fs.createReadStream(video.filePath, options);
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
    };

    if (!req.headers.range) {
        res.writeHead(200, { ...baseHeaders, 'Content-Length': fileSize });
        return pipe();
    }

    const range = parseRange(req.headers.range, fileSize);
    if (!range) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        return res.end();
    }
    res.writeHead(206, {
        ...baseHeaders,
        'Content-Length': range.end - range.start + 1,
        'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`
    });
    pipe(range);
}

function createMediaRouter({ auth, uploaders }) {
    const router = express.Router();
    const { authenticate, requireTeacher } = auth;
    const { mediaUpload, videoUpload, videoDir } = uploaders;

    router.post('/admin/upload', authenticate, requireTeacher, mediaUpload.single('media'), (req, res) => {
        if (!req.file) throw new HttpError(400, 'Fichier manquant.');
        res.json({ success: true, url: `/uploads/${req.file.mediaType}/${req.file.filename}`, filename: req.file.originalname });
    });

    router.post('/upload', authenticate, requireTeacher, videoUpload.single('videoFile'), (req, res) => {
        if (!req.file) throw new HttpError(400, 'Aucun fichier reçu.');
        const videoId = path.parse(req.file.filename).name;
        res.status(201).json({
            success: true, message: 'Vidéo uploadée!',
            video: {
                id: videoId, originalName: req.file.originalname, fileName: req.file.filename,
                size: req.file.size, sizeHuman: formatBytes(req.file.size),
                url: `/api/stream/${videoId}`, uploadDate: new Date().toISOString()
            }
        });
    });

    router.get('/videos', authenticate, (req, res) => {
        const videos = listVideos(videoDir);
        res.json({ success: true, count: videos.length, videos });
    });

    // Suppression du fichier exact uniquement (l'ancienne version supprimait
    // tous les fichiers dont le nom *commençait* par l'identifiant).
    router.delete('/videos/:videoId', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const video = findVideoOr404(videoDir, req.params.videoId);
        await fs.promises.unlink(video.filePath);
        res.json({ success: true, message: 'Vidéo supprimée.', deleted: [path.basename(video.filePath)] });
    }));

    // Public : les balises <video> ne peuvent pas envoyer d'en-tête Authorization.
    router.get('/stream/:videoId', (req, res) => {
        streamVideo(req, res, findVideoOr404(videoDir, req.params.videoId));
    });

    router.get('/info/:videoId', (req, res) => {
        const { videoId } = req.params;
        const { stat, ext } = findVideoOr404(videoDir, videoId);
        const hash = crypto.createHash('sha256').update(stat.mtime.toISOString()).digest('hex').slice(0, 8);
        res.json({
            id: videoId, size: stat.size, sizeHuman: formatBytes(stat.size), created: stat.mtime, modified: stat.mtime,
            extension: ext, hash, url: `/api/stream/${videoId}`, poster: `/api/thumbnail/${videoId}?v=${hash}`
        });
    });

    router.get('/thumbnail/:videoId', (req, res) => {
        assertVideoId(req.params.videoId);
        const color = THUMBNAIL_COLORS[req.params.videoId.length % THUMBNAIL_COLORS.length];
        res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#${color}"/><circle cx="320" cy="180" r="50" fill="rgba(255,255,255,.2)"/><polygon points="300,160 300,200 350,180" fill="white"/><text x="320" y="330" text-anchor="middle" fill="rgba(255,255,255,.6)" font-family="sans-serif" font-size="16">BereaFS</text></svg>`
        );
    });

    return router;
}

module.exports = { createMediaRouter };
