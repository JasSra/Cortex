#!/bin/bash

# Cortex Startup Script
# Starts the complete Cortex application stack

set -e

echo "🧠 Starting Cortex - Voice-First Notes Brain"
echo "=========================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    echo "❌ docker-compose not found. Please install docker-compose."
    exit 1
fi

echo "✅ Docker is running"

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/raw
mkdir -p data/sqlite

# Start services
echo "🚀 Starting Cortex services..."
docker-compose up -d

echo "⏳ Waiting for services to start..."

# Wait for backend to be ready
echo "   Waiting for backend API..."
timeout=60
while [ $timeout -gt 0 ]; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo "   ✅ Backend API is ready"
        break
    fi
    sleep 2
    timeout=$((timeout - 2))
done

if [ $timeout -le 0 ]; then
    echo "   ❌ Backend API failed to start within 60 seconds"
    echo "   Check logs with: docker-compose logs backend"
    exit 1
fi

# Wait for frontend to be ready
echo "   Waiting for frontend..."
timeout=60
while [ $timeout -gt 0 ]; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "   ✅ Frontend is ready"
        break
    fi
    sleep 2
    timeout=$((timeout - 2))
done

if [ $timeout -le 0 ]; then
    echo "   ❌ Frontend failed to start within 60 seconds"
    echo "   Check logs with: docker-compose logs frontend"
    exit 1
fi

# Seed with example data
echo "🌱 Seeding with example data..."
if [ -f "./scripts/seed.sh" ]; then
    ./scripts/seed.sh
else
    echo "⚠️  Seed script not found, skipping initial data load"
fi

echo ""
echo "🎉 Cortex is now running!"
echo ""
echo "📱 Access Points:"
echo "   🌐 Frontend:    http://localhost:3000"
echo "   🔧 API:         http://localhost:8080"
echo "   📚 API Docs:    http://localhost:8080/swagger"
echo "   🔍 Redis:       http://localhost:8001"
echo ""
echo "🎮 Quick Actions:"
echo "   • Upload documents via drag-and-drop"
echo "   • Use voice commands with the microphone button"
echo "   • Search through your knowledge base"
echo ""
echo "🛠️  Management Commands:"
echo "   • View logs:    docker-compose logs [service]"
echo "   • Stop:         docker-compose down"
echo "   • Restart:      docker-compose restart [service]"
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "Ready for voice-first knowledge management! 🧠✨"
