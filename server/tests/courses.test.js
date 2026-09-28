const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

describe('Cours, leçons et quiz', () => {
    let t;
    let teacherA;
    let teacherB;
    let admin;
    let student;
    let courseId;
    let lessonId;

    before(async () => {
        t = await startTestServer();
        teacherA = await t.createUser({ email: 'a@prof.com', role: 'enseignant' });
        teacherB = await t.createUser({ email: 'b@prof.com', role: 'enseignant' });
        admin = await t.createUser({ email: 'admin@prof.com', role: 'admin' });
        student = await t.createUser({ email: 'eleve@example.com' });
    });
    after(() => t.close());

    it('un étudiant ne peut pas créer de cours', async () => {
        const res = await t.request('POST', '/api/admin/courses', { token: student.token, body: { title: 'X', description: 'Y' } });
        assert.equal(res.status, 403);
    });

    it('un enseignant crée un cours et une leçon', async () => {
        const course = await t.request('POST', '/api/admin/courses', { token: teacherA.token, body: { title: 'Romains', description: 'Étude', tag: 'theologie', hours: 10 } });
        assert.equal(course.status, 201);
        courseId = course.body.courseId;

        const lesson = await t.request('POST', `/api/admin/courses/${courseId}/lessons`, {
            token: teacherA.token, body: { num: 1, title: 'Introduction', video_url: '/api/stream/abc' }
        });
        assert.equal(lesson.status, 201);
        lessonId = lesson.body.lessonId;
    });

    it('refuse une URL média dangereuse', async () => {
        const res = await t.request('POST', `/api/admin/courses/${courseId}/lessons`, {
            token: teacherA.token, body: { num: 2, title: 'XSS', video_url: 'javascript:alert(1)' }
        });
        assert.equal(res.status, 400);
    });

    it('un enseignant ne peut pas modifier ni supprimer le cours d’un autre', async () => {
        const put = await t.request('PUT', `/api/admin/courses/${courseId}`, { token: teacherB.token, body: { title: 'Piraté' } });
        assert.equal(put.status, 403);
        const del = await t.request('DELETE', `/api/admin/courses/${courseId}`, { token: teacherB.token });
        assert.equal(del.status, 403);
        const lessonPut = await t.request('PUT', `/api/admin/lessons/${lessonId}`, { token: teacherB.token, body: { title: 'Piraté' } });
        assert.equal(lessonPut.status, 403);
        const quiz = await t.request('POST', '/api/admin/quizzes', {
            token: teacherB.token, body: { course_id: courseId, questions: [{ question: 'Q', options: ['a', 'b'], answer: 0 }] }
        });
        assert.equal(quiz.status, 403);
    });

    it('un admin peut modifier le cours de n’importe quel enseignant', async () => {
        const res = await t.request('PUT', `/api/admin/courses/${courseId}`, { token: admin.token, body: { hours: 12 } });
        assert.equal(res.status, 200);
    });

    it('l’étudiant voit le cours et sa progression', async () => {
        const done = await t.request('POST', `/api/lessons/${lessonId}/complete`, { token: student.token });
        assert.equal(done.status, 200);
        const res = await t.request('GET', `/api/courses/${courseId}`, { token: student.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.course.progress, 100);
        assert.equal(res.body.lessons.length, 1);
    });

    it('rejette les ids non numériques', async () => {
        const res = await t.request('GET', '/api/courses/1%20OR%201=1', { token: student.token });
        assert.equal(res.status, 400);
    });

    it('valide les questions de quiz et corrige dans l’ordre des questions', async () => {
        const invalid = await t.request('POST', '/api/admin/quizzes', {
            token: teacherA.token, body: { course_id: courseId, questions: [{ question: 'Q', options: ['a', 'b'], answer: 5 }] }
        });
        assert.equal(invalid.status, 400);

        const created = await t.request('POST', '/api/admin/quizzes', {
            token: teacherA.token,
            body: {
                course_id: courseId, level: 1, pass_score: 50,
                questions: [
                    { question: 'Q1', options: ['a', 'b', 'c'], answer: 2 },
                    { question: 'Q2', options: ['a', 'b'], answer: 0 }
                ]
            }
        });
        assert.equal(created.status, 201);

        const quiz = await t.request('GET', `/api/quizzes/${courseId}/1`, { token: student.token });
        assert.deepEqual(quiz.body.questions.map((q) => q.question), ['Q1', 'Q2']);
        assert.ok(!('answer' in quiz.body.questions[0]), 'la bonne réponse ne doit pas être envoyée avant soumission');

        const submit = await t.request('POST', `/api/quizzes/${created.body.quizId}/submit`, { token: student.token, body: { answers: [2, 1] } });
        assert.equal(submit.status, 200);
        assert.equal(submit.body.correct, 1);
        assert.equal(submit.body.score, 50);
        assert.equal(submit.body.passed, true);
    });

    it('les statistiques reflètent l’activité', async () => {
        const studentStats = await t.request('GET', '/api/stats', { token: student.token });
        assert.equal(studentStats.body.stats.lessonsCompleted, 1);
        assert.equal(studentStats.body.stats.quizAttempts, 1);

        const students = await t.request('GET', '/api/admin/students', { token: teacherA.token });
        const row = students.body.students.find((s) => s.email === 'eleve@example.com');
        assert.equal(row.lessons_done, 1);
        assert.equal(row.avg_quiz_score, 50);
    });

    it('supprime une leçon puis un cours qui ont déjà de la progression et des résultats', async () => {
        const lesson = await t.request('DELETE', `/api/admin/lessons/${lessonId}`, { token: teacherA.token });
        assert.equal(lesson.status, 200);
        const course = await t.request('DELETE', `/api/admin/courses/${courseId}`, { token: teacherA.token });
        assert.equal(course.status, 200);
        const gone = await t.request('GET', `/api/courses/${courseId}`, { token: student.token });
        assert.equal(gone.status, 404);
    });
});
