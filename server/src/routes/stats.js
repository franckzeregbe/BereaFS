const express = require('express');
const { TEACHER_ROLES } = require('../middleware/auth');
const { asyncHandler } = require('../utils/http');

async function teacherStats(db, userId) {
    const [students, courses, quizAttempts, myCourses] = await Promise.all([
        db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'etudiant' AND is_active = 1`),
        db.get(`SELECT COUNT(*) as count FROM courses WHERE status = 'active' AND created_by = ?`, [userId]),
        db.get(`SELECT COUNT(*) as count FROM quiz_results qr
                JOIN quizzes q ON q.id = qr.quiz_id
                JOIN courses c ON c.id = q.course_id
                WHERE c.created_by = ?`, [userId]),
        db.all(`
            SELECT c.id, COUNT(l.id) as total_lessons, COALESCE(p.completed_count, 0) as completed_lessons
            FROM courses c
            LEFT JOIN lessons l ON c.id = l.course_id
            LEFT JOIN (SELECT course_id, COUNT(*) as completed_count FROM lesson_progress WHERE completed = 1 GROUP BY course_id) p ON c.id = p.course_id
            WHERE c.created_by = ?
            GROUP BY c.id
        `, [userId])
    ]);
    const avgProgress = myCourses.length
        ? Math.round(myCourses.reduce((sum, c) => sum + (c.total_lessons ? (100 * c.completed_lessons) / c.total_lessons : 0), 0) / myCourses.length)
        : 0;
    return { students: students.count, courses: courses.count, avgProgress, quizAttempts: quizAttempts.count };
}

async function studentStats(db, userId) {
    const [courses, lessons, quiz] = await Promise.all([
        db.get(`SELECT COUNT(*) as count FROM courses WHERE status = 'active'`),
        db.get('SELECT COUNT(*) as count FROM lesson_progress WHERE user_id = ? AND completed = 1', [userId]),
        db.get('SELECT COUNT(*) as count, COALESCE(AVG(score), 0) as avg_score FROM quiz_results WHERE user_id = ?', [userId])
    ]);
    return {
        courses: courses.count,
        lessonsCompleted: lessons.count,
        quizAttempts: quiz.count,
        quizAvg: Math.round(quiz.avg_score)
    };
}

function createStatsRouter({ db, auth }) {
    const router = express.Router();
    const { authenticate, requireTeacher } = auth;

    router.get('/stats', authenticate, asyncHandler(async (req, res) => {
        const { userId, role } = req.user;
        if (TEACHER_ROLES.includes(role)) {
            res.json({ success: true, role: 'enseignant', stats: await teacherStats(db, userId) });
        } else {
            res.json({ success: true, role: 'etudiant', stats: await studentStats(db, userId) });
        }
    }));

    router.get('/admin/students', authenticate, requireTeacher, asyncHandler(async (req, res) => {
        const students = await db.all(`
            SELECT u.id, u.name, u.email, u.country, u.created_at,
                   COUNT(DISTINCT lp.course_id) as courses_started,
                   COALESCE(SUM(lp.completed), 0) as lessons_done,
                   MAX(lp.watched_at) as last_activity,
                   (SELECT ROUND(AVG(score)) FROM quiz_results qr WHERE qr.user_id = u.id) as avg_quiz_score
            FROM users u
            LEFT JOIN lesson_progress lp ON lp.user_id = u.id
            WHERE u.role = 'etudiant' AND u.is_active = 1
            GROUP BY u.id
            ORDER BY last_activity DESC
        `);
        res.json({ success: true, students });
    }));

    return router;
}

module.exports = { createStatsRouter };
