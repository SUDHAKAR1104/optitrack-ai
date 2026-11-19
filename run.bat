@echo off
title OptiTrack AI - SIH26169 ISRO Mission Control Server
echo =========================================================================
echo    OptiTrack AI / VISIONBEACON AI - ISRO SIH26169 Web Application
echo    Free Space Optical Communication (FSOC) Coarse Alignment Simulator
echo =========================================================================
echo.
echo [1/2] Starting Python telemetry server on http://localhost:8080 ...
start "" http://localhost:8080
python server.py
pause
