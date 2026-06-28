/**
 * BereaFS PWA Registration
 * Enregistre le Service Worker et gère le mode hors-ligne
 */
(function() {
    'use strict';

    // Enregistrer le Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/client/sw.js', { scope: '/client/' })
            .then(reg => {
                console.log('✅ Service Worker enregistré:', reg.scope);
            })
            .catch(err => {
                console.warn('⚠️ Service Worker non enregistré:', err);
            });
    }

    // Détecter le mode hors-ligne
    const offlineBadge = document.getElementById('offlineBadge');
    function updateOnlineStatus() {
        if (offlineBadge) {
            offlineBadge.classList.toggle('show', !navigator.onLine);
        }
        if (!navigator.onLine) {
            if (typeof Notifications !== 'undefined') {
                Notifications.warning('Mode hors-ligne activé');
            }
        } else {
            if (typeof Notifications !== 'undefined') {
                Notifications.success('Connexion restaurée');
            }
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // Lien vers le manifest (ajouté dynamiquement si pas dans HTML)
    if (!document.querySelector('link[rel="manifest"]')) {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/client/manifest.json';
        document.head.appendChild(link);
    }
})();
