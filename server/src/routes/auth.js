const express = require('express');
const bcrypt = require('bcryptjs');
const { HttpError, asyncHandler } = require('../utils/http');
const {
    PASSWORD_RULE_MESSAGE, isStrongPassword, isValidEmail, isCountryCode,
    optionalText, requiredText, toInitials
} = require('../utils/validation');

const PUBLIC_USER_FIELDS = 'id, name, email, role, avatar, country, phone, created_at';

function createAuthRouter({ config, db, auth, authLimiter }) {
    const router = express.Router();
    // Hash factice : la connexion prend le même temps que l'email existe ou non,
    // ce qui empêche d'énumérer les comptes par mesure de latence.
    const dummyHashPromise = bcrypt.hash('timing-equalizer', config.bcryptRounds);

    router.post('/register', authLimiter, asyncHandler(async (req, res) => {
        const { password } = req.body;
        const name = requiredText(req.body.name, { field: 'nom', max: 100, stripTags: true });
        const email = requiredText(req.body.email, { field: 'email', max: 254 }).toLowerCase();
        const phone = requiredText(req.body.phone, { field: 'téléphone', max: 30 });
        const country = requiredText(req.body.country, { field: 'pays', max: 2 });

        if (name.length < 2) throw new HttpError(400, 'Nom trop court.');
        if (!isValidEmail(email)) throw new HttpError(400, 'Email invalide.');
        if (!isCountryCode(country)) throw new HttpError(400, 'Pays invalide.');
        if (!isStrongPassword(password)) throw new HttpError(400, PASSWORD_RULE_MESSAGE);

        const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
        if (existing) throw new HttpError(409, 'Cet email existe déjà.');

        const hashed = await bcrypt.hash(password, config.bcryptRounds);
        const avatar = toInitials(name);
        const result = await db.run(
            'INSERT INTO users (name, email, password, phone, country, avatar) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, hashed, phone, country, avatar]
        );
        const user = { id: result.lastID, name, email, role: 'etudiant', avatar };

        res.status(201).json({ success: true, message: 'Compte créé!', token: auth.signToken(user), user });
    }));

    router.post('/login', authLimiter, asyncHandler(async (req, res) => {
        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
            throw new HttpError(400, 'Email et mot de passe requis.');
        }

        const user = await db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email.trim().toLowerCase()]);
        const isMatch = await bcrypt.compare(password, user ? user.password : await dummyHashPromise);
        if (!user || !isMatch) throw new HttpError(401, 'Identifiants incorrects.');

        res.json({
            success: true, message: 'Connexion réussie!', token: auth.signToken(user),
            user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, country: user.country, phone: user.phone }
        });
    }));

    router.get('/me', auth.authenticate, asyncHandler(async (req, res) => {
        const user = await db.get(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [req.user.userId]);
        if (!user) throw new HttpError(404, 'Utilisateur non trouvé.');
        res.json({ success: true, user });
    }));

    router.put('/profile', auth.authenticate, asyncHandler(async (req, res) => {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;
        const name = optionalText(req.body.name, { field: 'nom', max: 100, stripTags: true });
        const phone = optionalText(req.body.phone, { field: 'téléphone', max: 30 });
        const country = optionalText(req.body.country, { field: 'pays', max: 2 });

        if (name !== undefined && name.length < 2) throw new HttpError(400, 'Nom trop court.');
        if (country && !isCountryCode(country)) throw new HttpError(400, 'Pays invalide.');

        const updates = [];
        const params = [];

        if (newPassword) {
            if (!currentPassword) throw new HttpError(400, 'Mot de passe actuel requis.');
            const user = await db.get('SELECT password FROM users WHERE id = ?', [userId]);
            if (!(await bcrypt.compare(String(currentPassword), user.password))) {
                // 400 et non 401 : le client interprète tout 401 comme une session expirée.
                throw new HttpError(400, 'Mot de passe actuel incorrect.');
            }
            if (!isStrongPassword(newPassword)) throw new HttpError(400, PASSWORD_RULE_MESSAGE);
            updates.push('password = ?');
            params.push(await bcrypt.hash(newPassword, config.bcryptRounds));
        }
        if (name) { updates.push('name = ?', 'avatar = ?'); params.push(name, toInitials(name)); }
        if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
        if (country) { updates.push('country = ?'); params.push(country); }

        if (updates.length > 0) {
            await db.run(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, [...params, userId]);
        }

        const updated = await db.get(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`, [userId]);
        res.json({ success: true, message: 'Profil mis à jour!', user: updated });
    }));

    return router;
}

module.exports = { createAuthRouter };
