@echo off
setlocal

echo.
echo ==========================================
echo   ESSL Internal Attendance System - Git Setup
echo ==========================================
echo.

REM Check if git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in your PATH.
    echo Please install Git from https://git-scm.com/downloads
    pause
    exit /b 1
)

echo [INFO] Git found. Initializing repository...
if not exist ".git" (
    git init
) else (
    echo [INFO] .git folder already exists. Skipping init.
)

echo [INFO] Adding files...
git add .

echo [INFO] Committing files...
git commit -m "Initial commit of ESSL Attendance System (Phase 1)"

echo.
echo ==========================================
echo   Push to GitHub
echo ==========================================
echo.
set /p REMOTE_URL="Enter your GitHub Repository URL (e.g., https://github.com/user/repo.git): "

if "%REMOTE_URL%"=="" (
    echo [ERROR] No URL provided. Exiting.
    pause
    exit /b 1
)

echo [INFO] Setting remote origin...
git remote remove origin 2>nul
git remote add origin %REMOTE_URL%

echo [INFO] Renaming branch to main...
git branch -M main

echo [INFO] Pushing to GitHub...
git push -u origin main

if %errorlevel% equ 0 (
   echo.
   echo [SUCCESS] Project uploaded successfully!
) else (
   echo.
   echo [ERROR] Push failed. Please check your URL and credentials.
)

pause
