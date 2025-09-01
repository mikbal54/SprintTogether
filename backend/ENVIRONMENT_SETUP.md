# Environment Variables Setup

This document describes the environment variables needed to run the SprintTogether backend application.

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Database Configuration
DATABASE_URL=postgres://username:password@localhost:5432/sprinttogether
POSTGRES_USER=username
POSTGRES_PASSWORD=password
POSTGRES_DB=sprinttogether

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth0 Configuration
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret

# Frontend Configuration
FRONTEND_URL=http://localhost:5173

# Application Configuration
NODE_ENV=development
PORT=3000
```

## Frontend URL Configuration

The `FRONTEND_URL` environment variable is used to configure:

1. **CORS Origins**: Allows requests from the frontend application
2. **Auth0 Redirects**: Where users are redirected after login/logout
3. **WebSocket CORS**: Allows WebSocket connections from the frontend

### Default Value
If `FRONTEND_URL` is not set, it defaults to `http://localhost:5173`.

### Production Setup
For production deployments, set `FRONTEND_URL` to your production frontend URL:
```bash
FRONTEND_URL=https://your-frontend-domain.com
```

### Development Setup
For local development, you can use the default or set it explicitly:
```bash
FRONTEND_URL=http://localhost:5173
```

## Docker Environment
When running with Docker, you can set these environment variables in your docker-compose.yml or pass them as environment variables to the container.

## Security Notes
- Never commit `.env` files to version control
- Use strong passwords for database connections
- Keep Auth0 credentials secure
- Use HTTPS URLs in production
