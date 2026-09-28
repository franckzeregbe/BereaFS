const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { HttpError } = require('../utils/http');
const { formatBytes } = require('../utils/validation');

// L'extension ET le type MIME doivent correspondre à une même catégorie :
// le MIME seul est fourni par le client et ne suffit pas (ex. .html déguisé en image/png).
const MEDIA_TYPES = {
    videos: {
        mimes: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'],
        exts: { '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska' }
    },
    audios: {
        mimes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'],
        exts: { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' }
    },
    images: {
        mimes: ['image/jpeg', 'image/png', 'image/webp'],
        exts: { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
    }
};

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const STREAM_CHUNK_SIZE = 1024 * 1024;
const MAX_STREAM_CHUNK = 8 * STREAM_CHUNK_SIZE;

function categorize(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    return Object.keys(MEDIA_TYPES).find((type) => {
        const spec = MEDIA_TYPES[type];
        return spec.exts[ext] && (spec.mimes.includes(file.mimetype) || file.mimetype === 'application/octet-stream');
    });
}

function createUploaders(config) {
    const videoDir = path.join(config.uploadRoot, 'videos');
    fs.mkdirSync(videoDir, { recursive: true });

    const filename = (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    };

    const mediaUpload = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                const dir = path.join(config.uploadRoot, file.mediaType);
                fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
            },
            filename
        }),
        limits: { fileSize: config.maxFileSize, files: 1 },
        fileFilter: (req, file, cb) => {
            const type = categorize(file);
            if (!type) return cb(new HttpError(400, 'Format non supporté.'));
            file.mediaType = type;
            cb(null, true);
        }
    });

    const videoUpload = multer({
        storage: multer.diskStorage({ destination: videoDir, filename }),
        limits: { fileSize: config.maxFileSize, files: 1 },
        fileFilter: (req, file, cb) => {
            if (categorize(file) !== 'videos') return cb(new HttpError(400, 'Format vidéo non supporté.'));
            cb(null, true);
        }
    });

    return { mediaUpload, videoUpload, videoDir };
}

function assertVideoId(videoId) {
    if (!VIDEO_ID_PATTERN.test(videoId)) throw new HttpError(400, 'ID vidéo invalide.');
}

/** Cherche le fichier exact `<videoId><ext>` ; renvoie null s'il n'existe pas. */
function findVideo(videoDir, videoId) {
    assertVideoId(videoId);
    for (const [ext, contentType] of Object.entries(MEDIA_TYPES.videos.exts)) {
        const filePath = path.join(videoDir, `${videoId}${ext}`);
        if (fs.existsSync(filePath)) {
            return { filePath, ext, contentType, stat: fs.statSync(filePath) };
        }
    }
    return null;
}

function listVideos(videoDir) {
    return fs.readdirSync(videoDir)
        .filter((f) => MEDIA_TYPES.videos.exts[path.extname(f).toLowerCase()])
        .map((f) => {
            const id = path.parse(f).name;
            const stat = fs.statSync(path.join(videoDir, f));
            return {
                id, fileName: f, originalName: f, size: stat.size, sizeHuman: formatBytes(stat.size),
                created: stat.mtime, url: `/api/stream/${id}`, thumbnailUrl: `/api/thumbnail/${id}`
            };
        })
        .sort((a, b) => b.created - a.created);
}

/**
 * Analyse un en-tête Range (une seule plage). Gère "bytes=a-b", "bytes=a-" et "bytes=-n".
 * @returns {{start:number,end:number}|null} null si la plage est invalide.
 */
function parseRange(header, fileSize) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (match[1] === '' && match[2] === '')) return null;

    let start;
    let end;
    if (match[1] === '') {
        const suffix = Number(match[2]);
        start = Math.max(fileSize - suffix, 0);
        end = fileSize - 1;
    } else {
        start = Number(match[1]);
        end = match[2] === '' ? start + STREAM_CHUNK_SIZE - 1 : Number(match[2]);
    }
    end = Math.min(end, start + MAX_STREAM_CHUNK - 1, fileSize - 1);
    if (start >= fileSize || start > end) return null;
    return { start, end };
}

module.exports = { createUploaders, findVideo, listVideos, parseRange, assertVideoId };
