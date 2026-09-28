/**
 * BereaFS - Page de gestion des vidéos (enseignant/admin)
 * Le jeton est lu depuis le localStorage ; l'API vérifie le rôle.
 */
(() => {
    const TOKEN = localStorage.getItem('bereafs_token');
    const STATUS_DURATION_MS = 5000;

    if (!TOKEN) {
        window.location.href = '/client/index.html';
        return;
    }

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const videoList = document.getElementById('videoList');
    const statusEl = document.getElementById('status');
    let statusTimer;

    function showStatus(type, message) {
        statusEl.className = type;
        statusEl.textContent = message;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { statusEl.className = ''; }, STATUS_DURATION_MS);
    }

    function handleAuthFailure(status) {
        if (status === 401) {
            localStorage.removeItem('bereafs_token');
            window.location.href = '/client/index.html';
            return true;
        }
        if (status === 403) {
            videoList.textContent = 'Accès réservé aux enseignants et administrateurs.';
            dropZone.hidden = true;
            return true;
        }
        return false;
    }

    async function api(url, options = {}) {
        const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${TOKEN}`, ...options.headers } });
        const data = await res.json().catch(() => ({}));
        if (handleAuthFailure(res.status)) throw new Error(data.error || 'Accès refusé');
        if (!res.ok) throw new Error(data.error || 'Erreur serveur');
        return data;
    }

    function uploadFile(file) {
        if (!file) return;
        const formData = new FormData();
        formData.append('media', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/admin/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${TOKEN}`);
        progressContainer.style.display = 'block';

        xhr.upload.addEventListener('progress', (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = `${pct}%`;
            progressFill.textContent = `${pct}%`;
        });
        xhr.addEventListener('load', () => {
            progressContainer.style.display = 'none';
            if (handleAuthFailure(xhr.status)) return;
            let res = {};
            try { res = JSON.parse(xhr.responseText); } catch { /* réponse non JSON */ }
            if (res.success) {
                showStatus('success', 'Upload réussi !');
                loadVideos();
            } else {
                showStatus('error', `Erreur : ${res.error || 'upload impossible'}`);
            }
        });
        xhr.addEventListener('error', () => {
            progressContainer.style.display = 'none';
            showStatus('error', 'Erreur réseau pendant l’upload.');
        });
        xhr.send(formData);
    }

    function openPlayer(id) {
        window.open(`/client/player.html?video=${encodeURIComponent(id)}`, '_blank', 'noopener');
    }

    async function deleteVideo(video) {
        if (!confirm(`Supprimer définitivement « ${video.originalName} » ?`)) return;
        try {
            await api(`/api/videos/${encodeURIComponent(video.id)}`, { method: 'DELETE' });
            showStatus('success', 'Vidéo supprimée.');
            loadVideos();
        } catch (err) {
            showStatus('error', err.message);
        }
    }

    function el(tag, props = {}, children = []) {
        const node = Object.assign(document.createElement(tag), props);
        node.append(...children);
        return node;
    }

    function renderCard(video) {
        const date = new Date(video.created).toLocaleDateString('fr-FR');
        const thumb = el('button', { className: 'video-thumb', type: 'button', ariaLabel: `Lire ${video.originalName}` },
            [el('span', { className: 'play-icon', textContent: '▶' })]);
        const play = el('button', { className: 'btn-play', type: 'button', textContent: '▶ Lire' });
        const remove = el('button', { className: 'btn-delete', type: 'button', textContent: 'Supprimer' });
        thumb.addEventListener('click', () => openPlayer(video.id));
        play.addEventListener('click', () => openPlayer(video.id));
        remove.addEventListener('click', () => deleteVideo(video));

        return el('article', { className: 'video-card' }, [
            thumb,
            el('div', { className: 'video-info' }, [
                el('h3', { title: video.originalName, textContent: video.originalName }),
                el('p', { textContent: `${video.sizeHuman} • ${date}` }),
                el('div', { className: 'video-actions' }, [play, remove])
            ])
        ]);
    }

    async function loadVideos() {
        try {
            const data = await api('/api/videos');
            if (!data.videos.length) {
                videoList.replaceChildren(el('p', { className: 'muted', textContent: 'Aucune vidéo.' }));
                return;
            }
            videoList.replaceChildren(el('div', { className: 'video-grid' }, data.videos.map(renderCard)));
        } catch (err) {
            showStatus('error', err.message || 'Erreur réseau');
        }
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
    });
    dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('dragover');
        uploadFile(e.dataTransfer.files[0]);
    });
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', () => {
        uploadFile(fileInput.files[0]);
        fileInput.value = '';
    });

    loadVideos();
})();
