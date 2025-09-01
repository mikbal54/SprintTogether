# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app

# Install all deps (including dev) for building
COPY package*.json ./
RUN npm install
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build NestJS app
RUN npm run build

# Stage 2: production runtime
FROM node:20-alpine
WORKDIR /app

# Install only production deps + Prisma client
COPY package*.json ./
RUN npm install --production
RUN npm install @prisma/client

# Copy compiled JS and generated Prisma client
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

# Copy and setup startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Start the app with migrations
CMD ["/app/start.sh"]

#RUN npx prisma migrate deploy

# Start the app (without PM2)
#CMD ["node", "dist/src/main.js"]

# pm2 not supported yet
# RUN npm install -g pm2
# CMD ["pm2-runtime", "dist/src/main.js"]
