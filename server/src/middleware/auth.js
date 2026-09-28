const jwt = require('jsonwebtoken');
const { HttpError, asyncHandler } = require('../utils/http');

const TEACHER_ROLES = ['enseignant', 'admin'];

function createAuth({ config, db }) {
    const signToken = (user) => jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' }
    );

    // Le rôle et le statut actif sont relus en base à chaque requête :
    // un compte désactivé ou rétrogradé perd l'accès immédiatement.
    const authenticate = asyncHandler(async (req, res, next) => {
        const [scheme, token] = (req.headers.authorization || '').split(' ');
        if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentification requise.');

        let payload;
        try {
            payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
        } catch {
            throw new HttpError(401, 'Token invalide ou expiré.');
        }

        const user = await db.get('SELECT id, email, role, is_active FROM users WHERE id = ?', [payload.userId]);
        if (!user || !user.is_active) throw new HttpError(401, 'Compte introuvable ou désactivé.');

        req.user = { userId: user.id, email: user.email, role: user.role };
        next();
    });

    const requireRole = (roles) => (req, res, next) => {
        if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Accès refusé.'));
        next();
    };

    return { signToken, authenticate, requireRole, requireTeacher: requireRole(TEACHER_ROLES) };
}

/** Un enseignant ne gère que ses propres cours ; un admin gère tout. */
function assertCanManageCourse(user, course) {
    if (user.role === 'admin' || course.created_by === user.userId) return;
    throw new HttpError(403, 'Vous ne pouvez modifier que vos propres cours.');
}

module.exports = { createAuth, assertCanManageCourse, TEACHER_ROLES };
