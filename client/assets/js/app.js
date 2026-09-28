/**
 * BereaFS App — Main Dashboard Logic
 * Sécurisé: XSS protégé, auth obligatoire
 */
(function() {
    'use strict';

    let currentUser = null;
    let currentPage = 'dashboard';

    function esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    document.addEventListener('DOMContentLoaded', () => {
        initAuth();
        Security.setupSessionTimeout(30 * 60 * 1000);
    });

    function initAuth() {
        currentUser = Auth.requireAuth();
        if (!currentUser) return;

        document.getElementById('sidebarAvatar').textContent = currentUser.avatar || '??';
        document.getElementById('sidebarName').textContent = currentUser.name;
        document.getElementById('sidebarRole').textContent = currentUser.role === 'enseignant' ? 'Enseignant' : 'Étudiant';

        renderNav();
        showPage('dashboard');
    }

    function renderNav() {
        const isEns = Auth.isEnseignant();
        const nav = document.getElementById('navItems');
        const items = isEns ? [
            {section:'Gestion',items:[
                {id:'dashboard',icon:'',label:'Tableau de bord'},
                {id:'courses',icon:'📚',label:'Mes Cours'},
                {id:'upload',icon:'📤',label:'Upload Vidéo'},
                {id:'create',icon:'✏️',label:'Créer un Cours'},
                {id:'students',icon:'👥',label:'Étudiants'}
            ]},
            {section:'Analyse',items:[
                {id:'analytics',icon:'📈',label:'Statistiques'},
                {id:'quizzes',icon:'',label:'Quiz & Examens'}
            ]}
        ] : [
            {section:'Apprentissage',items:[
                {id:'dashboard',icon:'🏠',label:'Mon Parcours'},
                {id:'courses',icon:'',label:'Mes Cours'},
                {id:'progress',icon:'📊',label:'Ma Progression'}
            ]},
            {section:'Pratique',items:[
                {id:'quizzes',icon:'✍️',label:'Quizzes'},
                {id:'memorization',icon:'',label:'Mémorisation'},
                {id:'certificates',icon:'🎓',label:'Certificats'}
            ]}
        ];
        nav.innerHTML = items.map(g => `
            <div class="nav-section">${g.section}</div>
            ${g.items.map(i => `<a class="nav-item${currentPage===i.id?' active':''}" data-page="${i.id}" onclick="showPage('${i.id}')"><span>${i.icon}</span> ${i.label}</a>`).join('')}
        `).join('');
    }

    function showPage(page, params) {
        currentPage = page;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n => n.classList.add('active'));
        document.getElementById('sidebar').classList.remove('open');
        const main = document.getElementById('main');
        const pages = { dashboard:renderDashboard, courses:renderCourses, upload:renderUpload, create:renderCreate, students:renderStudents, analytics:renderAnalytics, quizzes:renderQuizzes, progress:renderProgress, memorization:renderMemorization, certificates:renderCertificates };
        (pages[page] || renderPlaceholder)(main, params);
    }

    async function renderDashboard(container) {
        const isEns = Auth.isEnseignant();
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
        try {
            const [data, statsData] = await Promise.all([API.getCourses(), API.getStats()]);
            const courses = data.success ? data.courses : [];
            const active = courses.filter(c => c.status === 'active').slice(0, 3);
            const s = statsData.success ? statsData.stats : {};
            const cards = isEns ? [
                { label: 'Élèves inscrits', value: s.students ?? '—', trend: 'Inscrits sur la plateforme', cls: 'trend-up' },
                { label: 'Cours publiés', value: s.courses ?? '—', trend: 'En ligne', cls: 'trend-up' },
                { label: 'Complétion moyenne', value: (s.avgProgress ?? 0) + '%', trend: 'Tous cours', cls: 'trend-up' },
                { label: 'Tentatives de quiz', value: s.quizAttempts ?? '—', trend: 'Sur mes cours', cls: 'trend-up' }
            ] : [
                { label: 'Modules suivis', value: courses.length || '0', trend: 'Disponibles', cls: 'trend-up' },
                { label: 'Leçons terminées', value: s.lessonsCompleted ?? '—', trend: 'Bravo !', cls: 'trend-up' },
                { label: 'Progression moyenne', value: avgProgress(courses) + '%', trend: 'Tous modules', cls: 'trend-up' },
                { label: 'Quiz tentés', value: s.quizAttempts ?? '0', trend: s.quizAvg != null ? 'Moyenne: ' + s.quizAvg + '%' : 'Aucun quiz', cls: 'trend-up' }
            ];
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>${isEns ? 'Tableau de bord' : 'Mon Parcours'}</h2>${isEns ? '<button class="btn btn-primary" onclick="showPage(\'create\')">+ Nouveau cours</button>' : ''}</div>
                <div class="stats-grid">
                    ${cards.map(c => `<div class="stat-card"><div class="stat-label">${c.label}</div><div class="stat-value">${c.value}</div><div class="stat-trend ${c.cls}">${c.trend}</div></div>`).join('')}
                </div>
                <div class="section-header"><h3 class="section-title">${isEns ? 'Modules actifs' : 'Continuer mon apprentissage'}</h3><button class="btn btn-outline" onclick="showPage('courses')">Voir tout →</button></div>
                <div class="modules-grid">
                    ${active.length > 0 ? active.map((c, i) => `
                        <div class="module-card" style="animation-delay:${i*0.1}s">
                            <div class="module-header"><span class="module-tag tag-${escAttr(c.tag||'fondements')}">${esc(c.tag||'Fondements')}</span><h4 class="module-title">${esc(c.title)}</h4><p class="module-desc">${esc(c.description||'')}</p></div>
                            <div class="module-progress"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${c.progress||0}%"></div></div><div class="progress-text"><span>${c.completed_lessons||0}/${c.total_lessons||c.lessons_count||0} leçons</span><span class="pct">${c.progress||0}%</span></div></div>
                            <div class="module-footer"><div class="module-meta"><span>⏱ ${c.hours||0}h</span><span>📚 ${c.total_lessons||c.lessons_count||0} leçons</span></div><a class="module-link" onclick="event.preventDefault();showPage('courses',{course:${c.id}})">Continuer →</a></div>
                        </div>
                    `).join('') : '<p style="color:var(--text-light)">Aucun cours disponible.</p>'}
                </div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`;
        }
    }

    function avgProgress(courses) {
        if (!courses || !courses.length) return 0;
        return Math.round(courses.reduce((s, c) => s + (c.progress || 0), 0) / courses.length);
    }

    async function renderCourses(container, params) {
        if (params && params.course) return showCourseDetail(container, params.course);
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
        try {
            const data = await API.getCourses();
            const courses = data.success ? data.courses : [];
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>📚 ${Auth.isEnseignant() ? 'Mes Cours' : 'Mes Modules'}</h2>${Auth.isEnseignant() ? '<button class="btn btn-primary" onclick="showPage(\'create\')">+ Créer un cours</button>' : ''}</div>
                <div class="modules-grid">
                    ${courses.map(c => `
                        <div class="module-card">
                            <div class="module-header"><span class="module-tag tag-${escAttr(c.tag||'fondements')}">${esc(c.tag||'Fondements')}</span><h4 class="module-title">${esc(c.title)}</h4><p class="module-desc">${esc(c.description||'')}</p></div>
                            <div class="module-progress"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${c.progress||0}%"></div></div><div class="progress-text"><span>${c.completed_lessons||0}/${c.total_lessons||c.lessons_count||0} leçons</span><span class="pct">${c.progress||0}%</span></div></div>
                            <div class="module-footer"><span style="font-size:.8rem;color:var(--text-light)">⏱ ${c.hours||0}h • 📚 ${c.total_lessons||c.lessons_count||0} leçons</span><a class="module-link" onclick="event.preventDefault();showPage('courses',{course:${c.id}})">Ouvrir →</a></div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        } catch (err) { container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`; }
    }

    async function showCourseDetail(container, courseId) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
        try {
            const data = await API.getCourse(courseId);
            if (!data.success || !data.course) throw new Error('Cours non trouvé');
            const lessons = data.lessons || [];
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>${esc(data.course.title)}</h2><button class="btn btn-outline" onclick="showPage('courses')">← Retour</button></div>
                <div class="panel" style="margin-bottom:20px">
                    <div style="display:flex;gap:12px;margin-bottom:16px"><span class="module-tag tag-${escAttr(data.course.tag||'fondements')}">${esc(data.course.tag||'Fondements')}</span></div>
                    <p style="color:var(--text-light);line-height:1.7;margin-bottom:20px">${esc(data.course.description||'')}</p>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
                        <div style="text-align:center;padding:16px;background:#f8fafb;border-radius:12px"><div style="font-size:1.5rem;font-weight:700">${lessons.length}</div><div style="font-size:.8rem;color:var(--text-light)">Leçons</div></div>
                        <div style="text-align:center;padding:16px;background:#f8fafb;border-radius:12px"><div style="font-size:1.5rem;font-weight:700">${data.course.hours||0}h</div><div style="font-size:.8rem;color:var(--text-light)">Durée</div></div>
                        <div style="text-align:center;padding:16px;background:#f8fafb;border-radius:12px"><div style="font-size:1.5rem;font-weight:700">${(data.quizzes||[]).length}</div><div style="font-size:.8rem;color:var(--text-light)">Quiz</div></div>
                        <div style="text-align:center;padding:16px;background:#f8fafb;border-radius:12px"><div style="font-size:1.5rem;font-weight:700;color:var(--accent)">${data.course.progress||0}%</div><div style="font-size:.8rem;color:var(--text-light)">Progression</div></div>
                    </div>
                    <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:16px">Contenu du cours</h3>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${lessons.map((l, i) => {
                            const isDone = l.completed;
                            const isCurrent = !isDone && (!lessons.find(x => !x.completed && x.num < l.num));
                            return `<div class="lesson-item ${isCurrent?'active':''}" onclick="openLesson(${courseId},${l.id})">
                                <div class="lesson-number ${isDone?'done':isCurrent?'current':'pending'}">${isDone?'✓':l.num}</div>
                                <div style="flex:1"><div style="font-weight:600">${esc(l.title)}</div>
                                <div style="font-size:.8rem;color:var(--text-light);display:flex;gap:12px;margin-top:2px"><span>⏱ ${esc(l.duration||'45min')}</span>${l.has_video?'<span>🎥 Vidéo</span>':''}${l.has_audio?'<span>🎧 Audio</span>':''}</div></div>
                                ${isCurrent?'<button class="btn btn-sm btn-primary">Lire</button>':isDone?'<span style="color:var(--success);font-size:.8rem">✓ Terminé</span>':''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
                ${Auth.isEnseignant() ? `
                <div class="panel" style="max-width:800px">
                    <h3 style="margin-bottom:6px">Ajouter une leçon</h3>
                    <p style="color:var(--text-light);font-size:.9rem;margin-bottom:20px">Ajoutez le contenu, puis associez une vidéo ou un audio déjà téléversé.</p>
                    <form onsubmit="addLesson(event,${courseId})">
                        <div class="form-grid">
                            <div class="input-group"><label>Numéro</label><input type="number" id="lNum" value="${lessons.length + 1}" min="1" required></div>
                            <div class="input-group"><label>Titre</label><input type="text" id="lTitle" placeholder="Ex. La grâce de Dieu" required></div>
                            <div class="input-group"><label>Durée</label><input type="text" id="lDuration" value="45 min" required></div>
                            <div class="input-group"><label>Référence biblique</label><input type="text" id="lScripture" placeholder="Ex. Éphésiens 2:8-9"></div>
                            <div class="input-group form-full"><label>Contenu de la leçon</label><textarea id="lContent" placeholder="Résumé ou notes à lire avant la vidéo."></textarea></div>
                            <div class="input-group form-full"><label>URL de la vidéo (facultatif)</label><input type="url" id="lVideo" placeholder="/uploads/videos/nom-de-fichier.mp4"></div>
                            <div class="input-group form-full"><label>URL de l'audio (facultatif)</label><input type="url" id="lAudio" placeholder="/uploads/audios/nom-de-fichier.mp3"></div>
                        </div>
                        <button type="submit" class="btn btn-primary">+ Ajouter la leçon</button>
                    </form>
                </div>` : ''}
            </div>`;
        } catch (err) { container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`; }
    }

    function openLesson(courseId, lessonId) {
        window.location.href = `/client/lesson-streaming.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`;
    }

    function renderUpload(container) {
        container.innerHTML = `
        <div class="animate-fade">
            <div class="top-bar"><h2>📤 Upload Vidéo</h2></div>
            <div class="panel" style="max-width:800px">
                <div class="upload-zone" id="dropZone">
                    <h2> Glissez votre vidéo ici</h2>
                    <p style="color:var(--text-light);margin:12px 0">ou cliquez pour sélectionner</p>
                    <button class="btn btn-primary">Choisir une vidéo</button>
                    <input type="file" id="videoFileInput" accept="video/*" style="display:none">
                    <div class="upload-progress" id="uploadProgress"><div class="upload-progress-fill" id="uploadProgressFill">0%</div></div>
                </div>
                <div id="uploadStatus" style="margin-top:16px"></div>
            </div>
            <div class="panel" style="margin-top:24px"><h3 style="margin-bottom:16px">Vidéos disponibles</h3><div id="videoList"><p style="color:var(--text-light)">Chargement...</p></div></div>
        </div>`;

        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('videoFileInput');
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleVideoUpload(e.dataTransfer.files[0]); });
        fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleVideoUpload(e.target.files[0]); });
        loadVideoList();
    }

    async function handleVideoUpload(file) {
        const pe = document.getElementById('uploadProgress'), pf = document.getElementById('uploadProgressFill');
        pe.style.display = 'block';
        try {
            await API.uploadVideo(file, (pct) => { pf.style.width = pct + '%'; pf.textContent = pct + '%'; });
            Notifications.success('Vidéo uploadée avec succès!');
            loadVideoList();
        } catch (err) { Notifications.error('Erreur upload: ' + err.message); }
        finally { pe.style.display = 'none'; }
    }

    async function loadVideoList() {
        const c = document.getElementById('videoList');
        if (!c) return;
        try {
            const data = await API.getVideos();
            const videos = data.videos || [];
            if (!videos.length) { c.innerHTML = '<p style="color:var(--text-light)">Aucune vidéo uploadée.</p>'; return; }
            c.innerHTML = '<div class="modules-grid">' + videos.map(v => `
                <div class="panel" style="text-align:center">
                    <img src="${escAttr(API.getThumbnailUrl(v.id))}" style="width:100%;border-radius:12px;margin-bottom:12px" onerror="this.style.display='none'">
                    <h4 style="font-size:.9rem">${esc(v.originalName)}</h4>
                    <p style="font-size:.8rem;color:var(--text-light)">${esc(v.sizeHuman||'')}</p>
                    <div style="display:flex;gap:8px;margin-top:12px;justify-content:center">
                        <button class="btn btn-sm btn-primary" onclick="window.open('${escAttr(API.getStreamUrl(v.id))}','_blank')">▶ Lire</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteVideo('${escAttr(v.id)}')">🗑</button>
                    </div>
                </div>
            `).join('') + '</div>';
        } catch (err) { c.innerHTML = '<p style="color:var(--danger)">Erreur de chargement.</p>'; }
    }

    async function deleteVideo(id) {
        if (!confirm('Supprimer cette vidéo ?')) return;
        try { await API.deleteVideo(id); Notifications.success('Vidéo supprimée'); loadVideoList(); }
        catch (err) { Notifications.error(err.message); }
    }

    function renderCreate(container) {
        container.innerHTML = `
        <div class="animate-fade">
            <div class="top-bar"><h2>✏️ Créer un Cours</h2><button class="btn btn-outline" onclick="showPage('dashboard')">← Retour</button></div>
            <div class="panel" style="max-width:800px">
                <form onsubmit="createCourse(event)">
                    <div class="form-grid">
                        <div class="input-group"><label>Titre</label><input type="text" id="cTitle" placeholder="Ex: Les Fondements de la Foi" required></div>
                        <div class="input-group"><label>Catégorie</label><select id="cCategory"><option value="fondements">Fondements</option><option value="theologie">Théologie</option><option value="pratique">Pratique</option><option value="avance">Avancé</option></select></div>
                        <div class="input-group"><label>Leçons</label><input type="number" id="cLessons" min="1" max="50" value="12" required></div>
                        <div class="input-group"><label>Heures</label><input type="number" id="cHours" min="1" max="200" value="40" required></div>
                        <div class="input-group form-full"><label>Description</label><textarea id="cDesc" required></textarea></div>
                    </div>
                    <button type="submit" class="btn btn-primary">💾 Créer</button>
                </form>
            </div>
        </div>`;
    }

    async function createCourse(e) {
        e.preventDefault();
        try {
            await API.createCourse(document.getElementById('cTitle').value, document.getElementById('cDesc').value, document.getElementById('cCategory').value, parseInt(document.getElementById('cHours').value), parseInt(document.getElementById('cLessons').value));
            Notifications.success('Cours créé!');
            setTimeout(() => showPage('courses'), 800);
        } catch (err) { Notifications.error(err.message); }
    }

    async function addLesson(e, courseId) {
        e.preventDefault();
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await API.addLesson(courseId, {
                num: Number(document.getElementById('lNum').value),
                title: document.getElementById('lTitle').value.trim(),
                duration: document.getElementById('lDuration').value.trim(),
                scripture: document.getElementById('lScripture').value.trim(),
                content: document.getElementById('lContent').value.trim(),
                video_url: document.getElementById('lVideo').value.trim(),
                audio_url: document.getElementById('lAudio').value.trim()
            });
            Notifications.success('Leçon ajoutée.');
            showPage('courses', { course: courseId });
        } catch (err) {
            Notifications.error(err.message);
            button.disabled = false;
        }
    }

    async function renderStudents(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
        try {
            const data = await API.getStudents();
            const students = data.success ? data.students : [];
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>👥 Gestion des Étudiants</h2><span style="color:var(--text-light);font-size:.9rem">${students.length} étudiant(s) inscrit(s)</span></div>
                <div class="panel">
                    <div style="margin-bottom:16px"><input type="text" id="studentSearch" placeholder="Rechercher un étudiant (nom ou email)..." style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:12px;outline:none;font-family:inherit"></div>
                    <div style="overflow-x:auto">
                    <table class="data-table" id="studentsTable"><thead><tr><th>Élève</th><th>Email</th><th>Pays</th><th>Leçons terminées</th><th>Note quiz</th><th>Dernière activité</th><th>Statut</th></tr></thead><tbody></tbody></table>
                    </div>
                    <p id="noStudents" style="color:var(--text-light);display:none;text-align:center;padding:24px">Aucun étudiant trouvé.</p>
                </div>
            </div>`;
            const tbody = container.querySelector('tbody');
            const noEl = container.querySelector('#noStudents');
            const fmtDate = (d) => d ? new Date(d + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            const initials = (n) => String(n || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const render = (list) => {
                tbody.innerHTML = list.map(st => {
                    const initialsHtml = esc(initials(st.name));
                    const active = st.last_activity && (Date.now() - new Date(st.last_activity + 'Z').getTime()) < 30 * 24 * 3600 * 1000;
                    return `<tr data-name="${escAttr((st.name + ' ' + st.email).toLowerCase())}">
                        <td><div class="student-name"><div class="mini-avatar">${initialsHtml}</div>${esc(st.name)}</div></td>
                        <td>${esc(st.email)}</td>
                        <td>${esc(st.country || '—')}</td>
                        <td>${st.lessons_done || 0} <span style="color:var(--text-light);font-size:.8rem">(${st.courses_started || 0} cours)</span></td>
                        <td>${st.avg_quiz_score != null ? `<span class="score-ring ${st.avg_quiz_score >= 70 ? 'score-high' : st.avg_quiz_score >= 50 ? 'score-mid' : 'score-low'}">${st.avg_quiz_score}</span>` : '<span style="color:var(--text-light)">—</span>'}</td>
                        <td>${fmtDate(st.last_activity)}</td>
                        <td><span class="status-badge ${active ? 'status-actif' : 'status-retard'}">${active ? 'Actif' : 'Inactif'}</span></td>
                    </tr>`;
                }).join('');
                noEl.style.display = list.length ? 'none' : 'block';
            };
            render(students);
            container.querySelector('#studentSearch').addEventListener('input', (e) => {
                const q = e.target.value.trim().toLowerCase();
                render(students.filter(st => (st.name + ' ' + st.email).toLowerCase().includes(q)));
            });
        } catch (err) { container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`; }
    }

    async function renderQuizzes(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
        try {
            const data = await API.getMyQuizzes();
            const quizzes = data.success ? data.quizzes : [];
            const isEns = Auth.isEnseignant();
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>❓ Quiz & Examens</h2>${isEns ? '<button class="btn btn-primary" id="newQuizBtn">+ Créer un quiz</button>' : ''}</div>
                <div id="quizList" class="modules-grid">
                    ${quizzes.length === 0
                        ? `<div class="panel" style="grid-column:1/-1"><p style="color:var(--text-light);text-align:center;padding:20px">${isEns ? 'Aucun quiz. Créez-en un pour vos étudiants.' : 'Aucun quiz disponible pour le moment.'}</p></div>`
                        : quizzes.map(q => `
                        <div class="panel">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
                                <span class="module-tag tag-fondements">${esc(q.level_name || 'Niveau ' + q.level)}</span>
                                ${q.best_score != null ? `<span class="score-ring ${q.best_score >= q.pass_score ? 'score-high' : q.best_score >= 50 ? 'score-mid' : 'score-low'}">${q.best_score}</span>` : ''}
                            </div>
                            <h3 style="font-size:1rem;margin-bottom:4px">${esc(q.course_title)}</h3>
                            <p style="color:var(--text-light);font-size:.85rem;margin-bottom:12px">${q.questions_count} question(s) • Seuil: ${q.pass_score}%${q.best_score != null ? ` • Meilleur score: ${q.best_score}%${q.attempts > 1 ? ` (${q.attempts} tentatives)` : ''}` : ' • Pas encore tenté'}</p>
                            <button class="btn ${q.best_score != null ? 'btn-outline' : 'btn-primary'} quiz-start" data-course="${q.course_id}" data-level="${q.level}">${q.best_score != null ? '🔄 Refaire' : '▶ Commencer'}</button>
                        </div>`).join('')}
                </div>
                <div id="quizRunner"></div>
            </div>`;

            container.querySelectorAll('.quiz-start').forEach(btn => {
                btn.addEventListener('click', () => startQuiz(container, Number(btn.dataset.course), Number(btn.dataset.level)));
            });
            const newBtn = container.querySelector('#newQuizBtn');
            if (newBtn) newBtn.addEventListener('click', () => renderQuizForm(container));

            if (isEns) {
                const coursesData = await API.getCourses();
                container._teacherCourses = (coursesData.success ? coursesData.courses : []).filter(c => c.status === 'active');
            }
        } catch (err) { container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`; }
    }

    async function startQuiz(container, courseId, level) {
        const runner = container.querySelector('#quizRunner');
        runner.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement du quiz...</div>';
        try {
            const data = await API.getQuiz(courseId, level);
            if (!data.success || !data.questions || !data.questions.length) throw new Error('Quiz vide');
            const questions = data.questions.map(q => ({
                id: q.id,
                question: q.question,
                options: JSON.parse(q.options),
                answer: null
            }));
            let current = 0;
            const answers = [];

            const renderQuestion = () => {
                const q = questions[current];
                runner.innerHTML = `
                <div class="quiz-container" style="margin-top:24px">
                    <div style="display:flex;justify-content:space-between;font-size:.85rem;color:var(--text-light);margin-bottom:12px"><span>Question ${current + 1}/${questions.length}</span><button class="btn btn-sm btn-outline" id="quizQuit">← Quitter</button></div>
                    <div class="quiz-progress"><div class="quiz-progress-fill" style="width:${(current / questions.length) * 100}%"></div></div>
                    <div class="quiz-question">${esc(q.question)}</div>
                    <div class="quiz-options">
                        ${q.options.map((opt, i) => `
                            <div class="quiz-option${answers[current] === i ? ' selected' : ''}" data-i="${i}">
                                <div class="quiz-letter">${String.fromCharCode(65 + i)}</div>
                                <div>${esc(opt)}</div>
                            </div>`).join('')}
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:24px;gap:12px">
                        <button class="btn btn-outline" id="quizPrev" ${current === 0 ? 'disabled' : ''}>← Précédent</button>
                        <button class="btn btn-primary" id="quizNext" ${answers[current] == null ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>${current === questions.length - 1 ? '✓ Soumettre' : 'Suivant →'}</button>
                    </div>
                </div>`;
                runner.querySelector('#quizQuit').addEventListener('click', () => { runner.innerHTML = ''; });
                runner.querySelectorAll('.quiz-option').forEach(el => el.addEventListener('click', () => {
                    answers[current] = Number(el.dataset.i);
                    runner.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
                    el.classList.add('selected');
                    const nextBtn = runner.querySelector('#quizNext');
                    nextBtn.disabled = false; nextBtn.removeAttribute('style');
                }));
                runner.querySelector('#quizPrev').addEventListener('click', () => { if (current > 0) { current--; renderQuestion(); } });
                runner.querySelector('#quizNext').addEventListener('click', async () => {
                    if (answers[current] == null) return;
                    if (current < questions.length - 1) { current++; renderQuestion(); return; }
                    const btn = runner.querySelector('#quizNext');
                    btn.disabled = true; btn.textContent = 'Correction...';
                    try {
                        const result = await API.submitQuiz(data.quiz.id, answers);
                        renderQuizResult(runner, questions, answers, result, () => startQuiz(container, courseId, level));
                    } catch (err) { Notifications.error(err.message); btn.disabled = false; btn.textContent = '✓ Soumettre'; }
                });
            };
            renderQuestion();
        } catch (err) { runner.innerHTML = `<div class="panel"><p style="color:var(--danger)">${esc(err.message)}</p></div>`; }
    }

    function renderQuizResult(runner, questions, answers, result, retryFn) {
        const passed = result.passed;
        runner.innerHTML = `
        <div class="quiz-container" style="margin-top:24px;text-align:center">
            <div style="font-size:3rem;margin-bottom:8px">${passed ? '🎉' : '📚'}</div>
            <h2 style="font-size:1.6rem;font-weight:700">${passed ? 'Réussi !' : 'Presque !'}</h2>
            <div style="font-size:2.5rem;font-weight:800;color:${passed ? 'var(--success)' : 'var(--danger)'};margin:12px 0">${result.score}%</div>
            <p style="color:var(--text-light);margin-bottom:20px">${result.correct}/${result.total} réponses correctes • Seuil de réussite: ${result.passScore}%</p>
            <div style="text-align:left;margin:20px 0">
                ${questions.map((q, i) => {
                    const r = result.results[i];
                    return `<div style="padding:14px 0;border-bottom:1px solid var(--border)">
                        <div style="display:flex;gap:10px;align-items:flex-start"><span>${r.isCorrect ? '✅' : '❌'}</span><div><div style="font-weight:600">${esc(q.question)}</div>
                        <div style="font-size:.85rem;color:var(--text-light);margin-top:4px">Votre réponse: ${r.userAnswer != null && !Number.isNaN(r.userAnswer) ? esc(q.options[r.userAnswer]) : 'Aucune'}${r.isCorrect ? '' : ' — Bonne réponse: ' + esc(q.options[r.correctAnswer])}</div>
                        ${r.explanation ? `<div class="explanation show" style="margin-top:10px;font-size:.85rem">${esc(r.explanation)}</div>` : ''}</div></div>
                    </div>`;
                }).join('')}
            </div>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
                <button class="btn btn-outline" id="quizBackList">← Retour aux quiz</button>
                <button class="btn btn-primary" id="quizRetry">🔄 Refaire</button>
            </div>
        </div>`;
        runner.querySelector('#quizBackList').addEventListener('click', () => { runner.innerHTML = ''; });
        runner.querySelector('#quizRetry').addEventListener('click', retryFn);
        if (passed) Notifications.success('Quiz réussi avec ' + result.score + '% !');
    }

    function renderQuizForm(container) {
        const runner = container.querySelector('#quizRunner');
        const courses = container._teacherCourses || [];
        if (!courses.length) { Notifications.error('Créez d\'abord un cours.'); return; }
        runner.innerHTML = `
        <div class="panel" style="margin-top:24px;max-width:800px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h3>➕ Nouveau quiz</h3><button class="btn btn-sm btn-outline" id="quizFormClose">✕</button>
            </div>
            <form id="quizCreateForm">
                <div class="form-grid">
                    <div class="input-group"><label>Cours</label><select id="qCourse">${courses.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></div>
                    <div class="input-group"><label>Niveau</label><select id="qLevel"><option value="1">1 — Débutant</option><option value="2">2 — Intermédiaire</option><option value="3">3 — Avancé</option></select></div>
                    <div class="input-group"><label>Score de réussite (%)</label><input type="number" id="qPass" min="10" max="100" value="70" required></div>
                    <div class="input-group"><label>Nom du niveau (facultatif)</label><input type="text" id="qLevelName" placeholder="Ex. Examen final"></div>
                </div>
                <div id="qQuestions"></div>
                <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">
                    <button type="button" class="btn btn-outline" id="addQuestionBtn">+ Ajouter une question</button>
                    <button type="submit" class="btn btn-primary">💾 Créer le quiz</button>
                </div>
            </form>
        </div>`;
        runner.querySelector('#quizFormClose').addEventListener('click', () => { runner.innerHTML = ''; });

        const qList = runner.querySelector('#qQuestions');
        let qCount = 0;
        const addQuestion = () => {
            qCount++;
            const div = document.createElement('div');
            div.className = 'q-block';
            div.style.cssText = 'border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px';
            div.innerHTML = `
                <div class="input-group"><label>Question ${qCount}</label><input type="text" class="qq-text" placeholder="Énoncé de la question" required></div>
                <div class="form-grid" style="gap:12px">
                    ${[0, 1, 2, 3].map(i => `<div class="input-group" style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><input type="radio" name="qq-correct-${qCount}" class="qq-answer" value="${i}" title="Bonne réponse" style="width:auto"><input type="text" class="qq-opt" placeholder="Option ${String.fromCharCode(65 + i)}"></div>`).join('')}
                </div>
                <div class="input-group"><label>Explication (facultatif)</label><input type="text" class="qq-expl" placeholder="Pourquoi cette réponse est correcte"></div>`;
            qList.appendChild(div);
        };
        addQuestion();
        runner.querySelector('#addQuestionBtn').addEventListener('click', addQuestion);

        runner.querySelector('#quizCreateForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const questions = [];
            let invalid = false;
            runner.querySelectorAll('.q-block').forEach((block, bi) => {
                const text = block.querySelector('.qq-text').value.trim();
                const opts = [...block.querySelectorAll('.qq-opt')].map(o => o.value.trim());
                const checked = block.querySelector('.qq-answer:checked');
                if (!text || opts.some(o => !o)) { invalid = true; }
                if (!checked) { invalid = true; }
                if (text && opts.every(o => o) && checked) {
                    questions.push({ question: text, options: opts, answer: Number(checked.value), explanation: block.querySelector('.qq-expl').value.trim() });
                }
                void bi;
            });
            if (invalid) { Notifications.error('Chaque question nécessite un énoncé, 4 options et une bonne réponse cochée.'); return; }
            if (!questions.length) { Notifications.error('Ajoutez au moins une question valide.'); return; }
            const payload = {
                course_id: Number(runner.querySelector('#qCourse').value),
                level: Number(runner.querySelector('#qLevel').value),
                level_name: runner.querySelector('#qLevelName').value.trim() || undefined,
                pass_score: Number(runner.querySelector('#qPass').value),
                questions
            };
            try {
                await API.createQuiz(payload);
                Notifications.success('Quiz créé !');
                runner.innerHTML = '';
                renderQuizzes(document.getElementById('main'));
            } catch (err) { Notifications.error(err.message); }
        });
    }
    async function renderProgress(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
        try {
            const data = await API.getCourses();
            const courses = data.success ? data.courses : [];
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>📊 Ma Progression</h2></div>
                ${courses.length === 0 ? '<div class="panel"><p style="color:var(--text-light)">Aucun cours disponible pour le moment.</p></div>' : `
                <div class="panel">
                    ${courses.map(c => `
                        <div style="padding:16px 0;border-bottom:1px solid var(--border)">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:12px;flex-wrap:wrap">
                                <div style="font-weight:600">${esc(c.title)}</div>
                                <div style="display:flex;align-items:center;gap:12px"><span style="font-size:.85rem;color:var(--text-light)">${c.completed_lessons||0}/${c.total_lessons||c.lessons_count||0} leçons</span><span class="pct" style="font-weight:700;color:var(--accent)">${c.progress||0}%</span></div>
                            </div>
                            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${c.progress||0}%"></div></div>
                            <div style="margin-top:10px"><a class="module-link" style="font-size:.85rem;cursor:pointer" onclick="event.preventDefault();showPage('courses',{course:${c.id}})">${(c.progress||0) === 100 ? 'Revoir le cours →' : 'Continuer →'}</a></div>
                        </div>`).join('')}
                </div>`}
            </div>`;
        } catch (err) { container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`; }
    }

    async function renderCertificates(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div>Chargement...</div>';
        try {
            const data = await API.getCourses();
            const courses = (data.success ? data.courses : []).filter(c => (c.progress || 0) === 100);
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>🎓 Mes Certificats</h2></div>
                ${courses.length === 0
                    ? '<div class="panel" style="text-align:center;padding:60px"><h3>Aucun certificat pour le moment</h3><p style="color:var(--text-light);margin-top:8px">Terminez 100% d\'un cours pour obtenir votre certificat.</p><button class="btn btn-primary" style="margin-top:20px" onclick="showPage(\'courses\')">Voir mes cours →</button></div>'
                    : `<div class="modules-grid">${courses.map(c => `
                        <div class="module-card" style="border:2px solid var(--accent)">
                            <div class="module-header" style="text-align:center">
                                <div style="font-size:2.5rem">🎓</div>
                                <h4 class="module-title">${esc(c.title)}</h4>
                                <p class="module-desc">Certificat de complétion obtenu — ${c.total_lessons||c.lessons_count||0} leçons, ${c.hours||0}h</p>
                            </div>
                            <div class="module-footer" style="justify-content:center"><button class="btn btn-accent" onclick="printCertificate(${c.id},'${escAttr(c.title).replace(/'/g, "\\'")}')">🖨 Imprimer / PDF</button></div>
                        </div>`).join('')}</div>`}
            </div>`;
        } catch (err) { container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`; }
    }

    function printCertificate(courseId, title) {
        const u = Auth.getCurrentUser();
        const date = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
        const w = window.open('', '_blank');
        w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Certificat - ${title}</title><style>
            body{font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff}
            .cert{border:12px double #1e3a5f;padding:60px 80px;text-align:center;max-width:700px}
            .cert h1{font-size:2rem;color:#1e3a5f;margin-bottom:8px}
            .cert .name{font-size:1.8rem;border-bottom:2px solid #c05621;padding:16px 0;margin:24px 0}
            .cert p{color:#475569;line-height:1.6}
            .cert .sig{margin-top:40px;display:flex;justify-content:space-between}
            @media print{body{-webkit-print-color-adjust:exact}}
        </style></head><body><div class="cert">
            <h1>CERTIFICAT DE COMPLÉTION</h1>
            <p>Académie biblique BereaFS</p>
            <p style="margin-top:16px">Ce certificat est décerné à</p>
            <div class="name">${esc(u.name)}</div>
            <p>pour avoir complété avec succès le cours</p>
            <p style="font-size:1.3rem;font-weight:700;color:#1e3a5f">${esc(title)}</p>
            <p style="margin-top:16px">Fait le ${date}</p>
            <div class="sig"><span>Académie BereaFS</span><span>Étudiant: ${esc(u.name)}</span></div>
        </div><script>window.print()<\/script></body></html>`);
        w.document.close();
    }
    function renderAnalytics(container) { container.innerHTML = `<div class="animate-fade"><div class="top-bar"><h2>📈 Statistiques</h2></div><div class="panel" style="padding:60px;text-align:center"><h3>Analytics à venir</h3></div></div>`; }
    function renderMemorization(container) { container.innerHTML = `<div class="animate-fade"><div class="top-bar"><h2>🧠 Mémorisation</h2></div><div class="panel" style="max-width:600px;margin:0 auto;text-align:center;padding:40px"><p style="font-style:italic;font-size:1.1rem;margin-bottom:24px">"Toute Écriture est inspirée de Dieu..."</p><p style="color:var(--accent);font-weight:600">2 Timothée 3:16</p></div></div>`; }
    function renderCertificates(container) { container.innerHTML = `<div class="animate-fade"><div class="top-bar"><h2>🎓 Mes Certificats</h2></div><div class="panel" style="text-align:center;padding:60px;opacity:.6"><h3>Aucun certificat</h3><p style="color:var(--text-light)">Complétez un cours pour obtenir votre certificat.</p></div></div>`; }
    function renderPlaceholder(container) { container.innerHTML = `<div class="animate-fade"><div style="padding:40px 0"><h2>${esc(currentPage)}</h2><p style="color:var(--text-light)">Page en construction.</p></div></div>`; }

    window.openProfile = function() {
        const u = Auth.getCurrentUser();
        document.getElementById('profileModal').classList.add('active');
        document.getElementById('pName').value = u.name;
        document.getElementById('pEmail').value = u.email;
        document.getElementById('pPhone').value = u.phone || '';
        document.getElementById('pCountry').value = u.country || 'CI';
    };
    window.closeProfile = function() { document.getElementById('profileModal').classList.remove('active'); };
    window.handleAvatar = function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            document.getElementById('avatarDisplay').innerHTML = `<img src="${ev.target.result}">`;
            document.getElementById('sidebarAvatar').innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover">`;
        };
        reader.readAsDataURL(file);
    };
    window.saveProfile = async function(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Sauvegarde...';

        try {
            const data = {
                name: document.getElementById('pName').value,
                phone: document.getElementById('pPhone').value,
                country: document.getElementById('pCountry').value
            };

            const currentPass = document.getElementById('pCurrentPass').value;
            const newPass = document.getElementById('pNewPass').value;

            if (newPass) {
                if (!currentPass) { Notifications.error('Mot de passe actuel requis.'); return; }
                if (!Security.isValidPassword(newPass)) { Notifications.error('Nouveau mot de passe trop faible (8+ caractères, majuscule, minuscule, chiffre).'); return; }
                data.currentPassword = currentPass;
                data.newPassword = newPass;
            }

            const result = await API.updateProfile(data);
            if (result.success) {
                localStorage.setItem('bereafs_current', JSON.stringify(result.user));
                document.getElementById('sidebarName').textContent = result.user.name;
                document.getElementById('sidebarAvatar').textContent = result.user.avatar || '??';
                Notifications.success('Profil mis à jour!');
                closeProfile();
            }
        } catch (err) {
            Notifications.error(err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    window.toggleSidebar = function() { document.getElementById('sidebar').classList.toggle('open'); };
    window.showPage = showPage;
    window.createCourse = createCourse;
    window.addLesson = addLesson;
    window.deleteVideo = deleteVideo;

})();
