@echo off
title Heightopus local dev
cd /d "%~dp0"
where py >nul 2>nul && (py -3 dev.py) || (python dev.py)
pause
