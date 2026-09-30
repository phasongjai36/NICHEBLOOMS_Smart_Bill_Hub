@echo off
rem NicheBlooms Smart Bill — double-click to start + open the dashboard
setlocal
set "ROOT=%~dp0"
set "NB_NODE_BIN=%LOCALAPPDATA%\Programs\@codebufffreebuff-desktop\Freebuff.exe"
if not exist "%NB_NODE_BIN%" (
  echo [!] ไม่พบ Freebuff desktop — ติดตั้งก่อนใช้งาน
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=1
"%NB_NODE_BIN%" "%ROOT%.runtime\launcher.mjs"
if errorlevel 1 pause
endlocal
