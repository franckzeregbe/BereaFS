/**
 * BereaFS Auth Module
 * sessionStorage pour les tokens (sécurité XSS)
 */
const Auth = (() => {
    let currentUser = null;

    const getSession = () => {
        try {
            const stored = localStorage.getItem('bereafs_current');
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    };

    const saveSession = (user) => {
        currentUser = user;
        localStorage.setItem('bereafs_current', JSON.stringify(user));
    };

    const clearSession = () => {
        currentUser = null;
        localStorage.removeItem('bereafs_current');
        sessionStorage.removeItem('bereafs_token');
    };

    return {
        getCurrentUser: () => currentUser || getSession(),

        async login(email, password) {
            try {
                const data = await API.login(email, password);
                saveSession(data.user);
                return { success: true, user: data.user };
            } catch (err) {
                return { success: false, error: err.message };
            }
        },

        async register(name, email, password, phone, country) {
            try {
                const data = await API.register(name, email, password, phone, country);
                saveSession(data.user);
                return { success: true, user: data.user };
            } catch (err) {
                return { success: false, error: err.message };
            }
        },

        requireAuth() {
            const user = this.getCurrentUser();
            if (!user) {
                window.location.href = '/client/index.html';
                return null;
            }
            currentUser = user;
            return user;
        },

        logout() {
            clearSession();
            window.location.href = '/client/index.html';
        },

        isEnseignant() {
            const user = this.getCurrentUser();
            return user && user.role === 'enseignant';
        }
    };
})();
