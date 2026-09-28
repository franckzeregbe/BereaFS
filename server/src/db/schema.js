// Schéma unique partagé par le serveur et le script d'initialisation.

const TABLES = [
    `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL, phone TEXT, country TEXT DEFAULT 'CI',
        role TEXT DEFAULT 'etudiant' CHECK(role IN ('etudiant','enseignant','admin')),
        avatar TEXT, is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL, description TEXT, tag TEXT DEFAULT 'fondements',
        status TEXT DEFAULT 'draft', hours INTEGER DEFAULT 0,
        lessons_count INTEGER DEFAULT 0, created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL, num INTEGER NOT NULL, title TEXT NOT NULL,
        content TEXT, scripture TEXT, duration TEXT DEFAULT '45 min',
        video_url TEXT, audio_url TEXT, has_video INTEGER DEFAULT 0,
        has_audio INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS lesson_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL, completed INTEGER DEFAULT 0,
        score INTEGER, watched_at DATETIME,
        UNIQUE(user_id, lesson_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (lesson_id) REFERENCES lessons(id),
        FOREIGN KEY (course_id) REFERENCES courses(id)
    )`,
    `CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL, level INTEGER DEFAULT 1,
        level_name TEXT DEFAULT 'Debutant', pass_score INTEGER DEFAULT 70,
        description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS quiz_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL,
        question TEXT NOT NULL, options TEXT NOT NULL,
        answer INTEGER NOT NULL, explanation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS quiz_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, quiz_id INTEGER NOT NULL,
        score INTEGER NOT NULL, total INTEGER NOT NULL,
        passed INTEGER DEFAULT 0, answers TEXT,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    )`
];

const INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, num)',
    'CREATE INDEX IF NOT EXISTS idx_progress_user ON lesson_progress(user_id, completed)',
    'CREATE INDEX IF NOT EXISTS idx_progress_lesson ON lesson_progress(lesson_id)',
    'CREATE INDEX IF NOT EXISTS idx_quizq_quiz ON quiz_questions(quiz_id)',
    'CREATE INDEX IF NOT EXISTS idx_quizr_user ON quiz_results(user_id, quiz_id)',
    'CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status)'
];

module.exports = { SCHEMA: [...TABLES, ...INDEXES] };
