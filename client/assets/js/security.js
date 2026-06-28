/**
 * BereaFS Security Helpers
 * Utilitaires de sécurité client
 */
const Security = (() => {
    // Hash simple SHA-256 (pour client - le vrai hash se fait côté serveur avec bcrypt)
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Validation d'email
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Validation de mot de passe (min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre)
    function isValidPassword(password) {
        return password && password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
    }

    // Échapper les caractères spéciaux HTML (anti-XSS)
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // Nettoyer une chaîne pour affichage (anti-XSS)
    function sanitize(str) {
        return escapeHtml(str);
    }

    // Échapper pour utilisation dans les attributes HTML
    function escapeAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Échapper pour utilisation dans JavaScript inline
    function escapeJs(str) {
        return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    }

    // Vérifier si le token est expiré (JWT)
    function isTokenExpired(token) {
        if (!token) return true;
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return true;
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp) {
                return Date.now() >= payload.exp * 1000;
            }
            return false;
        } catch {
            return true;
        }
    }

    // Auto-expiration de session (inactivité)
    function setupSessionTimeout(timeoutMs = 30 * 60 * 1000) { // 30 min par défaut
        let timer;
        const reset = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (typeof Auth !== 'undefined') Auth.logout();
            }, timeoutMs);
        };

        // Réinitialiser le timer sur toute interaction
        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(evt => {
            document.addEventListener(evt, reset, { passive: true });
        });
        reset();
    }

    // Détection de contenu potentiellement dangereux
    function hasSuspiciousContent(str) {
        if (!str) return false;
        const patterns = [/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, /javascript:/gi, /on\w+\s*=/gi, /data:text\/html/gi];
        return patterns.some(p => p.test(str));
    }

    return {
        hashPassword,
        isValidEmail,
        isValidPassword,
        escapeHtml,
        sanitize,
        escapeAttr,
        escapeJs,
        isTokenExpired,
        setupSessionTimeout,
        hasSuspiciousContent
    };
})();
