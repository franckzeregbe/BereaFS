@echo off
chcp 65001 >nul 2>&1
echo ============================================
echo   BEREAFS v8.0.0 - Enhanced Platform
echo ============================================
echo.

REM Verifier Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Node.js non trouve. Installez depuis https://nodejs.org
    pause
    exit /b 1
)

echo [1/3] Installation des dependances...
if not exist "node_modules" (
    call npm install
) else (
    echo    Dependances deja installees.
)

echo.
echo [2/3] Structure de dossiers...
if not exist "server\uploads\videos" mkdir "server\uploads\videos"

echo.
echo [3/3] Demarrage du serveur...
echo.
echo    Ouvrez votre navigateur sur:
echo    http://localhost:3000/client       (Plateforme)
echo    http://localhost:3000/admin        (Gestion Videos)
echo.
echo    Identifiants demo:
echo    pasteur@bereafs.com / admin123
echo.

node server/server.js
