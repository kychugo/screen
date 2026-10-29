@echo off
setlocal EnableExtensions
title Screen Share USB Launcher

set "ROOT=%~dp0"
set "NODE_EXE="

rem Prefer a portable Node runtime stored beside this file.
for %%P in ("%ROOT%node\node.exe" "%ROOT%nodejs\node.exe" "%ROOT%runtime-node\node.exe") do (
  if not defined NODE_EXE if exist "%%~P" set "NODE_EXE=%%~P"
)

rem Fall back to a normal Windows Node installation.
if not defined NODE_EXE for /f "delims=" %%P in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%P"

if not defined NODE_EXE (
  echo Node.js was not found. Downloading a portable copy to this USB drive...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $arch=if([Environment]::Is64BitOperatingSystem){'x64'}else{'x86'}; $release=$null; foreach($candidate in (Invoke-RestMethod 'https://nodejs.org/dist/index.json')){if($candidate.lts -and $candidate.version -like 'v22.*'){$release=$candidate; break}}; if(-not $release){throw 'Could not find a supported Node.js release.'}; $zipName='node-'+$release.version+'-win-'+$arch+'.zip'; $zip=Join-Path $env:TEMP $zipName; Invoke-WebRequest ('https://nodejs.org/dist/'+$release.version+'/'+$zipName) -OutFile $zip; $target=Join-Path '%ROOT%' 'runtime-node'; if(Test-Path $target){Remove-Item $target -Recurse -Force}; $temp=Join-Path $env:TEMP ('screen-node-'+[guid]::NewGuid()); Expand-Archive $zip $temp; Move-Item (Join-Path $temp ('node-'+$release.version+'-win-'+$arch)) $target; Remove-Item $temp -Recurse -Force; Remove-Item $zip -Force"
  if errorlevel 1 (
    echo.
    echo Could not install Node.js automatically. Check your internet connection and run this file again.
    pause
    exit /b 1
  )
  set "NODE_EXE=%ROOT%runtime-node\node.exe"
)

echo Using Node.js: %NODE_EXE%
set "NPM_CMD=npm"
if exist "%ROOT%runtime-node\node_modules\npm\bin\npm-cli.js" set "NPM_CMD=%ROOT%runtime-node\node_modules\npm\bin\npm-cli.js"
if not exist "%ROOT%node_modules\ws" (
  echo Installing the server library on this USB drive...
  if "%NPM_CMD%"=="npm" (
    npm install --prefix "%ROOT%" --no-audit --no-fund
  ) else (
    "%NODE_EXE%" "%NPM_CMD%" install --prefix "%ROOT%" --no-audit --no-fund
  )
  if errorlevel 1 (
    echo.
    echo Library installation failed. Check your internet connection and run this file again.
    pause
    exit /b 1
  )
)

echo Starting Screen Share at http://localhost:3000
start "" http://localhost:3000
echo.
echo Keep this window open while you are sharing your screen.
echo Press Ctrl+C here to stop the server.
echo.
"%NODE_EXE%" "%ROOT%server.js"
echo.
echo The server stopped. Review the error above if one was shown.
pause
endlocal