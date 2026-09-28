const express = require('express');
const { assertCanManageCourse } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');
const {
    COURSE_TAGS, COURSE_STATUSES, parseId, optionalText, requiredText, optionalInt, optionalMediaUrl
} = require('../utils/validation');

async function findCourseOr404(db, courseId) {
    const course = await db.get('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!course) throw new HttpError(404, 'Cours non trouvé.');
    return course;
}

async function findLessonWithCourseOr404(db, lessonId) {
    const lesson = await db.get(
        'SELECT l.*, c.created_by FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = ?',
        [lessonId]
    );
    if (!lesson) throw new HttpError(404, 'Leçon non trouvée.');
    return lesson;
}

function readLessonFields(body) {
    return {
        num: optionalInt(body.num, { field: 'numéro', min: 1, max: 10000 }),
        title: optionalText(body.title, { field: 'titre', max: 200 }),
        content: optionalText(body.content, { field: 'contenu', max: 100000 }),
        scripture: optionalText(body.scripture, { field: 'passage', max: 500 }),
        duration: optionalText(body.duration, { field: 'durée', max: 30 }),
        video_url: optionalMediaUrl(body.video_url, 'vidéo'),
        audio_url: optionalMediaUrl(body.audio_url, 'audio')
    };
}

function createCoursesRouter({ db, auth }) {
    const router = express.Router();
    const { authenticate, requireTeacher } = auth;

    // ---------- Consultation ----------

    router.get('/courses', authenticate, asyncHandler(async (req, res) => {
        const userId = req.user.userId;
        const courses = await db.all(`
            SELECT c.*, COUNT(l.id) as total_lessons,
                   COALESCE(p.completed_count, 0) as completed_lessons,
                   ROUND(CASE WHEN COUNT(l.id) > 0 THEN 100.0 * COALESCE(p.completed_count, 0) / COUNT(l.id) ELSE 0 END) as progress
            FROM courses c
            LEFT JOIN lessons l ON c.id = l.course_id
            LEFT JOIN (SELECT course_id, COUNT(*) as completed_count FROM lesson_progress WHERE user_id = ? AND completed = 1 GROUP BY course_id) p ON c.id = p.course_id
            WHERE c.status != 'draft' OR c.created_by = ?
            GROUP BY c.id
            ORDER BY c.id
        `, [userId, userId]);
        res.json({ success: true, courses });
    }));

    router.get('/courses/:id', authenticate, asyncHandler(async (req, res) => {
        const courseId = parseId(req.params.id);
        const userId = req.user.userId;
        const course = await db.get('SELECT * FROM courses WHERE id = ? AND (status != ? OR created_by = ?)', [courseId, 'draft', userId]);
        if (!course) throw new HttpError(404, 'Cours non trouvé.');

        const lessons = await db.all(`
            SELECT l.*, lp.completed, lp.watched_at
            FROM lessons l
            LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
            WHERE l.course_id = ? ORDER BY l.num
        `, [userId, courseId]);
        const completedLessons = lessons.filter((lesson) => lesson.completed).length;
        const quizzes = await db.all('SELECT id, level, level_name, pass_score FROM quizzes WHERE course_id = ? ORDER BY level', [courseId]);

        res.json({
            success: true,
            course: {
                ...course,
                completed_lessons: completedLessons,
                progress: lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0
            },
            lessons,
            quizzes
        });
    }));

    router.post('/lessons/:id/complete', authenticate, asyncHandler(async (req, res) => {
        const lessonId = parseId(req.params.id);
        const lesson = await db.get('SELECT course_id FROM lessons WHERE id = ?', [lessonId]);
        if (!lesson) throw new HttpError(404, 'Leçon non trouvée.');
        await db.run(
            `INSERT OR REPLACE INTO lesson_progress (user_id, lesson_id, course_id, completed, watched_at) VALUES (?, ?, ?, 1, datetime('now'))`,
            [req.user.userId, lessonId, lesson.course_id]
        );
        res.json({ success: true, message: 'Leçon terminée!' });
    }));

    // ---------- Gestion des cours (enseignant/admin) ----------

    router.post('/admin/courses', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const title = requiredText(req.body.title, { field: 'titre', max: 200 });
        const description = requiredText(req.body.description, { field: 'description', max: 5000 });
        const tag = COURSE_TAGS.includes(req.body.tag) ? req.body.tag : 'fondements';
        const hours = optionalInt(req.body.hours, { field: 'heures', max: 10000 }) ?? 0;
        const lessonsCount = optionalInt(req.body.lessons, { field: 'leçons', max: 10000 }) ?? 0;

        const result = await db.run(
            'INSERT INTO courses (title, description, tag, status, hours, lessons_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, description, tag, 'active', hours, lessonsCount, req.user.userId]
        );
        res.status(201).json({ success: true, courseId: result.lastID, message: 'Cours créé!' });
    }));

    router.put('/admin/courses/:id', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const courseId = parseId(req.params.id);
        assertCanManageCourse(req.user, await findCourseOr404(db, courseId));

        const fields = {
            title: optionalText(req.body.title, { field: 'titre', max: 200 }) || undefined,
            description: optionalText(req.body.description, { field: 'description', max: 5000 }) || undefined,
            tag: COURSE_TAGS.includes(req.body.tag) ? req.body.tag : undefined,
            hours: optionalInt(req.body.hours, { field: 'heures', max: 10000 }),
            status: COURSE_STATUSES.includes(req.body.status) ? req.body.status : undefined
        };
        const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
        if (entries.length === 0) throw new HttpError(400, 'Aucun champ à modifier.');

        await db.run(
            `UPDATE courses SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
            [...entries.map(([, value]) => value), courseId]
        );
        res.json({ success: true, message: 'Cours mis à jour!' });
    }));

    router.delete('/admin/courses/:id', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const courseId = parseId(req.params.id);
        assertCanManageCourse(req.user, await findCourseOr404(db, courseId));

        // lesson_progress et quiz_results n'ont pas de ON DELETE CASCADE : on les purge explicitement.
        await db.transaction(async () => {
            await db.run('DELETE FROM lesson_progress WHERE course_id = ?', [courseId]);
            await db.run('DELETE FROM quiz_results WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id = ?)', [courseId]);
            await db.run('DELETE FROM courses WHERE id = ?', [courseId]);
        });
        res.json({ success: true, message: 'Cours supprimé.' });
    }));

    // ---------- Gestion des leçons ----------

    router.post('/admin/courses/:courseId/lessons', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const courseId = parseId(req.params.courseId);
        assertCanManageCourse(req.user, await findCourseOr404(db, courseId));

        const lesson = readLessonFields(req.body);
        if (!lesson.num || !lesson.title) throw new HttpError(400, 'Numéro et titre requis.');

        const result = await db.transaction(async () => {
            const inserted = await db.run(
                'INSERT INTO lessons (course_id, num, title, content, scripture, duration, video_url, audio_url, has_video, has_audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [courseId, lesson.num, lesson.title, lesson.content || '', lesson.scripture || '', lesson.duration || '45 min',
                    lesson.video_url || '', lesson.audio_url || '', lesson.video_url ? 1 : 0, lesson.audio_url ? 1 : 0]
            );
            await db.run('UPDATE courses SET lessons_count = lessons_count + 1 WHERE id = ?', [courseId]);
            return inserted;
        });
        res.status(201).json({ success: true, lessonId: result.lastID, message: 'Leçon ajoutée!' });
    }));

    router.put('/admin/lessons/:id', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const lessonId = parseId(req.params.id);
        assertCanManageCourse(req.user, await findLessonWithCourseOr404(db, lessonId));

        const lesson = readLessonFields(req.body);
        const fields = {
            title: lesson.title || undefined,
            content: lesson.content,
            scripture: lesson.scripture,
            duration: lesson.duration || undefined,
            num: lesson.num,
            video_url: lesson.video_url,
            has_video: lesson.video_url === undefined ? undefined : Number(Boolean(lesson.video_url)),
            audio_url: lesson.audio_url,
            has_audio: lesson.audio_url === undefined ? undefined : Number(Boolean(lesson.audio_url))
        };
        const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
        if (entries.length === 0) throw new HttpError(400, 'Aucun champ à modifier.');

        await db.run(
            `UPDATE lessons SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
            [...entries.map(([, value]) => value), lessonId]
        );
        res.json({ success: true, message: 'Leçon mise à jour!' });
    }));

    router.delete('/admin/lessons/:id', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const lessonId = parseId(req.params.id);
        const lesson = await findLessonWithCourseOr404(db, lessonId);
        assertCanManageCourse(req.user, lesson);

        await db.transaction(async () => {
            await db.run('DELETE FROM lesson_progress WHERE lesson_id = ?', [lessonId]);
            await db.run('DELETE FROM lessons WHERE id = ?', [lessonId]);
            await db.run('UPDATE courses SET lessons_count = MAX(lessons_count - 1, 0) WHERE id = ?', [lesson.course_id]);
        });
        res.json({ success: true, message: 'Leçon supprimée.' });
    }));

    return router;
}

module.exports = { createCoursesRouter, findCourseOr404 };
