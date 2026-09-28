/**
 * BereaFS - Initialisation de la base de données + données de démonstration
 * Usage : npm run init-db            (depuis server/)
 *         npm run init-db -- --force (autorise le seed en production)
 */
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/config');
const { openDatabase } = require('../src/db');

const DEMO_ADMIN = { name: 'Pasteur Jean', email: 'pasteur@bereafs.com', pass: 'admin123', phone: '+225 01 23 45 67', country: 'CI', role: 'enseignant', avatar: 'PJ' };
const DEMO_STUDENTS = [
    { name: 'Marie Kaboré', email: 'marie@bereafs.com', pass: 'marie123', phone: '+226 70 12 34 56', country: 'BF', role: 'etudiant', avatar: 'MK' },
    { name: 'Jean Ouédraogo', email: 'jean@bereafs.com', pass: 'jean123', phone: '+223 65 12 34 56', country: 'ML', role: 'etudiant', avatar: 'JO' }
];

const FOUNDATIONS_LESSONS = [
    { num: 1, title: 'La Parole de Dieu: Son Autorité', content: 'La Bible est la Parole inspirée de Dieu. 2 Timothée 3:16-17.', scripture: '2 Timothée 3:16-17', duration: '52 min', has_video: 1, has_audio: 1 },
    { num: 2, title: 'La Création: Origine et Design', content: 'Au commencement, Dieu créa les cieux et la terre.', scripture: 'Genèse 1:1-31', duration: '48 min', has_video: 1, has_audio: 1 },
    { num: 3, title: 'La Chute et ses Conséquences', content: 'Le péché entra dans le monde par la désobéissance.', scripture: 'Genèse 3:1-24', duration: '55 min', has_video: 1, has_audio: 1 },
    { num: 4, title: 'Le Salut par Grâce par la Foi', content: 'Par la grâce vous êtes sauvés, par le moyen de la foi.', scripture: 'Éphésiens 2:8-9', duration: '61 min', has_video: 1, has_audio: 1 },
    { num: 5, title: 'La Nouvelle Naissance', content: 'Si un homme ne naît de nouveau, il ne peut voir le royaume.', scripture: 'Jean 3:3-7', duration: '45 min', has_video: 1, has_audio: 0 },
    { num: 6, title: 'La Sanctification', content: 'Soyez saints, car je suis saint.', scripture: '1 Pierre 1:16', duration: '50 min', has_video: 1, has_audio: 0 },
    { num: 7, title: 'L\'Église: Mission et Ministère', content: 'Le sel de la terre et la lumière du monde.', scripture: 'Matthieu 5:13-16', duration: '58 min', has_video: 1, has_audio: 0 },
    { num: 8, title: 'La Vie Éternelle', content: 'Je viens vite. Celui qui vaincra héritera.', scripture: 'Apocalypse 21:1-7', duration: '63 min', has_video: 1, has_audio: 0 }
];

const FOUNDATIONS_QUIZ = [
    { question: 'Quelle est la référence biblique de 2 Timothée 3:16-17 ?', options: ['Genèse 1:1', '2 Timothée 3:16-17', 'Jean 3:16', 'Romains 8:28'], answer: 1, explanation: 'La Bible est inspirée par Dieu.' },
    { question: 'Qui a créé le monde selon Genèse ?', options: ['Les anges', 'L\'humanité', 'Dieu', 'Adam'], answer: 2, explanation: 'Dieu est le créateur de toutes choses.' },
    { question: 'Que dit Jean 3:3 sur la nouvelle naissance ?', options: ['C\'est optionnel', 'C\'est nécessaire', 'C\'est ancien', 'C\'est nouveau'], answer: 1, explanation: 'Il faut naître de nouveau pour voir le royaume.' },
    { question: 'Par quoi sommes-nous sauvés selon Éphésiens 2:8 ?', options: ['Par les œuvres', 'Par la grâce et la foi', 'Par les lois', 'Par les rituels'], answer: 1, explanation: 'C\'est par la grâce que vous êtes sauvés par la foi.' }
];

const THEOLOGY_QUIZ = [
    { question: 'Que signifie la Trinité ?', options: ['Un seul Dieu en trois personnes', 'Trois dieux', 'Un concept philosophique', 'Une allégorie'], answer: 0, explanation: 'Le Dieu unique existe en trois personnes.' },
    { question: 'Qui est le créateur selon la Bible ?', options: ['Adam', 'L\'église', 'Dieu', 'Les anges'], answer: 2, explanation: 'Dieu est le créateur de toutes choses.' },
    { question: 'Que fait l\'Esprit Saint ?', options: ['Juge seulement', 'Conseille et sanctifie', 'Punit', 'Observe'], answer: 1, explanation: 'L\'Esprit Saint guide et sanctifie les croyants.' }
];

async function insertUser(db, user, rounds) {
    const hash = await bcrypt.hash(user.pass, rounds);
    const { lastID } = await db.run(
        'INSERT INTO users (name, email, password, phone, country, role, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user.name, user.email, hash, user.phone, user.country, user.role, user.avatar]
    );
    console.log(`  ✅ ${user.email} / ${user.pass}`);
    return lastID;
}

async function insertCourse(db, course, createdBy) {
    const { lastID } = await db.run(
        'INSERT INTO courses (title, description, tag, status, hours, lessons_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [course.title, course.description, course.tag, 'active', course.hours, course.lessonsCount, createdBy]
    );
    return lastID;
}

async function insertQuiz(db, courseId, description, questions) {
    const { lastID } = await db.run(
        'INSERT INTO quizzes (course_id, level, level_name, pass_score, description) VALUES (?, ?, ?, ?, ?)',
        [courseId, 1, 'Debutant', 70, description]
    );
    for (const q of questions) {
        await db.run(
            'INSERT INTO quiz_questions (quiz_id, question, options, answer, explanation) VALUES (?, ?, ?, ?, ?)',
            [lastID, q.question, JSON.stringify(q.options), q.answer, q.explanation]
        );
    }
    return lastID;
}

async function seed(db, config) {
    const adminId = await insertUser(db, DEMO_ADMIN, config.bcryptRounds);
    const studentIds = [];
    for (const student of DEMO_STUDENTS) {
        studentIds.push(await insertUser(db, student, config.bcryptRounds));
    }
    const [marieId] = studentIds;

    const foundationsId = await insertCourse(db, {
        title: 'Les Fondements de la Foi Chrétienne',
        description: 'Exploration des vérités essentielles qui fondent la vie chrétienne, de la création à la consommation.',
        tag: 'fondements', hours: 45, lessonsCount: FOUNDATIONS_LESSONS.length
    }, adminId);
    const lessonIds = [];
    for (const l of FOUNDATIONS_LESSONS) {
        const { lastID } = await db.run(
            'INSERT INTO lessons (course_id, num, title, content, scripture, duration, has_video, has_audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [foundationsId, l.num, l.title, l.content, l.scripture, l.duration, l.has_video, l.has_audio]
        );
        lessonIds.push(lastID);
    }
    console.log(`  ✅ Cours Fondements (${FOUNDATIONS_LESSONS.length} leçons)`);

    const theologyId = await insertCourse(db, {
        title: 'Théologie Systématique I',
        description: 'Étude méthodique des doctrines bibliques: Dieu, la révélation, la Trinité.',
        tag: 'theologie', hours: 60, lessonsCount: 10
    }, adminId);
    console.log('  ✅ Cours Théologie');

    const quiz1Id = await insertQuiz(db, foundationsId, 'Testez vos connaissances sur les fondements', FOUNDATIONS_QUIZ);
    await insertQuiz(db, theologyId, 'Testez vos connaissances en théologie', THEOLOGY_QUIZ);
    console.log('  ✅ Quiz créés');

    for (const lessonId of lessonIds.slice(0, 2)) {
        await db.run(
            `INSERT INTO lesson_progress (user_id, lesson_id, course_id, completed, watched_at) VALUES (?, ?, ?, 1, datetime('now'))`,
            [marieId, lessonId, foundationsId]
        );
    }
    await db.run(
        'INSERT INTO quiz_results (user_id, quiz_id, score, total, passed, answers) VALUES (?, ?, ?, ?, ?, ?)',
        [marieId, quiz1Id, 75, FOUNDATIONS_QUIZ.length, 1, JSON.stringify([1, 2, 1, 1])]
    );
    console.log('  ✅ Progression et résultat de quiz démo pour Marie');
}

async function main() {
    const config = loadConfig();
    const db = await openDatabase(config.dbPath);
    console.log('✅ SQLite :', config.dbPath);

    try {
        const { count } = await db.get('SELECT COUNT(*) as count FROM users');
        if (count > 0) {
            console.log('📚 Données existantes, pas de seed nécessaire.');
            return;
        }
        if (config.isProduction && !process.argv.includes('--force')) {
            console.log('⚠️  Production : schéma créé, comptes démo NON insérés (mots de passe publics). Utilisez --force pour forcer.');
            return;
        }
        console.log('🌱 Insertion des données de démo...');
        await db.transaction(() => seed(db, config));
        console.log('\n✅ Données de démo insérées avec succès !');
    } finally {
        await db.close();
    }
}

main().catch((err) => {
    console.error('❌ Erreur init-db :', err.message);
    process.exit(1);
});
