/**
 * BereaFS - Script d'initialisation de la base de données
 * Usage: node scripts/init-db.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || require('path').join(__dirname, '..', 'bereafs.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erreur connexion SQLite:', err.message);
        process.exit(1);
    }
    console.log('✅ SQLite connecté:', dbPath);
});

db.run('PRAGMA foreign_keys = ON');

// Create tables
const initTables = (callback) => {
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
        )`, callback);
    });
};

async function init() {
    try {
        // Vérifier si des données existent
        const existing = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM courses', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existing && existing.count > 0) {
            console.log('📚 Données existantes, pas de seed nécessaire.');
            db.close();
            return;
        }

        console.log('🌱 Insertion des données de démo...');

        // Admin
        const adminPass = await bcrypt.hash('admin123', 12);
        const adminId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO users (name, email, password, phone, country, role, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['Pasteur Jean', 'pasteur@bereafs.com', adminPass, '+225 01 23 45 67', 'CI', 'enseignant', 'PJ'],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });
        console.log('  ✅ Admin créé: pasteur@bereafs.com / admin123');

        // Étudiants démo
        const students = [
            { name: 'Marie Kaboré', email: 'marie@bereafs.com', pass: 'marie123', phone: '+226 70 12 34 56', country: 'BF', role: 'etudiant', avatar: 'MK' },
            { name: 'Jean Ouédraogo', email: 'jean@bereafs.com', pass: 'jean123', phone: '+223 65 12 34 56', country: 'ML', role: 'etudiant', avatar: 'JO' }
        ];

        for (const s of students) {
            const hash = await bcrypt.hash(s.pass, 12);
            await new Promise((resolve, reject) => {
                db.run('INSERT INTO users (name, email, password, phone, country, role, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [s.name, s.email, hash, s.phone, s.country, s.role, s.avatar],
                    (err) => err ? reject(err) : resolve());
            });
            console.log(`  ✅ ${s.email} / ${s.pass}`);
        }

        // Cours: Fondements
        const courseId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO courses (title, description, tag, status, hours, lessons_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['Les Fondements de la Foi Chrétienne', 'Exploration des vérités essentielles qui fondent la vie chrétienne, de la création à la consommation.', 'fondements', 'active', 45, 8, adminId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });

        const lessons = [
            { num: 1, title: 'La Parole de Dieu: Son Autorité', content: 'La Bible est la Parole inspirée de Dieu. 2 Timothée 3:16-17.', scripture: '2 Timothée 3:16-17', duration: '52 min', has_video: 1, has_audio: 1 },
            { num: 2, title: 'La Création: Origine et Design', content: 'Au commencement, Dieu créa les cieux et la terre.', scripture: 'Genèse 1:1-31', duration: '48 min', has_video: 1, has_audio: 1 },
            { num: 3, title: 'La Chute et ses Conséquences', content: 'Le péché entra dans le monde par la désobéissance.', scripture: 'Genèse 3:1-24', duration: '55 min', has_video: 1, has_audio: 1 },
            { num: 4, title: 'Le Salut par Grâce par la Foi', content: 'Par la grâce vous êtes sauvés, par le moyen de la foi.', scripture: 'Éphésiens 2:8-9', duration: '61 min', has_video: 1, has_audio: 1 },
            { num: 5, title: 'La Nouvelle Naissance', content: 'Si un homme ne naît de nouveau, il ne peut voir le royaume.', scripture: 'Jean 3:3-7', duration: '45 min', has_video: 1, has_audio: 0 },
            { num: 6, title: 'La Sanctification', content: 'Soyez saints, car je suis saint.', scripture: '1 Pierre 1:16', duration: '50 min', has_video: 1, has_audio: 0 },
            { num: 7, title: 'L\'Église: Mission et Ministère', content: 'Le sel de la terre et la lumière du monde.', scripture: 'Matthieu 5:13-16', duration: '58 min', has_video: 1, has_audio: 0 },
            { num: 8, title: 'La Vie Éternelle', content: 'Je viens vite. Celui qui vaincra héritera.', scripture: 'Apocalypse 21:1-7', duration: '63 min', has_video: 1, has_audio: 0 }
        ];

        for (const l of lessons) {
            await new Promise((resolve, reject) => {
                db.run('INSERT INTO lessons (course_id, num, title, content, scripture, duration, has_video, has_audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [courseId, l.num, l.title, l.content, l.scripture, l.duration, l.has_video, l.has_audio],
                    (err) => err ? reject(err) : resolve());
            });
        }
        console.log('  ✅ 8 leçons créées');

        // Cours: Théologie
        const course2Id = await new Promise((resolve, reject) => {
            db.run('INSERT INTO courses (title, description, tag, status, hours, lessons_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                ['Théologie Systématique I', 'Étude méthodique des doctrines bibliques: Dieu, la révélation, la Trinité.', 'theologie', 'active', 60, 10, adminId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });
        console.log('  ✅ 2e cours créé');

        console.log('\n✅ Données de démo insérées avec succès!');
        db.close();

    } catch (err) {
        console.error('❌ Erreur seed:', err.message);
        db.close();
        process.exit(1);
    }
}

initTables(() => {
    init();
});
