const express = require('express');
const { assertCanManageCourse } = require('../middleware/auth');
const { findCourseOr404 } = require('./courses');
const { HttpError, asyncHandler } = require('../utils/http');
const { parseId, optionalText, requiredText, optionalInt } = require('../utils/validation');

const MAX_QUESTIONS = 200;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

function readQuestion(raw, index) {
    const label = `question ${index + 1}`;
    if (!raw || typeof raw !== 'object') throw new HttpError(400, `Format invalide : ${label}.`);
    const question = requiredText(raw.question, { field: label, max: 1000 });
    const { options } = raw;
    if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS
        || !options.every((o) => typeof o === 'string' && o.trim() && o.length <= 500)) {
        throw new HttpError(400, `Options invalides (${MIN_OPTIONS} à ${MAX_OPTIONS}) : ${label}.`);
    }
    const answer = optionalInt(raw.answer, { field: `réponse de la ${label}`, min: 0, max: options.length - 1 });
    if (answer === undefined) throw new HttpError(400, `Réponse manquante : ${label}.`);
    const explanation = optionalText(raw.explanation, { field: `explication de la ${label}`, max: 2000 }) || '';
    return { question, options: options.map((o) => o.trim()), answer, explanation };
}

function createQuizzesRouter({ db, auth }) {
    const router = express.Router();
    const { authenticate, requireTeacher } = auth;

    // Les questions sont toujours triées par id : la correction se fait par index,
    // l'ordre doit donc être identique à l'affichage et à la soumission.
    const questionsOf = (quizId, columns) => db.all(`SELECT ${columns} FROM quiz_questions WHERE quiz_id = ? ORDER BY id`, [quizId]);

    router.get('/quizzes/:courseId/:level', authenticate, asyncHandler(async (req, res) => {
        const courseId = parseId(req.params.courseId);
        const level = parseId(req.params.level);
        const quiz = await db.get(`
            SELECT q.* FROM quizzes q JOIN courses c ON c.id = q.course_id
            WHERE q.course_id = ? AND q.level = ? AND (c.status != 'draft' OR c.created_by = ?)
        `, [courseId, level, req.user.userId]);
        if (!quiz) throw new HttpError(404, 'Quiz non trouvé.');
        const questions = await questionsOf(quiz.id, 'id, question, options');
        res.json({ success: true, quiz, questions });
    }));

    router.post('/quizzes/:quizId/submit', authenticate, asyncHandler(async (req, res) => {
        const quizId = parseId(req.params.quizId);
        const { answers } = req.body;
        if (!Array.isArray(answers)) throw new HttpError(400, 'Réponses requises.');

        const quiz = await db.get('SELECT * FROM quizzes WHERE id = ?', [quizId]);
        if (!quiz) throw new HttpError(404, 'Quiz non trouvé.');

        const questions = await questionsOf(quizId, '*');
        const results = questions.map((q, i) => {
            const userAnswer = Number.parseInt(answers[i], 10);
            return {
                questionId: q.id,
                userAnswer: Number.isNaN(userAnswer) ? null : userAnswer,
                correctAnswer: q.answer,
                isCorrect: userAnswer === q.answer,
                explanation: q.explanation
            };
        });
        const correct = results.filter((r) => r.isCorrect).length;
        const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
        const passed = score >= quiz.pass_score;

        await db.run(
            'INSERT INTO quiz_results (user_id, quiz_id, score, total, passed, answers) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.userId, quizId, score, questions.length, passed ? 1 : 0, JSON.stringify(results)]
        );
        res.json({ success: true, score, total: questions.length, correct, passed, passScore: quiz.pass_score, results });
    }));

    router.post('/admin/quizzes', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const courseId = parseId(req.body.course_id);
        assertCanManageCourse(req.user, await findCourseOr404(db, courseId));

        const { questions } = req.body;
        if (!Array.isArray(questions) || questions.length === 0) throw new HttpError(400, 'Au moins une question requise.');
        if (questions.length > MAX_QUESTIONS) throw new HttpError(400, `Maximum ${MAX_QUESTIONS} questions.`);
        const parsed = questions.map(readQuestion);

        const level = optionalInt(req.body.level, { field: 'niveau', min: 1, max: 100 }) ?? 1;
        const passScore = optionalInt(req.body.pass_score, { field: 'score minimum', min: 0, max: 100 }) ?? 70;
        const levelName = optionalText(req.body.level_name, { field: 'nom du niveau', max: 50 }) || 'Débutant';
        const description = optionalText(req.body.description, { field: 'description', max: 2000 }) || '';

        const quizId = await db.transaction(async () => {
            const result = await db.run(
                'INSERT INTO quizzes (course_id, level, level_name, pass_score, description) VALUES (?, ?, ?, ?, ?)',
                [courseId, level, levelName, passScore, description]
            );
            for (const q of parsed) {
                await db.run(
                    'INSERT INTO quiz_questions (quiz_id, question, options, answer, explanation) VALUES (?, ?, ?, ?, ?)',
                    [result.lastID, q.question, JSON.stringify(q.options), q.answer, q.explanation]
                );
            }
            return result.lastID;
        });
        res.status(201).json({ success: true, quizId, message: 'Quiz créé!' });
    }));

    router.get('/my/quizzes', authenticate, asyncHandler(async (req, res) => {
        const userId = req.user.userId;
        const quizzes = await db.all(`
            SELECT q.id as quiz_id, q.level, q.level_name, q.pass_score, q.description,
                   c.id as course_id, c.title as course_title,
                   (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) as questions_count,
                   (SELECT MAX(score) FROM quiz_results qr WHERE qr.quiz_id = q.id AND qr.user_id = ?) as best_score,
                   (SELECT COUNT(*) FROM quiz_results qr WHERE qr.quiz_id = q.id AND qr.user_id = ?) as attempts
            FROM quizzes q
            JOIN courses c ON c.id = q.course_id
            WHERE c.status = 'active'
            ORDER BY c.title, q.level
        `, [userId, userId]);
        res.json({ success: true, quizzes });
    }));

    return router;
}

module.exports = { createQuizzesRouter };
