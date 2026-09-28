/**
 * BereaFS API Client
 * Module central pour toutes les requêtes serveur
 */
const API = (() => {
    const BASE = window.location.origin;
    let token = localStorage.getItem('bereafs_token');

    const setToken = (t) => {
        token = t;
        if (t) localStorage.setItem('bereafs_token', t);
        else localStorage.removeItem('bereafs_token');
    };

    const getToken = () => token;

    const headers = () => ({
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    });

    // Session expiree -> nettoyage + redirection (sauf sur la page de connexion)
    const handleExpiredSession = () => {
        token = null;
        localStorage.removeItem('bereafs_token');
        localStorage.removeItem('bereafs_current');
        if (window.location.pathname !== '/client/index.html' && window.location.pathname !== '/') {
            window.location.href = '/client/index.html';
        }
    };

    const request = async (url, options = {}) => {
        const res = await fetch(`${BASE}${url}`, {
            ...options,
            headers: { ...headers(), ...options.headers }
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && token) { handleExpiredSession(); throw new Error(data.error || 'Session expirée.'); }
        if (res.status === 403 && /expir/i.test(data.error || '') && token) { handleExpiredSession(); throw new Error(data.error); }
        if (!res.ok) throw new Error(data.error || 'Erreur serveur');
        return data;
    };

    return {
        setToken,
        getToken,

        // AUTH
        async login(email, password) {
            const data = await request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            setToken(data.token);
            return data;
        },

        async register(name, email, password, phone, country) {
            const data = await request('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({ name, email, password, phone, country })
            });
            setToken(data.token);
            return data;
        },

        async getProfile() {
            return request('/api/auth/me');
        },

        // STATS / QUIZZES / STUDENTS
        async getStats() {
            return request('/api/stats');
        },

        async getMyQuizzes() {
            return request('/api/my/quizzes');
        },

        async getStudents() {
            return request('/api/admin/students');
        },

        // COURSES
        async getCourses() {
            return request('/api/courses');
        },

        async getCourse(id) {
            return request(`/api/courses/${id}`);
        },

        // LESSONS
        async completeLesson(lessonId) {
            return request(`/api/lessons/${lessonId}/complete`, { method: 'POST' });
        },

        // QUIZ
        async getQuiz(courseId, level) {
            return request(`/api/quizzes/${courseId}/${level}`);
        },

        async submitQuiz(quizId, answers) {
            return request(`/api/quizzes/${quizId}/submit`, {
                method: 'POST',
                body: JSON.stringify({ answers })
            });
        },

        // ADMIN / UPLOAD
        async createCourse(title, description, tag, hours, lessons) {
            return request('/api/admin/courses', {
                method: 'POST',
                body: JSON.stringify({ title, description, tag, hours, lessons })
            });
        },

        async updateCourse(id, data) {
            return request(`/api/admin/courses/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        },

        async deleteCourse(id) {
            return request(`/api/admin/courses/${id}`, { method: 'DELETE' });
        },

        async addLesson(courseId, data) {
            return request(`/api/admin/courses/${courseId}/lessons`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },

        async updateLesson(id, data) {
            return request(`/api/admin/lessons/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        },

        async deleteLesson(id) {
            return request(`/api/admin/lessons/${id}`, { method: 'DELETE' });
        },

        // PROFILE
        async updateProfile(data) {
            return request('/api/auth/profile', {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        },

        // QUIZ
        async createQuiz(data) {
            return request('/api/admin/quizzes', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },

        async uploadVideo(file, onProgress) {
            return new Promise((resolve, reject) => {
                const fd = new FormData();
                fd.append('media', file);

                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${BASE}/api/admin/upload`);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                if (onProgress) {
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                    });
                }

                xhr.addEventListener('load', () => {
                    try {
                        const res = JSON.parse(xhr.responseText);
                        if (!res.success) reject(new Error(res.error));
                        else resolve(res);
                    } catch (err) { reject(err); }
                });
                xhr.addEventListener('error', () => reject(new Error('Erreur réseau')));
                xhr.send(fd);
            });
        },

        uploadMedia(file, onProgress) {
            return this.uploadVideo(file, onProgress);
        },

        // VIDEO STREAMING (utilisé par server.js aussi)
        async getVideos() {
            return request('/api/videos');
        },

        async deleteVideo(videoId) {
            return request(`/api/videos/${videoId}`, { method: 'DELETE' });
        },

        getStreamUrl(videoId) {
            return `${BASE}/api/stream/${videoId}`;
        },

        getThumbnailUrl(videoId) {
            return `${BASE}/api/thumbnail/${videoId}`;
        },

        async health() {
            return request('/api/health');
        }
    };
})();
