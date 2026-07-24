@echo off
REM Docker troubleshooting and setup script for Windows PowerShell

echo.
echo 🔧 LLM Assistant Docker Setup ^& Troubleshooting
echo ================================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

echo ✅ Docker is installed: 
docker --version

echo.

REM Check OPENAI_API_KEY
if "%OPENAI_API_KEY%"=="" (
    echo ⚠️  WARNING: OPENAI_API_KEY is not set!
    echo Please set it before running docker-compose:
    echo.
    echo   $env:OPENAI_API_KEY="sk_..."
    echo.
    set /p api_key="Enter your OpenAI API key (or press Enter to skip): "
    if not "!api_key!"=="" (
        set OPENAI_API_KEY=!api_key!
        echo ✅ API key set
    )
) else (
    echo ✅ OPENAI_API_KEY is set
)

echo.
echo 🧹 Cleaning up old containers...
docker-compose down -v 2>nul

echo.
echo 🔨 Building Docker images...
docker-compose build --no-cache

if errorlevel 1 (
    echo.
    echo ❌ Build failed!
    echo.
    echo 🔍 Troubleshooting tips:
    echo 1. Check disk space
    echo 2. Check Docker Desktop is running
    echo 3. View full build logs: docker-compose build --no-cache 2^>^&1 ^| findstr npm
    exit /b 1
)

echo ✅ Images built successfully!
echo.
echo 🚀 Starting services...
docker-compose up -d

echo.
echo ⏳ Waiting for services to be ready (30 seconds^)...
timeout /t 30 /nobreak

echo.
echo 📊 Service status:
docker-compose ps

echo.
echo ✅ Setup complete!
echo.
echo 🌐 Access the application at:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:5000
echo.
echo 📋 Useful commands:
echo    docker-compose logs -f          # View logs
echo    docker-compose down             # Stop services
echo    docker-compose restart          # Restart services
echo.
