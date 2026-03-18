@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo =========================================
echo   GitHub Publish Assistant
echo =========================================

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Git is not installed or not in PATH.
  pause
  exit /b 1
)

set "GH_USER=DommLee"
set /p "INPUT_GH_USER=GitHub username [%GH_USER%]: "
if not "!INPUT_GH_USER!"=="" set "GH_USER=!INPUT_GH_USER!"

set "REPO_NAME=ai-climate-platform"
set /p "INPUT_REPO=Repository name [%REPO_NAME%]: "
if not "!INPUT_REPO!"=="" set "REPO_NAME=!INPUT_REPO!"

set "GIT_NAME=!GH_USER!"
set /p "INPUT_GIT_NAME=Git commit name [%GIT_NAME%]: "
if not "!INPUT_GIT_NAME!"=="" set "GIT_NAME=!INPUT_GIT_NAME!"

set "GIT_EMAIL=!GH_USER!@users.noreply.github.com"
set /p "INPUT_GIT_EMAIL=Git commit email [%GIT_EMAIL%]: "
if not "!INPUT_GIT_EMAIL!"=="" set "GIT_EMAIL=!INPUT_GIT_EMAIL!"

set "COMMIT_MSG=chore: initial secure release"
set /p "INPUT_COMMIT_MSG=Commit message [%COMMIT_MSG%]: "
if not "!INPUT_COMMIT_MSG!"=="" set "COMMIT_MSG=!INPUT_COMMIT_MSG!"

echo.
echo Setting local git identity...
git config user.name "!GIT_NAME!"
git config user.email "!GIT_EMAIL!"

echo Switching to main branch...
git branch -M main

echo Staging files...
git add .

git diff --cached --quiet
if !ERRORLEVEL! EQU 0 (
  echo No staged changes detected. Skipping commit.
) else (
  echo Creating commit...
  git commit -m "!COMMIT_MSG!"
  if !ERRORLEVEL! NEQ 0 (
    echo Commit failed. Please inspect output above.
    pause
    exit /b 1
  )
)

set "REMOTE_URL=https://github.com/!GH_USER!/!REPO_NAME!.git"
echo Configuring origin: !REMOTE_URL!
git remote get-url origin >nul 2>&1
if !ERRORLEVEL! EQU 0 (
  git remote set-url origin "!REMOTE_URL!"
) else (
  git remote add origin "!REMOTE_URL!"
)

echo.
echo Pushing to GitHub...
git push -u origin main
if !ERRORLEVEL! NEQ 0 (
  echo Push failed.
  echo 1^) Ensure repository exists: https://github.com/!GH_USER!/!REPO_NAME!
  echo 2^) Authenticate git (GitHub Desktop or PAT/credential manager).
  pause
  exit /b 1
)

echo.
echo Publish completed successfully.
echo Remote: !REMOTE_URL!
pause
endlocal
exit /b 0
