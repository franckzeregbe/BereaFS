@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   BEREAFS v8.1.0 - Plateforme Biblique
echo ============================================
echo.

REM Verifier Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Node.js non trouve. Installez depuis https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Installation des dependances...
if not exist "server\node_modules" (
    cd server && npm install
    if %errorlevel% neq 0 (
        echo ERREUR: Echec de l'installation des dependances.
        pause
        exit /b 1
    )
    cd ..
) else (
    echo    Dependances deja installees.
)

echo.
echo [2/4] Verification de la base de donnees...
if not exist "server\bereafs.db" (
    echo    Base absente, initialisation...
    cd server && node scripts\init-db.js
    cd ..
) else (
    echo    Base de donnees trouvee.
)

echo.
echo [3/4] Dossiers uploads...
if not exist "server\uploads\videos" mkdir "server\uploads\videos"
if not exist "server\uploads\audios" mkdir "server\uploads\audios"

echo.
echo [4/4] Demarrage du serveur...
echo.
echo    Ouvrez votre navigateur sur:
echo    http://localhost:3000/academie     (Presentation)
echo    http://localhost:3000/client       (Plateforme)
echo    http://localhost:3000/admin        (Gestion - enseignant/admin)
echo.
echo    Compte demo: pasteur@bereafs.com / admin123
echo.

cd server && npm start
