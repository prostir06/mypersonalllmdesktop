#!/bin/bash
# Docker troubleshooting and setup script

echo "🔧 LLM Assistant Docker Setup & Troubleshooting"
echo "================================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker is installed: $(docker --version)"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "⚠️  docker-compose not found, trying 'docker compose'..."
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "✅ Using: $COMPOSE_CMD"

# Check OPENAI_API_KEY
if [ -z "$OPENAI_API_KEY" ]; then
    echo ""
    echo "⚠️  WARNING: OPENAI_API_KEY is not set!"
    echo "Please set it before running docker-compose:"
    echo ""
    echo "  export OPENAI_API_KEY=sk_..."
    echo ""
    read -p "Enter your OpenAI API key (or press Enter to skip): " api_key
    if [ ! -z "$api_key" ]; then
        export OPENAI_API_KEY=$api_key
        echo "✅ API key set"
    fi
else
    echo "✅ OPENAI_API_KEY is set"
fi

# Clean up old containers
echo ""
echo "🧹 Cleaning up old containers..."
$COMPOSE_CMD down -v 2>/dev/null || true

# Build images
echo ""
echo "🔨 Building Docker images..."
$COMPOSE_CMD build --no-cache

if [ $? -eq 0 ]; then
    echo "✅ Images built successfully!"
    echo ""
    echo "🚀 Starting services..."
    $COMPOSE_CMD up -d
    
    echo ""
    echo "⏳ Waiting for services to be ready (30 seconds)..."
    sleep 30
    
    echo ""
    echo "📊 Service status:"
    $COMPOSE_CMD ps
    
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "🌐 Access the application at:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend:  http://localhost:5000"
    echo ""
    echo "📋 Useful commands:"
    echo "   $COMPOSE_CMD logs -f          # View logs"
    echo "   $COMPOSE_CMD down             # Stop services"
    echo "   $COMPOSE_CMD restart          # Restart services"
else
    echo "❌ Build failed!"
    echo ""
    echo "🔍 Troubleshooting tips:"
    echo "1. Check disk space: df -h"
    echo "2. Check Docker daemon: docker info"
    echo "3. View build logs: $COMPOSE_CMD build --no-cache 2>&1 | tail -50"
    echo "4. Check npm issues: $COMPOSE_CMD build --no-cache backend 2>&1 | grep -A5 npm"
    exit 1
fi
