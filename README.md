# BereaFS v8.1.0 — Plateforme de Formation Biblique

Plateforme de formation biblique en ligne avec streaming vidéo, leçons interactives et quiz.

## Démarrage rapide

### Prérequis
- Node.js 18+ (https://nodejs.org)
- SQLite3 (inclus automatiquement)

### Lancement
```bash
START.bat
```
Ou manuellement :
```bash
cd server
npm install
npm run init-db   # schéma + comptes démo (ignoré en production)
npm start         # ou npm run dev (rechargement auto)
```

### Tests
```bash
cd server
npm test          # tests d'intégration : auth, droits, quiz, streaming, uploads
```
La CI GitHub Actions (`.github/workflows/ci.yml`) les exécute sur Node 20 et 22 à chaque push.

### URLs locales
- **Académie** : http://localhost:3000/academie
- **Plateforme** : http://localhost:3000/client
- **Admin** : http://localhost:3000/admin
- **Santé** : http://localhost:3000/api/health

## Comptes démo

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Enseignant | pasteur@bereafs.com | admin123 |
| Étudiant | marie@bereafs.com | marie123 |
| Étudiant | jean@bereafs.com | jean123 |

## Architecture

```
server/
├── server.js          # Point d'entrée (démarrage + arrêt propre)
├── src/
│   ├── app.js         # Assemblage Express (sécurité, statiques, routes)
│   ├── config.js      # Lecture et validation de l'environnement
│   ├── db/            # Connexion SQLite + schéma partagé
│   ├── middleware/    # Authentification, erreurs
│   ├── routes/        # auth, courses, quizzes, stats, media
│   ├── services/      # Upload, streaming, validation des fichiers
│   └── utils/         # Validation des entrées, erreurs HTTP
├── tests/             # Tests d'intégration (node:test)
├── scripts/
│   └── init-db.js     # Initialisation + données démo
├── bereafs.db         # Base SQLite
├── uploads/           # Vidéos et audios uploadés
└── package.json

client/
├── index.html         # Connexion / Inscription
├── academie.html      # Page d'accueil publique
├── dashboard.html     # Tableau de bord (apprentissage)
├── lesson-streaming.html # Lecteur de leçon
├── player.html        # Lecteur vidéo dédié
└── assets/            # CSS, JS, icônes
```

## Fonctionnalités

- 🔐 Authentification JWT (inscription, connexion, profil)
- 📚 Cours avec leçons structurées (texte, vidéo, audio, scripture)
- 🎥 Streaming vidéo avec support du range requests (HTTP streaming)
- ✍️ Quiz interactifs par niveau avec correction automatique
- 📊 Progression par utilisateur (leçons complétées, scores)
- 👥 Gestion étudiants (enseignants/admin)
- 📤 Upload vidéo/audio multi-formats (MP4, WebM, OGG, MOV, AVI, MKV)
- 📱 PWA (service worker, manifest, mode hors-ligne)
- 🎨 Interface responsive (mobile, tablette, desktop)

## API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | /api/auth/register | Inscription |
| POST | /api/auth/login | Connexion |
| GET | /api/auth/me | Profil utilisateur |
| PUT | /api/auth/profile | Mettre à jour le profil |
| GET | /api/courses | Liste des cours |
| GET | /api/courses/:id | Détail d'un cours |
| POST | /api/lessons/:id/complete | Marquer une leçon comme terminée |
| GET | /api/stats | Statistiques |
| GET | /api/quizzes/:courseId/:level | Obtenir un quiz |
| POST | /api/quizzes/:quizId/submit | Soumettre un quiz |
| POST | /api/admin/courses | Créer un cours |
| PUT | /api/admin/courses/:id | Modifier un cours |
| DELETE | /api/admin/courses/:id | Supprimer un cours |
| POST | /api/admin/courses/:courseId/lessons | Ajouter une leçon |
| POST | /api/upload | Upload vidéo (enseignant/admin) |
| GET | /api/videos | Lister les vidéos |
| GET | /api/stream/:videoId | Stream vidéo |
| GET | /api/thumbnail/:videoId | Miniature vidéo |
| GET | /api/health | Santé du serveur |

## Formats vidéo supportés
MP4, WebM, OGG, MOV, AVI, MKV

## Sécurité
- Rôle et statut du compte relus en base à chaque requête (désactivation immédiate)
- Un enseignant ne gère que ses propres cours, leçons et quiz ; l'admin gère tout
- Uploads : extension ET type MIME vérifiés (aucun HTML déguisé)
- Démarrage refusé en production sans JWT_SECRET fort (32+ caractères)
- Bcrypt pour les mots de passe (12 rounds)
- JWT avec expiration 7 jours
- Rate limiting sur l'authentification (20 req/15min)
- Helmet.js pour les headers de sécurité
- Validation des entrées et protection contre la traversal de chemins
- CORS configurable

## Configuration
Fichier `server/.env` :
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=votre-cle-super-secrete-changez-en-production
DB_PATH=./server/bereafs.db
CORS_ORIGIN=*
```

## Technologies
- **Backend** : Node.js, Express.js, SQLite3
- **Frontend** : HTML5, CSS3, Vanilla JS
- **Sécurité** : Helmet, bcrypt, jsonwebtoken, express-rate-limit
- **PWA** : Service Worker, Web App Manifest

---

© 2026 BereaFS. Plateforme de formation biblique en ligne.
