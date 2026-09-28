/**
 * BereaFS Notification System
 * Système de notifications unifié avec animations
 */
const Notifications = (() => {
    let container = null;

    const getContainer = () => {
        if (!container) {
            container = document.createElement('div');
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        return container;
    };

    const show = (message, type = 'info', duration = 4000) => {
        const c = getContainer();
        const el = document.createElement('div');
        el.className = `notification ${type}`;

        const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
        const icon = document.createElement('span');
        icon.className = 'notification-icon';
        icon.textContent = icons[type] || 'ℹ';
        const text = document.createElement('span');
        text.className = 'notification-text';
        text.textContent = String(message);
        const close = document.createElement('button');
        close.className = 'notification-close';
        close.type = 'button';
        close.textContent = '×';
        close.addEventListener('click', () => el.remove());
        el.append(icon, text, close);

        c.appendChild(el);

        // Auto-remove
        const timer = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(100%)';
            el.style.transition = 'all .3s ease';
            setTimeout(() => el.remove(), 300);
        }, duration);

        // Pause on hover
        el.addEventListener('mouseenter', () => clearTimeout(timer));
        el.addEventListener('mouseleave', () => {
            setTimeout(() => {
                el.style.opacity = '0';
                el.style.transform = 'translateX(100%)';
                el.style.transition = 'all .3s ease';
                setTimeout(() => el.remove(), 300);
            }, 2000);
        });
    };

    return {
        success: (msg, dur) => show(msg, 'success', dur),
        error: (msg, dur) => show(msg, 'error', dur || 6000),
        info: (msg, dur) => show(msg, 'info', dur),
        warning: (msg, dur) => show(msg, 'warning', dur || 5000)
    };
})();
