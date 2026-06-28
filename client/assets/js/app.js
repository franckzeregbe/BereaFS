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
            const data = await API.getCourses();
            const courses = data.success ? data.courses : [];
            const active = courses.filter(c => c.status === 'active').slice(0, 3);
            container.innerHTML = `
            <div class="animate-fade">
                <div class="top-bar"><h2>${isEns ? 'Tableau de bord' : 'Mon Parcours'}</h2>${isEns ? '<button class="btn btn-primary" onclick="showPage(\'create\')">+ Nouveau cours</button>' : ''}</div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-label">${isEns ? 'Élèves actifs' : 'Modules suivis'}</div><div class="stat-value">${isEns ? '142' : courses.length || '0'}</div><div class="stat-trend trend-up">${isEns ? '+12 ce mois' : 'En cours'}</div></div>
                    <div class="stat-card"><div class="stat-label">${isEns ? 'Cours publiés' : 'Heures étudiées'}</div><div class="stat-value">${isEns ? '5' : '47h'}</div><div class="stat-trend trend-up">Actif</div></div>
                    <div class="stat-card"><div class="stat-label">Complétion</div><div class="stat-value">67%</div><div class="stat-trend trend-up">+3%</div></div>
                    <div class="stat-card"><div class="stat-label">${isEns ? 'À corriger' : 'Versets mémorisés'}</div><div class="stat-value">${isEns ? '23' : '15'}</div><div class="stat-trend ${isEns ? 'trend-down' : 'trend-up'}">${isEns ? '5 urgents' : 'Objectif: 20'}</div></div>
                </div>
                <div class="section-header"><h3 class="section-title">${isEns ? 'Modules actifs' : 'Continuer mon apprentissage'}</h3><button class="btn btn-outline" onclick="showPage('courses')">Voir tout →</button></div>
                <div class="modules-grid">
                    ${active.length > 0 ? active.map((c, i) => `
                        <div class="module-card" style="animation-delay:${i*0.1}s">
                            <div class="module-header"><span class="module-tag tag-${escAttr(c.tag||'fondements')}">${esc(c.tag||'Fondements')}</span><h4 class="module-title">${esc(c.title)}</h4><p class="module-desc">${esc(c.description||'')}</p></div>
                            <div class="module-progress"><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${c.progress||0}%"></div></div><div class="progress-text"><span>${c.completed_lessons||0}/${c.total_lessons||c.lessons_count||0} leçons</span><span class="pct">${c.progress||0}%</span></div></div>
                            <div class="module-footer"><div class="module-meta"><span>⏱ ${c.hours||0}h</span><span>👥 ${c.students||0}</span></div><a class="module-link" onclick="event.preventDefault();showPage('courses',{course:${c.id}})">Continuer →</a></div>
                        </div>
                    `).join('') : '<p style="color:var(--text-light)">Aucun cours disponible.</p>'}
                </div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`;
        }
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
                            <div class="module-footer"><span style="font-size:.8rem;color:var(--text-light)">⏱ ${c.hours||0}h</span><a class="module-link" onclick="event.preventDefault();showPage('courses',{course:${c.id}})">Ouvrir →</a></div>
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
                        <div style="text-align:center;padding:16px;background:#f8fafb;border-radius:12px"><div style="font-size:1.5rem;font-weight:700">${data.course.students||0}</div><div style="font-size:.8rem;color:var(--text-light)">Étudiants</div></div>
                        <div style="text-align:center;padding:16px;background:#f8fafb;border-radius:12px"><div style="font-size:1.5rem;font-weight:700;color:var(--accent)">${data.course.progress||0}%</div><div style="font-size:.8rem;color:var(--text-light)">Progression</div></div>
                    </div>
                    <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:16px">Contenu du cours</h3>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${lessons.map((l, i) => {
                            const isDone = l.completed;
                            const isCurrent = !isDone && (!lessons.find(x => !x.completed && x.num < l.num));
                            return `<div class="lesson-item ${isCurrent?'active':''}" onclick="openLesson(${courseId},${l.id},'${escAttr(l.title)}','${escAttr(l.video_url||'')}','${escAttr(l.audio_url||'')}')">
                                <div class="lesson-number ${isDone?'done':isCurrent?'current':'pending'}">${isDone?'✓':l.num}</div>
                                <div style="flex:1"><div style="font-weight:600">${esc(l.title)}</div>
                                <div style="font-size:.8rem;color:var(--text-light);display:flex;gap:12px;margin-top:2px"><span>⏱ ${esc(l.duration||'45min')}</span>${l.has_video?'<span>🎥 Vidéo</span>':''}${l.has_audio?'<span>🎧 Audio</span>':''}</div></div>
                                ${isCurrent?'<button class="btn btn-sm btn-primary">Lire</button>':isDone?'<span style="color:var(--success);font-size:.8rem">✓ Terminé</span>':''}
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>`;
        } catch (err) { container.innerHTML = `<div class="panel"><p style="color:var(--danger)">Erreur de chargement.</p></div>`; }
    }

    function openLesson(courseId, lessonId, title, videoUrl, audioUrl) {
        window.location.href = `/client/lesson-streaming.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}&title=${encodeURIComponent(title)}&video=${encodeURIComponent(videoUrl)}&audio=${encodeURIComponent(audioUrl)}`;
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

    function renderStudents(container) {
        container.innerHTML = `<div class="animate-fade"><div class="top-bar"><h2> Gestion des Étudiants</h2><div style="display:flex;gap:8px"><button class="btn btn-outline"> Exporter</button><button class="btn btn-primary">+ Inviter</button></div></div><div class="panel"><div style="margin-bottom:16px"><input type="text" placeholder="Rechercher..." style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:12px;outline:none"></div><table class="data-table"><thead><tr><th>Élève</th><th>Email</th><th>Progression</th><th>Note</th><th>Statut</th></tr></thead><tbody><tr><td><div class="student-name"><div class="mini-avatar">MK</div>Marie K.</div></td><td>marie@bereafs.com</td><td><div class="progress-bar-bg" style="width:120px"><div class="progress-bar-fill" style="width:85%"></div></div></td><td><span class="score-ring score-high">92</span></td><td><span class="status-badge status-actif">Actif</span></td></tr><tr><td><div class="student-name"><div class="mini-avatar">JO</div>Jean O.</div></td><td>jean@email.com</td><td><div class="progress-bar-bg" style="width:120px"><div class="progress-bar-fill" style="width:45%"></div></div></td><td><span class="score-ring score-mid">68</span></td><td><span class="status-badge status-retard">Retard</span></td></tr></tbody></table></div></div>`;
    }

    function renderQuizzes(container) { container.innerHTML = `<div class="animate-fade"><div class="top-bar"><h2>❓ Quiz & Examens</h2><button class="btn btn-primary">+ Nouveau quiz</button></div><div class="modules-grid"><div class="panel"><h3 style="margin-bottom:12px">📝 Quiz: Fondements de la Foi</h3><p style="color:var(--text-light);margin-bottom:16px">Module 1 • 10 questions • 20 min</p><button class="btn btn-primary" onclick="Notifications.info('Quiz en développement')">Commencer</button></div></div></div>`; }
    function renderProgress(container) { container.innerHTML = `<div class="animate-fade"><div class="top-bar"><h2>📊 Ma Progression</h2></div><div class="panel" style="padding:60px;text-align:center"><h3>Votre progression est suivie automatiquement</h3></div></div>`; }
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
    window.deleteVideo = deleteVideo;

})();
