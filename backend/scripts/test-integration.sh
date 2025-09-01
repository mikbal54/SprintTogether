#!/bin/bash

# Test setup script for WebSocket Gateway integration tests

echo "🚀 Setting up test environment..."

# Clean up any existing test containers from previous runs
echo "🧹 Cleaning up any existing test containers..."
docker-compose -f docker-compose.test.yml down -v 2>/dev/null || true

# Set up cleanup trap to ensure containers are removed even on script interruption
cleanup() {
    echo "🧹 Cleaning up on exit..."
    docker-compose -f docker-compose.test.yml down -v 2>/dev/null || true
}

trap cleanup EXIT INT TERM

# Start test database and Redis containers
echo "📦 Starting test containers..."
docker-compose -f docker-compose.test.yml up -d

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 10

# Check if database is ready
echo "🔍 Checking database connection..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
    if docker exec test-db pg_isready -U test_user -d test_taskman > /dev/null 2>&1; then
        echo "✅ Database is ready!"
        break
    fi
    echo "⏳ Waiting for database... (attempt $attempt/$max_attempts)"
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ Database failed to start within expected time"
    docker-compose -f docker-compose.test.yml logs test-db
    exit 1
fi

# Check if Redis is ready
echo "🔍 Checking Redis connection..."
max_attempts=15
attempt=1
while [ $attempt -le $max_attempts ]; do
    if docker exec test-redis redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis is ready!"
        break
    fi
    echo "⏳ Waiting for Redis... (attempt $attempt/$max_attempts)"
    sleep 1
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ Redis failed to start within expected time"
    docker-compose -f docker-compose.test.yml logs test-redis
    exit 1
fi

# Set environment variables for test database
export DATABASE_URL="postgresql://test_user:test_password@localhost:5433/test_taskman"
export REDIS_URL="redis://localhost:6380"
export JWT_SECRET="test-jwt-secret"
export NODE_ENV="test"

# Load test environment file if it exists
if [ -f ".env.test" ]; then
    echo "📄 Loading test environment variables from .env.test"
    export $(cat .env.test | grep -v '^#' | xargs)
fi

# Run database migrations
echo "🗄️ Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Install dependencies if needed
echo "📦 Installing dependencies..."
npm install

# Run the integration tests
echo "🧪 Running integration tests..."
jest --config ./test/jest-integration.json

# Clean up
echo "🧹 Cleaning up..."
docker-compose -f docker-compose.test.yml down -v

echo "✅ Test setup complete!"
