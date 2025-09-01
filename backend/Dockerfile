# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (including dev) for building
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: production runtime
FROM node:20-alpine
WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm install --production

# Copy only compiled JS from build stage
COPY --from=build /app/dist ./dist

# If prisma client is generated during build, copy it too
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/main"]