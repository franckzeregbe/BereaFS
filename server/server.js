require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// ==================== CONFIGURATION ====================
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads', 'videos');
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 Go

// JWT secret obligatoire en production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'votre-cle-super-secrete-changez-en-production') {
    console.warn('⚠️  WARNING: JWT_SECRET is weak or default. Set a strong secret in .env!');
}

// S'assurer que le dossier uploads existe
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();

// ==================== SECURITY HEADERS ====================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Strict CORS
app.use(require('cors')({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting global
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', globalLimiter);

// Rate limiting strict pour auth
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
    standardHeaders: true,
    legacyHeaders: false
});

// ==================== STATICS ====================

app.use('/client', express.static(path.join(__dirname, '..', 'client'), {
    maxAge: '1d',
    etag: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '1d',
    etag: true
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.get('/client/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, '..', 'client', 'sw.js'));
});
app.get('/client/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(__dirname, '..', 'client', 'manifest.json'));
});

// ==================== MULTER CONFIG ====================

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        if (!['.mp4','.webm','.ogg','.mov','.avi','.mkv'].includes(ext)) {
            return cb(new Error('Extension non autorisée'));
        }
        cb(null, `video-${uniqueId}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo','video/x-matroska'];
        const ext = path.extname(file.originalname).toLowerCase();
        const extAllowed = ['.mp4','.webm','.ogg','.mov','.avi','.mkv'];
        if (allowed.includes(file.mimetype) || extAllowed.includes(ext)) cb(null, true);
        else cb(new Error('Format vidéo non supporté'));
    }
});

const adminStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = file.mimetype.startsWith('video') ? 'videos' : file.mimetype.startsWith('audio') ? 'audios' : 'uploads';
        const dir = path.join(__dirname, 'uploads', type);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
});

const adminUpload = multer({
    storage: adminStorage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4','video/webm','video/ogg','audio/mpeg','audio/wav','audio/ogg','image/jpeg','image/png','video/quicktime','video/x-msvideo','video/x-matroska'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Format non supporté'));
    }
});

// ==================== DATABASE ====================

const dbPath = process.env.DB_PATH || './bereafs.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('SQLite error:', err.message);
    else console.log('SQLite:', dbPath);
});
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');

const initTables = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL, phone TEXT, country TEXT DEFAULT 'CI',
            role TEXT DEFAULT 'etudiant' CHECK(role IN ('etudiant','enseignant','admin')),
            avatar TEXT, is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL, description TEXT, tag TEXT DEFAULT 'fondements',
            status TEXT DEFAULT 'draft', hours INTEGER DEFAULT 0,
            lessons_count INTEGER DEFAULT 0, created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL, num INTEGER NOT NULL, title TEXT NOT NULL,
            content TEXT, scripture TEXT, duration TEXT DEFAULT '45 min',
            video_url TEXT, audio_url TEXT, has_video INTEGER DEFAULT 0,
            has_audio INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS lesson_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL, completed INTEGER DEFAULT 0,
            score INTEGER, watched_at DATETIME,
            UNIQUE(user_id, lesson_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (lesson_id) REFERENCES lessons(id),
            FOREIGN KEY (course_id) REFERENCES courses(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL, level INTEGER DEFAULT 1,
            level_name TEXT DEFAULT 'Debutant', pass_score INTEGER DEFAULT 70,
            description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS quiz_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL,
            question TEXT NOT NULL, options TEXT NOT NULL,
            answer INTEGER NOT NULL, explanation TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS quiz_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL, quiz_id INTEGER NOT NULL,
            score INTEGER NOT NULL, total INTEGER NOT NULL,
            passed INTEGER DEFAULT 0, answers TEXT,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
        )`);
    });
};
initTables();

// DB helpers
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
    });
});

// ==================== AUTH MIDDLEWARE ====================

const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });
    jwt.verify(token, JWT_SECRET || 'fallback-secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide ou expiré.' });
        req.user = user;
        next();
    });
};

const requireRole = (roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé.' });
    next();
};

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { name, email, password, phone, country } = req.body;
        // Input sanitization
        if (!name || !email || !password || !phone || !country) return res.status(400).json({ error: 'Tous les champs requis.' });
        const sanitizedName = name.trim().replace(/[<>]/g, '');
        const sanitizedEmail = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) return res.status(400).json({ error: 'Email invalide.' });
        if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 min).' });

        const existing = await dbGet('SELECT id FROM users WHERE email = ?', [sanitizedEmail]);
        if (existing) return res.status(409).json({ error: 'Cet email existe déjà.' });

        const hashed = await bcrypt.hash(password, 12);
        const result = await dbRun(
            'INSERT INTO users (name, email, password, phone, country, avatar) VALUES (?, ?, ?, ?, ?, ?)',
            [sanitizedName, sanitizedEmail, hashed, phone.trim(), country, sanitizedName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()]
        );
        const token = jwt.sign({ userId: result.lastID, email: sanitizedEmail, role: 'etudiant' }, JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });

        res.status(201).json({
            success: true, message: 'Compte créé!', token,
            user: { id: result.lastID, name: sanitizedName, email: sanitizedEmail, role: 'etudiant', avatar: sanitizedName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
        const user = await dbGet('SELECT * FROM users WHERE email = ? AND is_active = 1', [email.trim().toLowerCase()]);
        if (!user) return res.status(401).json({ error: 'Identifiants incorrects.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Identifiants incorrects.' });

        const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET || 'fallback-secret', { expiresIn: '7d' });
        res.json({
            success: true, message: 'Connexion réussie!', token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, country: user.country, phone: user.phone }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
        const user = await dbGet('SELECT id, name, email, role, avatar, country, phone, created_at FROM users WHERE id = ?', [req.user.userId]);
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ==================== COURSE ROUTES ====================

app.get('/api/courses', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const courses = await dbAll(`
            SELECT c.*, COUNT(l.id) as total_lessons,
                   COALESCE(p.completed_count, 0) as completed_lessons
            FROM courses c
            LEFT JOIN lessons l ON c.id = l.course_id
            LEFT JOIN (SELECT course_id, COUNT(*) as completed_count FROM lesson_progress WHERE user_id = ? AND completed = 1 GROUP BY course_id) p ON c.id = p.course_id
            WHERE c.status != 'draft' OR c.created_by = ?
            GROUP BY c.id
        `, [userId, userId]);
        res.json({ success: true, courses });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.get('/api/courses/:id', authenticate, async (req, res) => {
    try {
        const courseId = req.params.id;
        const userId = req.user.userId;
        if (!/^\d+$/.test(courseId)) return res.status(400).json({ error: 'ID invalide.' });
        const course = await dbGet('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).json({ error: 'Cours non trouvé.' });
        const lessons = await dbAll(`
            SELECT l.*, lp.completed, lp.watched_at
            FROM lessons l
            LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
            WHERE l.course_id = ? ORDER BY l.num
        `, [userId, courseId]);
        const quizzes = await dbAll('SELECT id, level, level_name, pass_score FROM quizzes WHERE course_id = ?', [courseId]);
        res.json({ success: true, course, lessons, quizzes });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.post('/api/lessons/:id/complete', authenticate, async (req, res) => {
    try {
        const lessonId = req.params.id;
        const userId = req.user.userId;
        if (!/^\d+$/.test(lessonId)) return res.status(400).json({ error: 'ID invalide.' });
        const lesson = await dbGet('SELECT course_id FROM lessons WHERE id = ?', [lessonId]);
        if (!lesson) return res.status(404).json({ error: 'Leçon non trouvée.' });
        await dbRun(`INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, course_id, completed, watched_at) VALUES (?, ?, ?, 1, datetime('now'))`, [userId, lessonId, lesson.course_id]);
        res.json({ success: true, message: 'Leçon terminée!' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.post('/api/admin/courses', authenticate, requireRole(['enseignant', 'admin']), async (req, res) => {
    try {
        const { title, description, tag, hours, lessons } = req.body;
        if (!title || !description) return res.status(400).json({ error: 'Titre et description requis.' });
        const sanitizedTag = ['fondements','theologie','pratique','avance'].includes(tag) ? tag : 'fondements';
        const result = await dbRun('INSERT INTO courses (title, description, tag, status, hours, lessons_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title.trim(), description.trim(), sanitizedTag, 'active', parseInt(hours) || 0, parseInt(lessons) || 0, req.user.userId]);
        res.status(201).json({ success: true, courseId: result.lastID, message: 'Cours créé!' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ==================== UPLOAD ROUTES (WITH AUTH) ====================

app.post('/api/admin/upload', authenticate, requireRole(['enseignant', 'admin']), adminUpload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    const type = req.file.mimetype.startsWith('video') ? 'videos' : req.file.mimetype.startsWith('audio') ? 'audios' : 'uploads';
    res.json({ success: true, url: `/uploads/${type}/${req.file.filename}`, filename: req.file.originalname });
});

// Public video upload (dev mode only — requires auth in prod)
app.post('/api/upload', authenticate, upload.single('videoFile'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier reçu.' });
        const videoId = path.parse(req.file.filename).name;
        res.status(201).json({
            success: true, message: 'Vidéo uploadée!',
            video: { id: videoId, originalName: req.file.originalname, fileName: req.file.filename, size: req.file.size, sizeHuman: formatBytes(req.file.size), url: `/api/stream/${videoId}`, uploadDate: new Date().toISOString() }
        });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur.' }); }
});

// ==================== VIDEO MANAGEMENT (WITH AUTH) ====================

app.get('/api/videos', authenticate, (req, res) => {
    try {
        const files = fs.readdirSync(UPLOAD_DIR)
            .filter(f => { const ext = path.extname(f).toLowerCase(); return ['.mp4','.webm','.ogg','.mov','.avi','.mkv'].includes(ext); })
            .map(f => {
                const stat = fs.statSync(path.join(UPLOAD_DIR, f));
                return { id: path.parse(f).name, fileName: f, originalName: f, size: stat.size, sizeHuman: formatBytes(stat.size), created: stat.mtime, url: `/api/stream/${path.parse(f).name}`, thumbnailUrl: `/api/thumbnail/${path.parse(f).name}` };
            })
            .sort((a, b) => b.created - a.created);
        res.json({ success: true, count: files.length, videos: files });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur.' }); }
});

// Delete with auth + input validation (prevent path traversal)
app.delete('/api/videos/:videoId', authenticate, requireRole(['enseignant', 'admin']), (req, res) => {
    try {
        const videoId = req.params.videoId;
        // Sanitize: only allow alphanumeric + hyphen
        if (!/^[a-zA-Z0-9_-]+$/.test(videoId)) {
            return res.status(400).json({ success: false, error: 'ID vidéo invalide.' });
        }
        const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.startsWith(videoId));
        files.forEach(f => fs.unlinkSync(path.join(UPLOAD_DIR, f)));
        res.json({ success: true, message: 'Vidéo supprimée.', deleted: files });
    } catch (err) { res.status(500).json({ success: false, error: 'Erreur serveur.' }); }
});

// ==================== STREAMING ====================

app.get('/api/stream/:videoId', (req, res) => {
    const videoId = req.params.videoId;
    // Sanitize videoId — only allow safe characters
    if (!/^[a-zA-Z0-9_-]+$/.test(videoId)) {
        return res.status(400).json({ success: false, error: 'ID invalide.' });
    }

    const possibleExts = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
    let videoPath = null, actualExt = null;

    for (const ext of possibleExts) {
        const testPath = path.join(UPLOAD_DIR, `${videoId}${ext}`);
        // Prevent path traversal: ensure resolved path is within UPLOAD_DIR
        const resolved = path.resolve(testPath);
        if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) continue;
        if (fs.existsSync(testPath)) { videoPath = testPath; actualExt = ext; break; }
    }

    if (!videoPath) return res.status(404).json({ success: false, error: 'Vidéo non trouvée.' });

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeTypes = { '.mp4':'video/mp4', '.webm':'video/webm', '.ogg':'video/ogg', '.mov':'video/quicktime', '.avi':'video/x-msvideo', '.mkv':'video/x-matroska' };
    const contentType = mimeTypes[actualExt] || 'video/mp4';

    if (!range) {
        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': fileSize, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' });
        const stream = fs.createReadStream(videoPath);
        let bytesSent = 0;
        const CHUNK_SIZE = 1 * 1024 * 1024;
        const readChunk = () => {
            const chunk = stream.read(CHUNK_SIZE);
            if (chunk) { bytesSent += chunk.length; res.write(chunk); if (stream.readableLength < CHUNK_SIZE * 2) setImmediate(readChunk); }
            else stream.once('readable', readChunk);
        };
        stream.on('readable', readChunk);
        stream.on('end', () => res.end());
        stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.end(); });
        return;
    }

    const parts = range.replace(/bytes=/, '').split('-');
    const startRange = parseInt(parts[0], 10);
    if (isNaN(startRange) || startRange < 0 || startRange >= fileSize) return res.status(416).json({ error: 'Range invalide.' });
    const CHUNK_SIZE = 1 * 1024 * 1024;
    const end = Math.min(startRange + CHUNK_SIZE - 1, fileSize - 1);

    res.writeHead(206, {
        'Content-Type': contentType, 'Content-Length': end - startRange + 1,
        'Content-Range': `bytes ${startRange}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400'
    });
    fs.createReadStream(videoPath, { start: startRange, end }).pipe(res);
});

// ==================== THUMBNAIL ====================

app.get('/api/thumbnail/:videoId', (req, res) => {
    const colors = ['1e3a5f', 'c05621', '059669', '7c3aed', 'd97706'];
    const color = colors[(req.params.videoId || '').length % colors.length];
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#${color}"/><circle cx="320" cy="180" r="50" fill="rgba(255,255,255,.2)"/><polygon points="300,160 300,200 350,180" fill="white"/><text x="320" y="330" text-anchor="middle" fill="rgba(255,255,255,.6)" font-family="sans-serif" font-size="16">BereaFS</text></svg>`);
});

// ==================== HEALTH ====================

app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'ok', version: '8.0.0', uptime: process.uptime() });
});

// ==================== PROFILE UPDATE ====================

app.put('/api/auth/profile', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { name, phone, country, currentPassword, newPassword } = req.body;

        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

        if (newPassword) {
            if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis.' });
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
            if (newPassword.length < 6) return res.status(400).json({ error: 'Nouveau mot de passe trop court (6 min).' });
            const hashed = await bcrypt.hash(newPassword, 12);
            await dbRun('UPDATE users SET password = ?, updated_at = datetime(\'now\') WHERE id = ?', [hashed, userId]);
        }

        if (name) {
            const sanitizedName = name.trim().replace(/[<>]/g, '');
            if (sanitizedName.length < 2) return res.status(400).json({ error: 'Nom trop court.' });
            await dbRun('UPDATE users SET name = ?, avatar = ?, updated_at = datetime(\'now\') WHERE id = ?',
                [sanitizedName, sanitizedName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(), userId]);
        }
        if (phone !== undefined) await dbRun('UPDATE users SET phone = ?, updated_at = datetime(\'now\') WHERE id = ?', [phone.trim(), userId]);
        if (country) await dbRun('UPDATE users SET country = ?, updated_at = datetime(\'now\') WHERE id = ?', [country, userId]);

        const updated = await dbGet('SELECT id, name, email, role, avatar, country, phone, created_at FROM users WHERE id = ?', [userId]);
        res.json({ success: true, message: 'Profil mis à jour!', user: updated });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ==================== COURSE MANAGEMENT ====================

app.put('/api/admin/courses/:id', authenticate, requireRole(['enseignant', 'admin']), async (req, res) => {
    try {
        const courseId = req.params.id;
        if (!/^\d+$/.test(courseId)) return res.status(400).json({ error: 'ID invalide.' });
        const { title, description, tag, hours, status } = req.body;
        const course = await dbGet('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).json({ error: 'Cours non trouvé.' });

        const updates = [];
        const params = [];
        if (title) { updates.push('title = ?'); params.push(title.trim()); }
        if (description) { updates.push('description = ?'); params.push(description.trim()); }
        if (tag && ['fondements','theologie','pratique','avance'].includes(tag)) { updates.push('tag = ?'); params.push(tag); }
        if (hours !== undefined) { updates.push('hours = ?'); params.push(parseInt(hours) || 0); }
        if (status && ['draft','active','archived'].includes(status)) { updates.push('status = ?'); params.push(status); }

        if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier.' });
        params.push(courseId);
        await dbRun(`UPDATE courses SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'Cours mis à jour!' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.delete('/api/admin/courses/:id', authenticate, requireRole(['enseignant', 'admin']), async (req, res) => {
    try {
        const courseId = req.params.id;
        if (!/^\d+$/.test(courseId)) return res.status(400).json({ error: 'ID invalide.' });
        const course = await dbGet('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).json({ error: 'Cours non trouvé.' });
        await dbRun('DELETE FROM courses WHERE id = ?', [courseId]);
        res.json({ success: true, message: 'Cours supprimé.' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ==================== LESSON MANAGEMENT ====================

app.post('/api/admin/courses/:courseId/lessons', authenticate, requireRole(['enseignant', 'admin']), async (req, res) => {
    try {
        const courseId = req.params.courseId;
        if (!/^\d+$/.test(courseId)) return res.status(400).json({ error: 'ID invalide.' });
        const course = await dbGet('SELECT * FROM courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).json({ error: 'Cours non trouvé.' });

        const { num, title, content, scripture, duration, video_url, audio_url } = req.body;
        if (!num || !title) return res.status(400).json({ error: 'Numéro et titre requis.' });

        const result = await dbRun(
            'INSERT INTO lessons (course_id, num, title, content, scripture, duration, video_url, audio_url, has_video, has_audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [courseId, parseInt(num), title.trim(), content || '', scripture || '', duration || '45 min', video_url || '', audio_url || video_url ? 1 : 0, audio_url ? 1 : 0]
        );
        await dbRun('UPDATE courses SET lessons_count = lessons_count + 1 WHERE id = ?', [courseId]);
        res.status(201).json({ success: true, lessonId: result.lastID, message: 'Leçon ajoutée!' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.put('/api/admin/lessons/:id', authenticate, requireRole(['enseignant', 'admin']), async (req, res) => {
    try {
        const lessonId = req.params.id;
        if (!/^\d+$/.test(lessonId)) return res.status(400).json({ error: 'ID invalide.' });
        const lesson = await dbGet('SELECT * FROM lessons WHERE id = ?', [lessonId]);
        if (!lesson) return res.status(404).json({ error: 'Leçon non trouvée.' });

        const { title, content, scripture, duration, video_url, audio_url, num } = req.body;
        const updates = [];
        const params = [];
        if (title) { updates.push('title = ?'); params.push(title.trim()); }
        if (content !== undefined) { updates.push('content = ?'); params.push(content); }
        if (scripture !== undefined) { updates.push('scripture = ?'); params.push(scripture); }
        if (duration) { updates.push('duration = ?'); params.push(duration); }
        if (video_url !== undefined) { updates.push('video_url = ?'); params.push(video_url); updates.push('has_video = ?'); params.push(video_url ? 1 : 0); }
        if (audio_url !== undefined) { updates.push('audio_url = ?'); params.push(audio_url); updates.push('has_audio = ?'); params.push(audio_url ? 1 : 0); }
        if (num !== undefined) { updates.push('num = ?'); params.push(parseInt(num)); }

        if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier.' });
        params.push(lessonId);
        await dbRun(`UPDATE lessons SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true, message: 'Leçon mise à jour!' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.delete('/api/admin/lessons/:id', authenticate, requireRole(['enseignant', 'admin']), async (req, res) => {
    try {
        const lessonId = req.params.id;
        if (!/^\d+$/.test(lessonId)) return res.status(400).json({ error: 'ID invalide.' });
        const lesson = await dbGet('SELECT * FROM lessons WHERE id = ?', [lessonId]);
        if (!lesson) return res.status(404).json({ error: 'Leçon non trouvée.' });
        await dbRun('DELETE FROM lessons WHERE id = ?', [lessonId]);
        await dbRun('UPDATE courses SET lessons_count = MAX(lessons_count - 1, 0) WHERE id = ?', [lesson.course_id]);
        res.json({ success: true, message: 'Leçon supprimée.' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ==================== QUIZ ROUTES ====================

app.get('/api/quizzes/:courseId/:level', authenticate, async (req, res) => {
    try {
        const { courseId, level } = req.params;
        if (!/^\d+$/.test(courseId) || !/^\d+$/.test(level)) return res.status(400).json({ error: 'ID invalide.' });
        const quiz = await dbGet('SELECT * FROM quizzes WHERE course_id = ? AND level = ?', [courseId, level]);
        if (!quiz) return res.status(404).json({ error: 'Quiz non trouvé.' });
        const questions = await dbAll('SELECT id, question, options FROM quiz_questions WHERE quiz_id = ?', [quiz.id]);
        res.json({ success: true, quiz, questions });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.post('/api/quizzes/:quizId/submit', authenticate, async (req, res) => {
    try {
        const quizId = req.params.quizId;
        if (!/^\d+$/.test(quizId)) return res.status(400).json({ error: 'ID invalide.' });
        const { answers } = req.body;
        if (!answers || !Array.isArray(answers)) return res.status(400).json({ error: 'Réponses requises.' });

        const quiz = await dbGet('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        if (!quiz) return res.status(404).json({ error: 'Quiz non trouvé.' });

        const questions = await dbAll('SELECT * FROM quiz_questions WHERE quiz_id = ?', [quizId]);
        let correct = 0;
        const results = questions.map((q, i) => {
            const userAnswer = parseInt(answers[i]);
            const isCorrect = userAnswer === q.answer;
            if (isCorrect) correct++;
            return { questionId: q.id, userAnswer, correctAnswer: q.answer, isCorrect, explanation: q.explanation };
        });

        const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
        const passed = score >= quiz.pass_score;

        await dbRun(
            'INSERT INTO quiz_results (user_id, quiz_id, score, total, passed, answers) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.userId, quizId, score, questions.length, passed ? 1 : 0, JSON.stringify(results)]
        );

        res.json({ success: true, score, total: questions.length, correct, passed, passScore: quiz.pass_score, results });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

app.post('/api/admin/quizzes', authenticate, requireRole(['enseignant', 'admin']), async (req, res) => {
    try {
        const { course_id, level, level_name, pass_score, description, questions } = req.body;
        if (!course_id || !questions || !Array.isArray(questions)) return res.status(400).json({ error: 'Données requises.' });

        const result = await dbRun(
            'INSERT INTO quizzes (course_id, level, level_name, pass_score, description) VALUES (?, ?, ?, ?, ?)',
            [course_id, parseInt(level) || 1, level_name || 'Débutant', parseInt(pass_score) || 70, description || '']
        );

        for (const q of questions) {
            if (q.question && q.options && Array.isArray(q.options) && q.answer !== undefined) {
                await dbRun(
                    'INSERT INTO quiz_questions (quiz_id, question, options, answer, explanation) VALUES (?, ?, ?, ?, ?)',
                    [result.lastID, q.question, JSON.stringify(q.options), parseInt(q.answer), q.explanation || '']
                );
            }
        }

        res.status(201).json({ success: true, quizId: result.lastID, message: 'Quiz créé!' });
    } catch (err) { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// ==================== INFO ====================

app.get('/api/info/:videoId', (req, res) => {
    const videoId = req.params.videoId;
    if (!/^[a-zA-Z0-9_-]+$/.test(videoId)) return res.status(400).json({ error: 'ID invalide.' });
    const possibleExts = ['.mp4','.webm','.ogg','.mov','.avi','.mkv'];
    let videoPath = null, actualExt = null;
    for (const ext of possibleExts) {
        const testPath = path.join(UPLOAD_DIR, `${videoId}${ext}`);
        const resolved = path.resolve(testPath);
        if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) continue;
        if (fs.existsSync(testPath)) { videoPath = testPath; actualExt = ext; break; }
    }
    if (!videoPath) return res.status(404).json({ error: 'Vidéo non trouvée.' });
    const stat = fs.statSync(videoPath);
    const hash = crypto.createHash('md5').update(stat.mtime.toISOString()).digest('hex').slice(0, 8);
    res.json({ id: videoId, size: stat.size, sizeHuman: formatBytes(stat.size), created: stat.mtime, modified: stat.mtime, extension: actualExt, hash, url: `/api/stream/${videoId}`, poster: `/api/thumbnail/${videoId}?v=${hash}` });
});

// ==================== ADMIN PAGE ====================

app.get('/admin', authenticate, requireRole(['enseignant', 'admin']), (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BereaFS - Gestion Vidéos</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafb;color:#1e293b;padding:20px;max-width:1200px;margin:0 auto}
        h1{margin-bottom:8px}p{color:#64748b;margin-bottom:24px}
        .upload-zone{border:3px dashed #e2e8f0;border-radius:16px;padding:60px 20px;text-align:center;transition:all .3s;cursor:pointer;background:#fff}
        .upload-zone:hover,.upload-zone.dragover{border-color:#c05621;background:#fff7ed}
        .btn{padding:12px 24px;border-radius:10px;border:none;font-size:.95rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
        .btn-primary{background:linear-gradient(135deg,#c05621,#ed8936);color:#fff}
        .progress-container{display:none;margin-top:20px;background:#f1f5f9;border-radius:10px;overflow:hidden;height:30px}
        .progress-fill{height:100%;background:linear-gradient(90deg,#c05621,#ed8936);width:0%;transition:width .3s;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.8rem;font-weight:600}
        .video-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-top:32px}
        .video-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);border:1px solid #e2e8f0}
        .video-thumb{height:180px;background:linear-gradient(135deg,#1e3a5f,#2c5282);display:flex;align-items:center;justify-content:center}
        .video-thumb .play-icon{width:60px;height:60px;background:rgba(255,255,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:#fff}
        .video-info{padding:16px}
        .video-info h3{font-size:1rem;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .video-info p{color:#64748b;font-size:.85rem;margin-bottom:12px}
        .video-actions{display:flex;gap:8px}
        .video-actions button{flex:1;padding:8px;border-radius:8px;border:none;font-size:.85rem;cursor:pointer}
        .btn-play{background:linear-gradient(135deg,#1e3a5f,#2c5282);color:#fff}
        .btn-delete{background:#fef2f2;color:#dc2626}
        #status{margin-top:16px;padding:12px 16px;border-radius:10px;display:none}
        #status.success{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
        #status.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    </style>
</head>
<body>
    <h1>BereaFS - Gestion Vidéos</h1>
    <p>Téléversez vos vidéos de cours et testez le streaming.</p>
    <div class="upload-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
        <h2>Déposez vos vidéos ici</h2>
        <p>ou cliquez pour sélectionner un fichier</p>
        <button class="btn btn-primary">Choisir une vidéo</button>
        <input type="file" id="fileInput" style="display:none" accept="video/*" onchange="handleFile(this.files[0])">
        <div class="progress-container" id="progressContainer"><div class="progress-fill" id="progressFill">0%</div></div>
    </div>
    <div id="status"></div>
    <h2 style="margin:32px 0 16px">Vidéos disponibles</h2>
    <div id="videoList"><p>Chargement...</p></div>
<script>
const API_URL=location.origin;
const TOKEN=localStorage.getItem('bereafs_token');
const dropZone=document.getElementById('dropZone');
['dragenter','dragover','dragleave','drop'].forEach(evt=>{dropZone.addEventListener(evt,e=>{e.preventDefault();e.stopPropagation()})});
dropZone.addEventListener('dragover',()=>dropZone.classList.add('dragover'));
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)handleFile(f);dropZone.classList.remove('dragover')});

function handleFile(file){
    if(!file)return;
    const fd=new FormData();fd.append('media',file);
    const xhr=new XMLHttpRequest();
    const pc=document.getElementById('progressContainer'),pf=document.getElementById('progressFill');
    pc.style.display='block';
    xhr.setRequestHeader('Authorization','Bearer '+TOKEN);
    xhr.upload.addEventListener('progress',e=>{if(e.lengthComputable){const p=Math.round((e.loaded/e.total)*100);pf.style.width=p+'%';pf.textContent=p+'%'}});
    xhr.addEventListener('load',()=>{pc.style.display='none';const res=JSON.parse(xhr.responseText);showStatus(res.success?'success':'error',res.success?'Upload réussi!':'Erreur: '+res.error);if(res.success)loadVideos()});
    xhr.open('POST',API_URL+'/api/admin/upload');xhr.send(fd);
}
function showStatus(type,msg){const el=document.getElementById('status');el.className=type;el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',5000)}
async function loadVideos(){
    try{
        const res=await fetch(API_URL+'/api/videos',{headers:{'Authorization':'Bearer '+TOKEN}});
        const data=await res.json();
        const c=document.getElementById('videoList');
        if(!data.success||data.videos.length===0){c.innerHTML='<p>Aucune vidéo.</p>';return}
        c.innerHTML='<div class="video-grid">'+data.videos.map(v=>{
            const name=escapeHtml(v.originalName);
            return '<div class="video-card"><div class="video-thumb" onclick="openPlayer(\\''+escapeJs(v.id)+'\\')"><div class="play-icon">▶</div></div><div class="video-info"><h3 title="'+name+'">'+name+'</h3><p>'+v.sizeHuman+' • '+new Date(v.created).toLocaleDateString('fr-FR')+'</p><div class="video-actions"><button class="btn-play" onclick="openPlayer(\\''+escapeJs(v.id)+'\\')">▶ Lire</button></div></div></div>';
        }).join('')+'</div>';
    }catch(err){showStatus('error','Erreur réseau')}
}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function escapeJs(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r')}
function openPlayer(id){window.open('/client/player.html?video='+encodeURIComponent(id),'_blank')}
loadVideos();
</script>
</body>
</html>
    `);
});

// ==================== VIDEO PLAYER ====================

app.get('/client/player.html', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BereaFS - Lecteur</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#000;color:#fff;min-height:100vh;display:flex;flex-direction:column}
        .video-container{flex:1;display:flex;align-items:center;justify-content:center}
        video{width:100%;max-height:100vh;display:block}
        .title{position:fixed;top:20px;left:20px;font-size:1.1rem;font-weight:600;text-shadow:0 2px 4px rgba(0,0,0,.5);z-index:10}
    </style>
</head>
<body>
    <div class="video-container">
        <div class="title" id="videoTitle">Chargement...</div>
        <video id="player" controls playsinline>
            <source id="videoSource" src="" type="video/mp4">
        </video>
    </div>
<script>
const p=new URLSearchParams(window.location.search);
const id=p.get('video');
const title=decodeURIComponent(p.get('title')||'Vidéo');
document.getElementById('videoTitle').textContent=title;
document.getElementById('videoSource').src='/api/stream/'+encodeURIComponent(id);
document.getElementById('player').load();
</script>
</body>
</html>
    `);
});

// ==================== UTILITY ====================

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Error handling — never expose internal errors
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: 'Fichier trop volumineux. Max: 2 Go' });
        return res.status(400).json({ success: false, error: 'Erreur upload.' });
    }
    console.error('Server error:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
});

// START
app.listen(PORT, () => {
    console.log(`
========================================
  BEREAFS v8.0.0 - Enhanced Platform
========================================
  Upload:  POST /api/upload
  Stream:  GET  /api/stream/:id
  Liste:   GET  /api/videos
  Admin:   http://localhost:${PORT}/admin
  Client:  http://localhost:${PORT}/client
========================================
    `);
});
