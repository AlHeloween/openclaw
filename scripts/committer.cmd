@echo off
setlocal enabledelayedexpansion

rem Prevent recursive calls: if OPENCLAW_COMMITTER_SH_RUNNING is set, we're already inside the bash wrapper
if defined OPENCLAW_COMMITTER_SH_RUNNING (
    echo Error: committer.cmd called recursively. This should not happen. >&2
    exit /b 1
)

rem Find git bash: check common installation paths
set "BASH_PATH="
if exist "C:\Program Files\Git\bin\bash.exe" set "BASH_PATH=C:\Program Files\Git\bin\bash.exe"
if not defined BASH_PATH if exist "C:\Program Files (x86)\Git\bin\bash.exe" set "BASH_PATH=C:\Program Files (x86)\Git\bin\bash.exe"
if not defined BASH_PATH where bash >nul 2>&1 && set "BASH_PATH=bash"

if not defined BASH_PATH (
    echo Error: Git Bash not found. Install Git for Windows from https://git-scm.com/download/win >&2
    exit /b 1
)

rem Get the directory of this script
set "SCRIPT_DIR=%~dp0"

rem Set environment variable to prevent recursive calls
set "OPENCLAW_COMMITTER_SH_RUNNING=1"

rem Build the full script path (use forward slashes for bash)
set "SCRIPT_PATH=%SCRIPT_DIR%committer.sh"
set "SCRIPT_PATH=%SCRIPT_PATH:\=/%"

rem Remove trailing slash
if "%SCRIPT_PATH:~-1%"=="/" set "SCRIPT_PATH=%SCRIPT_PATH:~0,-1%"

rem Execute the bash script, passing all arguments
"%BASH_PATH%" "%SCRIPT_PATH%" %*

