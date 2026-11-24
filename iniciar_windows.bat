@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo   Acolhe CAPS - Rede de Atencao Psicossocial (SUS)
echo ========================================================

where node >nul 2>nul
if %errorlevel%==0 (
    echo Iniciando servidor com Node.js em http://localhost:3000 ...
    start "" "http://localhost:3000"
    node server/server.js
    goto :fim
)

where python >nul 2>nul
if %errorlevel%==0 (
    echo Node.js nao encontrado. Iniciando servidor com Python em http://localhost:3000 ...
    set ABRIR_NAVEGADOR=1
    python scripts/servidor.py
    goto :fim
)

echo Abrindo versao direta no navegador (sem precisar instalar Node ou Python)...
start "" "%~dp0abrir_direto_no_navegador.html"

:fim
