@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================================================
echo   Acolhe CAPS - Atualizacao Online Automatica (CNES/SUS + IBGE)
echo ====================================================================
echo.
echo Conectando nas APIs oficiais do Governo Federal (DEMAS/CNES e IBGE)...
echo Se a API estiver fora do ar, o Plano B (modo offline) sera mantido.
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    python scripts/carga_real.py atualizar-auto
    echo.
    echo Pronto! O banco SQLite (data/acolhe.db), o arquivo data/caps.json e o
    echo arquivo abrir_direto_no_navegador.html foram atualizados!
    pause
    goto :fim
)

where python3 >nul 2>nul
if %errorlevel%==0 (
    python3 scripts/carga_real.py atualizar-auto
    echo.
    echo Pronto! O banco SQLite (data/acolhe.db), o arquivo data/caps.json e o
    echo arquivo abrir_direto_no_navegador.html foram atualizados!
    pause
    goto :fim
)

echo Para atualizar os dados direto da internet (APIs do CNES e IBGE),
echo instale o Python 3 (python.org) neste computador e clique aqui novamente.
pause

:fim
